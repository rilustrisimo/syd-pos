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
import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const execFileAsync = promisify(execFile)

// ---------------------------------------------------------------------------
// GET /api/print  — list CUPS printers
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const { stdout } = await execFileAsync('lpstat', ['-p'])
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
    await execFileAsync('cupsenable', [printer]).catch(() => {
      // Not fatal — the printer may already be enabled
    })

    await execFileAsync('lp', ['-d', printer, '-o', 'raw', tmpFile])

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
