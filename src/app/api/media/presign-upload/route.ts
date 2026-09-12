/**
 * POST /api/media/presign-upload
 *
 * Returns a short-lived presigned PUT URL for uploading a file directly to
 * the Cloudflare R2 bucket used by the content media library — the browser
 * uploads straight to R2 with this URL, the file bytes never pass through
 * this route or through Vercel's serverless function body-size limit
 * (a few MB, far too small for real video files).
 *
 * Requires these env vars (server-only, never NEXT_PUBLIC_*):
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_R2_ACCESS_KEY_ID
 *   CLOUDFLARE_R2_SECRET_ACCESS_KEY
 *   CLOUDFLARE_R2_BUCKET
 */

import { NextResponse } from 'next/server'
import { AwsClient } from 'aws4fetch'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
  'video/mp4', 'video/quicktime', 'video/webm',
]

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: staffUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single() as { data: { role: string } | null }

    if (!staffUser || !['admin', 'manager'].includes(staffUser.role)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const { filename, contentType } = await request.json() as { filename: string; contentType: string }

    if (!filename || !contentType) {
      return NextResponse.json({ error: 'filename and contentType are required' }, { status: 400 })
    }
    if (!ALLOWED_MIME_TYPES.includes(contentType)) {
      return NextResponse.json({ error: `Unsupported file type: ${contentType}` }, { status: 400 })
    }

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
    const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID
    const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
    const bucket = process.env.CLOUDFLARE_R2_BUCKET

    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
      return NextResponse.json(
        { error: 'R2 is not configured on the server (missing CLOUDFLARE_* env vars)' },
        { status: 500 }
      )
    }

    const ext = filename.split('.').pop() || 'bin'
    const key = `${crypto.randomUUID()}.${ext}`

    // R2's hostname doesn't match AWS's bucket.s3.region.amazonaws.com
    // pattern aws4fetch would otherwise try to auto-detect service/region
    // from — Cloudflare's own docs specify these exact values for R2.
    const r2 = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' })
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`

    // aws4fetch signs a real Request; a HEAD-like signed PUT with no body
    // here just produces the signed URL/headers we hand back to the
    // browser, which then performs the actual PUT with the file bytes.
    const signed = await r2.sign(
      new Request(endpoint, { method: 'PUT', headers: { 'Content-Type': contentType } }),
      { aws: { signQuery: true } }
    )

    return NextResponse.json({ uploadUrl: signed.url, key })
  } catch (err: any) {
    console.error('[presign-upload]', err)
    return NextResponse.json({ error: err?.message || 'Failed to create upload URL' }, { status: 500 })
  }
}
