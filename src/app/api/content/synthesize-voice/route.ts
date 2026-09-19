/**
 * POST /api/content/synthesize-voice
 *
 * Turns a suggestion's (staff-reviewed) voice_script into an MP3 via
 * Cloudflare Workers AI's MeloTTS model, uploads it to the same R2
 * bucket used by the media library, records it as a content_media row
 * (media_type: 'audio'), and attaches it to the suggestion.
 *
 * Requires CLOUDFLARE_API_TOKEN — a Workers AI-scoped token, separate
 * from the R2 access-key/secret pair used elsewhere (Cloudflare
 * dashboard → My Profile → API Tokens → Create Token → Workers AI
 * template) — plus the existing CLOUDFLARE_ACCOUNT_ID.
 *
 * Cloudflare's docs for this model don't fully specify whether the
 * plain REST endpoint (as opposed to a Workers binding) returns raw
 * binary audio or base64-encoded audio inside a JSON envelope, so this
 * route checks the response Content-Type and handles both.
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

    const { suggestion_id } = await request.json() as { suggestion_id?: string }
    if (!suggestion_id) {
      return NextResponse.json({ error: 'suggestion_id is required' }, { status: 400 })
    }

    const { data: suggestion } = await (supabase as any)
      .from('content_suggestions')
      .select('voice_script')
      .eq('id', suggestion_id)
      .single() as { data: { voice_script: string | null } | null }

    if (!suggestion?.voice_script?.trim()) {
      return NextResponse.json({ error: 'Write or generate a voice script first.' }, { status: 400 })
    }

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
    const apiToken = process.env.CLOUDFLARE_API_TOKEN
    if (!accountId || !apiToken) {
      return NextResponse.json(
        { error: 'Workers AI is not configured on the server (missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN)' },
        { status: 500 }
      )
    }

    const ttsRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/myshell-ai/melotts`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: suggestion.voice_script, lang: 'en' }),
      }
    )

    if (!ttsRes.ok) {
      const errBody = await ttsRes.text()
      console.error('[synthesize-voice] Workers AI error', ttsRes.status, errBody)
      return NextResponse.json({ error: 'Failed to synthesize narration — try again' }, { status: 502 })
    }

    const contentType = ttsRes.headers.get('content-type') || ''
    let mp3Buffer: Buffer

    if (contentType.includes('application/json')) {
      const data = await ttsRes.json() as { result?: { audio?: string }; success?: boolean; errors?: unknown[] }
      const base64Audio = data.result?.audio
      if (!base64Audio) {
        console.error('[synthesize-voice] Unexpected JSON response shape', JSON.stringify(data).slice(0, 500))
        return NextResponse.json({ error: 'Workers AI returned an unexpected response — try again' }, { status: 502 })
      }
      mp3Buffer = Buffer.from(base64Audio, 'base64')
    } else {
      // Raw binary audio (e.g. audio/mpeg) response path.
      mp3Buffer = Buffer.from(await ttsRes.arrayBuffer())
    }

    if (mp3Buffer.byteLength === 0) {
      return NextResponse.json({ error: 'Workers AI returned empty audio — try again' }, { status: 502 })
    }

    const r2AccessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID
    const r2SecretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
    const bucket = process.env.CLOUDFLARE_R2_BUCKET

    if (!r2AccessKeyId || !r2SecretAccessKey || !bucket) {
      return NextResponse.json(
        { error: 'R2 is not configured on the server (missing CLOUDFLARE_R2_* env vars)' },
        { status: 500 }
      )
    }

    const key = `voice/${crypto.randomUUID()}.mp3`
    const r2 = new AwsClient({ accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey, service: 's3', region: 'auto' })
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`
    const putRes = await r2.fetch(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'audio/mpeg' },
      body: new Uint8Array(mp3Buffer),
    })
    if (!putRes.ok) {
      console.error('[synthesize-voice] R2 upload failed', putRes.status, await putRes.text())
      return NextResponse.json({ error: 'Failed to store the narration audio' }, { status: 502 })
    }

    // MeloTTS's response doesn't include a duration figure — left null
    // rather than guessed. duration_seconds is otherwise a video-only
    // field; reused here for audio's sake rather than adding a new column.
    const { data: media, error: insertError } = await (supabase as any)
      .from('content_media')
      .insert({
        media_type: 'audio',
        storage_key: key,
        original_filename: `voice-${Date.now()}.mp3`,
        mime_type: 'audio/mpeg',
        size_bytes: mp3Buffer.byteLength,
        uploaded_by: user.id,
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    const { error: attachError } = await (supabase as any)
      .from('content_suggestions')
      .update({ voice_media_id: media.id })
      .eq('id', suggestion_id)

    if (attachError) {
      return NextResponse.json({ error: attachError.message }, { status: 500 })
    }

    return NextResponse.json({ media })
  } catch (err: any) {
    console.error('[synthesize-voice]', err)
    return NextResponse.json({ error: err?.message || 'Failed to synthesize narration' }, { status: 500 })
  }
}
