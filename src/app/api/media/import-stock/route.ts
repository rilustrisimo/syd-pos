/**
 * POST /api/media/import-stock
 *
 * Downloads a chosen stock-search result server-side and re-uploads it
 * to the same R2 bucket used by staff uploads, then inserts a
 * content_media row. Downloading-then-reuploading (rather than storing
 * the provider's URL directly) is required for Pixabay images
 * specifically (hotlinking not allowed) and applied uniformly here for
 * simplicity — see src/lib/marketing/stock-providers.ts.
 */

import { NextResponse } from 'next/server'
import { AwsClient } from 'aws4fetch'
import { createClient } from '@/lib/supabase/server'

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

    const { source, id, type, fullUrl, attribution, downloadLocation } = await request.json() as {
      source: 'pexels' | 'pixabay' | 'unsplash'
      id: string
      type: 'image' | 'video'
      fullUrl: string
      attribution: string
      downloadLocation?: string
    }

    if (!source || !id || !type || !fullUrl) {
      return NextResponse.json({ error: 'source, id, type, and fullUrl are required' }, { status: 400 })
    }

    // Unsplash's API Guidelines require registering a "download" event
    // separately from just displaying search results.
    if (source === 'unsplash' && downloadLocation && process.env.UNSPLASH_ACCESS_KEY) {
      try {
        await fetch(`${downloadLocation}${downloadLocation.includes('?') ? '&' : '?'}client_id=${process.env.UNSPLASH_ACCESS_KEY}`)
      } catch (err) {
        console.error('[import-stock] Unsplash download tracking failed (continuing anyway)', err)
      }
    }

    const assetRes = await fetch(fullUrl)
    if (!assetRes.ok) {
      return NextResponse.json({ error: 'Failed to download the selected media' }, { status: 502 })
    }
    const buffer = Buffer.from(await assetRes.arrayBuffer())
    const contentType = assetRes.headers.get('content-type') || (type === 'video' ? 'video/mp4' : 'image/jpeg')
    const ext = contentType.split('/')[1]?.split(';')[0] || (type === 'video' ? 'mp4' : 'jpg')

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

    const key = `stock/${crypto.randomUUID()}.${ext}`
    const r2 = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' })
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`
    const putRes = await r2.fetch(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: buffer,
    })
    if (!putRes.ok) {
      console.error('[import-stock] R2 upload failed', putRes.status, await putRes.text())
      return NextResponse.json({ error: 'Failed to store the imported media' }, { status: 502 })
    }

    const { data: media, error: insertError } = await (supabase as any)
      .from('content_media')
      .insert({
        media_type: type,
        storage_key: key,
        original_filename: `${source}-${id}.${ext}`,
        mime_type: contentType,
        size_bytes: buffer.byteLength,
        attribution: attribution || null,
        uploaded_by: user.id,
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ media })
  } catch (err: any) {
    console.error('[import-stock]', err)
    return NextResponse.json({ error: err?.message || 'Failed to import media' }, { status: 500 })
  }
}
