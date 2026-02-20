/**
 * QZ Tray print bridge.
 *
 * QZ Tray (https://qz.io) is a lightweight Java app that runs in the
 * background on the local machine and exposes a WebSocket server on
 * localhost:8182.  Any browser — including a page served from a remote
 * HTTPS origin like app.sydconstruct.com — can connect to it because
 * browsers treat `localhost` as a secure context regardless of the
 * page's origin.
 *
 * On first connection from a new origin QZ Tray may show a one-time
 * "Allow this site?" prompt.  Production deployments should add a
 * signed certificate (see /api/qz/certificate and /api/qz/sign) so
 * the connection is silently trusted every time.
 *
 * Supported platforms: macOS, Windows, Linux (anywhere QZ Tray runs).
 * Android / iOS: NOT supported — QZ Tray has no mobile client.
 */

// qz-tray ships as a plain JS UMD bundle; use a dynamic import so
// Next.js never tries to SSR it (it requires `window` / WebSocket).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QZInstance = any

let _qz: QZInstance | null = null

async function loadQZ(): Promise<QZInstance> {
  if (_qz) return _qz
  if (typeof window === 'undefined') throw new Error('QZ Tray is browser-only')
  // Dynamic import avoids SSR and lets Next.js tree-shake it from the server bundle
  const mod = await import('qz-tray')
  _qz = mod.default ?? mod
  return _qz
}

// ---------------------------------------------------------------------------
// Optional: signed certificate so QZ Tray silently trusts this origin.
// Set up /api/qz/certificate and /api/qz/sign routes, then set
// QZ_SIGNING_ENABLED=true in your environment to activate this.
// Without signing the user will see a one-time "Allow?" popup in QZ Tray.
// ---------------------------------------------------------------------------

async function configureSigning(qz: QZInstance): Promise<void> {
  // Ask the server for the public certificate QZ Tray should trust
  qz.security.setCertificatePromise((_resolve: (v: string) => void, reject: (e: unknown) => void) => {
    fetch('/api/qz/certificate')
      .then((r) => r.text())
      .then(_resolve)
      .catch(reject)
  })

  // Ask the server to sign each QZ Tray challenge with our private key
  qz.security.setSignatureAlgorithm('SHA512')
  qz.security.setSignaturePromise(
    (toSign: string) =>
      (resolve: (v: string) => void, reject: (e: unknown) => void) => {
        fetch('/api/qz/sign', { method: 'POST', body: toSign })
          .then((r) => r.text())
          .then(resolve)
          .catch(reject)
      }
  )
}

// ---------------------------------------------------------------------------
// Connection management
// ---------------------------------------------------------------------------

let _connectPromise: Promise<QZInstance> | null = null

export async function connectQZ(): Promise<QZInstance> {
  // Reuse an in-flight connect attempt
  if (_connectPromise) return _connectPromise

  _connectPromise = (async () => {
    const qz = await loadQZ()

    // Wire up signing if the API routes exist (non-fatal if they don't)
    try {
      await configureSigning(qz)
    } catch {
      // Signing not configured — QZ Tray will show a one-time Allow popup
    }

    if (!qz.websocket.isActive()) {
      await qz.websocket.connect({ retries: 2, delay: 1 })
    }

    return qz
  })()

  try {
    return await _connectPromise
  } catch (err) {
    _connectPromise = null
    throw err
  }
}

/** Returns true if QZ Tray is installed and reachable on this machine. */
export async function isQZAvailable(): Promise<boolean> {
  try {
    await connectQZ()
    return true
  } catch {
    return false
  }
}

/** Returns the list of printer names visible to QZ Tray on this machine. */
export async function listQZPrinters(): Promise<string[]> {
  try {
    const qz = await connectQZ()
    const printers: string[] = await qz.printers.find()
    return Array.isArray(printers) ? printers : [printers]
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Printing
// ---------------------------------------------------------------------------

/**
 * Sends raw ESC/POS bytes to the named printer via QZ Tray.
 *
 * @param bytes       - The ESC/POS payload (already built by buildReceiptBytes)
 * @param printerName - The OS printer name (same as the CUPS queue name on macOS)
 */
export async function printWithQZ(bytes: Uint8Array, printerName: string): Promise<void> {
  const qz = await connectQZ()

  const config = qz.configs.create(printerName)

  // Convert Uint8Array → base64 (browser-safe)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  const base64 = btoa(binary)

  await qz.print(config, [{ type: 'raw', format: 'base64', data: base64 }])
}
