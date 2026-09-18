/**
 * POST /api/content/generate-creative
 *
 * Renders a branded PNG creative (via next/og's ImageResponse — see
 * src/lib/marketing/creative-templates.tsx) from a content_suggestion's
 * linked product/media, uploads it to the same R2 bucket used by the
 * media library, records it as a content_media row, and attaches it to
 * the suggestion as creative_media_id.
 */

import { NextResponse } from 'next/server'
import { ImageResponse } from 'next/og'
import { AwsClient } from 'aws4fetch'
import { createClient } from '@/lib/supabase/server'
import { renderCreative, CREATIVE_SIZE, type CreativeTemplate } from '@/lib/marketing/creative-templates'

function getMediaPublicUrl(storageKey: string): string | null {
  const base = process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL
  if (!base) return null
  return `${base.replace(/\/$/, '')}/${storageKey}`
}

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

    const { suggestion_id, template } = await request.json() as {
      suggestion_id?: string
      template?: CreativeTemplate
    }

    if (!suggestion_id || !template) {
      return NextResponse.json({ error: 'suggestion_id and template are required' }, { status: 400 })
    }

    const { data: suggestion } = await (supabase as any)
      .from('content_suggestions')
      .select('source_product_id, source_media_id, notes, script')
      .eq('id', suggestion_id)
      .single() as { data: { source_product_id: string | null; source_media_id: string | null; notes: string | null; script: string | null } | null }

    if (!suggestion) {
      return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 })
    }

    let productName: string | null = null
    let price: number | null = null
    if (suggestion.source_product_id) {
      const { data: product } = await supabase
        .from('products')
        .select('name, current_selling_price')
        .eq('id', suggestion.source_product_id)
        .single() as { data: { name: string; current_selling_price: number } | null }
      if (product) {
        productName = product.name
        price = Number(product.current_selling_price)
      }
    }

    let photoUrl: string | null = null
    if (suggestion.source_media_id) {
      const { data: media } = await supabase
        .from('content_media')
        .select('media_type, storage_key')
        .eq('id', suggestion.source_media_id)
        .single() as { data: { media_type: string; storage_key: string } | null }
      if (media && media.media_type === 'image') {
        photoUrl = getMediaPublicUrl(media.storage_key)
      }
    }

    const jsx = await renderCreative(template, {
      photoUrl,
      productName,
      price,
      notes: suggestion.notes,
      script: suggestion.script,
    })
    const imageResponse = new ImageResponse(jsx, CREATIVE_SIZE)
    const pngBuffer = Buffer.from(await imageResponse.arrayBuffer())

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

    const key = `creatives/${crypto.randomUUID()}.png`
    const r2 = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' })
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`
    const putRes = await r2.fetch(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: pngBuffer,
    })
    if (!putRes.ok) {
      console.error('[generate-creative] R2 upload failed', putRes.status, await putRes.text())
      return NextResponse.json({ error: 'Failed to upload the generated creative' }, { status: 502 })
    }

    const { data: newMedia, error: mediaError } = await (supabase as any)
      .from('content_media')
      .insert({
        media_type: 'image',
        storage_key: key,
        original_filename: `creative-${template}-${Date.now()}.png`,
        mime_type: 'image/png',
        size_bytes: pngBuffer.byteLength,
        uploaded_by: user.id,
      })
      .select()
      .single()

    if (mediaError) {
      return NextResponse.json({ error: mediaError.message }, { status: 500 })
    }

    const { error: attachError } = await (supabase as any)
      .from('content_suggestions')
      .update({ creative_media_id: newMedia.id })
      .eq('id', suggestion_id)

    if (attachError) {
      return NextResponse.json({ error: attachError.message }, { status: 500 })
    }

    return NextResponse.json({ media: newMedia })
  } catch (err: any) {
    console.error('[generate-creative]', err)
    return NextResponse.json({ error: err?.message || 'Failed to generate creative' }, { status: 500 })
  }
}
