/**
 * POST /api/qz/sign
 *
 * Signs the QZ Tray challenge string with the RSA-SHA512 private key so
 * that QZ Tray silently trusts connections from this origin without
 * showing the user an "Allow?" popup.
 *
 * Body:  plain-text challenge string sent by the qz-tray.js library.
 * Returns: base64-encoded RSA-SHA512 signature.
 */
import { createSign } from 'crypto'

export async function POST(request: Request) {
  const privateKey = process.env.QZ_PRIVATE_KEY
  if (!privateKey) {
    return new Response('QZ_PRIVATE_KEY not configured', { status: 404 })
  }

  const toSign = await request.text()

  try {
    const sign = createSign('SHA512')
    sign.update(toSign)
    // Env vars store \n as a literal backslash-n — restore real newlines
    const signature = sign.sign(privateKey.replace(/\\n/g, '\n'), 'base64')
    return new Response(signature, { headers: { 'Content-Type': 'text/plain' } })
  } catch (err: any) {
    console.error('[qz/sign]', err)
    return new Response(err?.message || 'Signing failed', { status: 500 })
  }
}
