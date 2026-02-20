/**
 * GET /api/qz/certificate
 *
 * Returns the public X.509 certificate that QZ Tray should trust for this
 * site.  The certificate is stored in the QZ_CERTIFICATE environment variable
 * (newlines replaced with \n so it fits in a single env line).
 *
 * To add this cert to QZ Tray:
 *   1. Open QZ Tray → Advanced → Site Manager
 *   2. Add the domain (app.sydconstruct.com) and paste the certificate
 *   OR place the cert in ~/.qz/syd-pos.crt and QZ Tray will auto-trust it.
 */
import { NextResponse } from 'next/server'

export async function GET() {
  const cert = process.env.QZ_CERTIFICATE
  if (!cert) {
    return NextResponse.json({ error: 'QZ_CERTIFICATE not configured' }, { status: 404 })
  }
  // Env vars store \n as a literal backslash-n — restore real newlines
  return new Response(cert.replace(/\\n/g, '\n'), {
    headers: { 'Content-Type': 'text/plain' },
  })
}
