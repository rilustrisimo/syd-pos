/**
 * Next.js API route for thermal receipt printing.
 *
 * Receives pre-built ESC/POS bytes (base64-encoded) from the client and
 * sends them as a raw print job to the CUPS queue on the local machine.
 * Works with USB printer-class devices (e.g. VOZY G80 / STMicroelectronics
 * POS80) that macOS registers as a CUPS printer rather than a serial port.
 *
 * GET  /api/print  — list available CUPS printers
 * POST /api/print  — send a raw ESC/POS job to the named printer
 */

import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

// Use exec (shell mode via /bin/sh) so macOS CUPS binaries resolve correctly.
// Node.js child processes inherit a stripped PATH — inject the standard macOS
// system bin paths so CUPS commands (lp, lpstat, cupsenable) are found.
const execAsync = promisify(exec)
const SHELL_ENV = {
  ...process.env,
  PATH: '/usr/bin:/usr/sbin:/bin:/usr/local/bin:' + (process.env.PATH ?? ''),
}

// ---------------------------------------------------------------------------
// GET /api/print  — list CUPS printers
// ---------------------------------------------------------------------------

export async function GET() {
  // On Windows, CUPS is not available. USB printing is handled by Electron IPC
  // (window.electronPrint) when running inside the desktop app.
  if (process.platform === 'win32') {
    return NextResponse.json({ printers: [], platform: 'win32' })
  }

  try {
    const { stdout } = await execAsync('lpstat -p', { env: SHELL_ENV })
    const printers = stdout
      .split('\n')
      .filter((line) => line.startsWith('printer '))
      .map((line) => {
        // "printer <name> is idle."  |  "printer <name> disabled since …"
        const parts    = line.split(' ')
        const name     = parts[1]
        const isIdle   = line.includes(' is idle')
        const disabled = line.includes(' disabled ')
        return {
          name,
          status: isIdle ? 'idle' : disabled ? 'disabled' : 'busy',
        }
      })
    return NextResponse.json({ printers })
  } catch {
    return NextResponse.json({ printers: [] })
  }
}

// ---------------------------------------------------------------------------
// POST /api/print  — send raw ESC/POS bytes to a CUPS printer
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  // On Windows, USB printing goes through Electron IPC — CUPS is unavailable.
  if (process.platform === 'win32') {
    return NextResponse.json(
      { error: 'CUPS not available on Windows. Use Electron IPC (window.electronPrint) instead.' },
      { status: 501 }
    )
  }

  let tmpFile: string | null = null

  try {
    const body = await request.json()
    const { bytes, printer } = body as { bytes: string; printer: string }

    if (!bytes || !printer) {
      return NextResponse.json(
        { error: 'Missing required fields: bytes (base64) and printer (queue name)' },
        { status: 400 }
      )
    }

    // Decode the base64 ESC/POS payload
    const buffer = Buffer.from(bytes, 'base64')

    // Write to a temporary file so we can hand it to `lp`
    tmpFile = join(tmpdir(), `syd-receipt-${Date.now()}.bin`)
    await writeFile(tmpFile, buffer)

    // Re-enable the queue in case a previous job disabled it, then print raw
    await execAsync(`cupsenable "${printer}"`, { env: SHELL_ENV }).catch(() => {
      // Not fatal — the printer may already be enabled
    })

    await execAsync(`lp -d "${printer}" -o raw "${tmpFile}"`, { env: SHELL_ENV })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[print route]', err)
    return NextResponse.json(
      { error: err?.message || 'Print failed' },
      { status: 500 }
    )
  } finally {
    if (tmpFile) {
      await unlink(tmpFile).catch(() => {})
    }
  }
}
