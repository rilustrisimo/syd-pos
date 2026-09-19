/**
 * POST /api/content/synthesize-voice
 *
 * Turns a suggestion's (staff-reviewed) voice_script into an MP3 via
 * Google Cloud Text-to-Speech, uploads it to the same R2 bucket used
 * by the media library, records it as a content_media row (media_type:
 * 'audio'), and attaches it to the suggestion.
 *
 * Switched from Cloudflare Workers AI's MeloTTS model after confirming
 * (via direct testing and Cloudflare's own community forum) that model
 * currently fails ~100% of the time with a platform-side error, not
 * anything in our request.
 *
 * Requires GOOGLE_TTS_SERVICE_ACCOUNT_JSON — the full service account
 * key JSON (as one line) for a Google Cloud project with the
 * Text-to-Speech API enabled. Unlike Gemini, this API requires
 * OAuth2/service-account auth, not a simple API key — google-auth-library
 * handles exchanging the service account key for a short-lived access
 * token (the same role aws4fetch plays for R2's signing protocol).
 */

import { NextResponse } from 'next/server'
import { AwsClient } from 'aws4fetch'
import { GoogleAuth } from 'google-auth-library'
import { createClient } from '@/lib/supabase/server'

async function getGoogleAccessToken(): Promise<string> {
  const credentialsJson = process.env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON
  if (!credentialsJson) {
    throw new Error('GOOGLE_TTS_SERVICE_ACCOUNT_JSON is not configured on the server')
  }
  const credentials = JSON.parse(credentialsJson)
  const auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/cloud-platform'] })
  const client = await auth.getClient()
  const { token } = await client.getAccessToken()
  if (!token) throw new Error('Failed to obtain a Google Cloud access token')
  return token
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

    let accessToken: string
    try {
      accessToken = await getGoogleAccessToken()
    } catch (authErr: any) {
      console.error('[synthesize-voice] Google auth failed', authErr)
      return NextResponse.json({ error: 'Text-to-speech is not configured on the server' }, { status: 500 })
    }

    const ttsRes = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: { text: suggestion.voice_script },
        // Neural2 — noticeably more natural than Standard voices, and
        // this feature's volume (a handful of ~15-20s clips a week)
        // stays nowhere near even Neural2's smaller free allowance.
        voice: { languageCode: 'en-US', name: 'en-US-Neural2-C' },
        audioConfig: { audioEncoding: 'MP3' },
      }),
    })

    if (!ttsRes.ok) {
      const errBody = await ttsRes.text()
      console.error('[synthesize-voice] Google TTS error', ttsRes.status, errBody)
      return NextResponse.json({ error: 'Failed to synthesize narration — try again' }, { status: 502 })
    }

    const ttsData = await ttsRes.json() as { audioContent?: string }
    if (!ttsData.audioContent) {
      return NextResponse.json({ error: 'Google TTS returned no audio — try again' }, { status: 502 })
    }
    const mp3Buffer = Buffer.from(ttsData.audioContent, 'base64')

    const r2AccessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID
    const r2SecretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
    const bucket = process.env.CLOUDFLARE_R2_BUCKET

    if (!accountId || !r2AccessKeyId || !r2SecretAccessKey || !bucket) {
      return NextResponse.json(
        { error: 'R2 is not configured on the server (missing CLOUDFLARE_* env vars)' },
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

    // Google TTS doesn't return a duration figure — left null rather than
    // guessed. duration_seconds is otherwise a video-only field; reused
    // here for audio's sake rather than adding a new column.
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
