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
import { splitIntoCaptionChunks, captionChunksToSsml } from '@/lib/marketing/captions'

const MAX_VOICE_SCRIPT_CHARS = 1500
const MAX_NARRATIONS_PER_MONTH = 300

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

    // Free-tier guard: the Cloud project has billing enabled (TTS requires
    // it), so nothing on Google's side stops charges. Neural2 is free up to
    // 1M characters/month; capping script length and narrations per month
    // keeps the worst case (incl. SSML mark overhead) around half of that.
    if (suggestion.voice_script.length > MAX_VOICE_SCRIPT_CHARS) {
      return NextResponse.json(
        { error: `Voice script is too long (${suggestion.voice_script.length} characters, max ${MAX_VOICE_SCRIPT_CHARS}). Shorten it first.` },
        { status: 400 }
      )
    }
    const monthStart = new Date()
    monthStart.setUTCDate(1)
    monthStart.setUTCHours(0, 0, 0, 0)
    const { count: narrationsThisMonth } = await (supabase as any)
      .from('content_media')
      .select('id', { count: 'exact', head: true })
      .eq('media_type', 'audio')
      .gte('created_at', monthStart.toISOString())
    if ((narrationsThisMonth ?? 0) >= MAX_NARRATIONS_PER_MONTH) {
      return NextResponse.json(
        { error: `Monthly narration limit reached (${MAX_NARRATIONS_PER_MONTH}) — this keeps text-to-speech inside Google's free tier. It resets on the 1st.` },
        { status: 429 }
      )
    }

    let accessToken: string
    try {
      accessToken = await getGoogleAccessToken()
    } catch (authErr: any) {
      console.error('[synthesize-voice] Google auth failed', authErr)
      return NextResponse.json({ error: 'Text-to-speech is not configured on the server' }, { status: 500 })
    }

    // Sent as SSML with a mark before each caption chunk; v1beta1 reports
    // when each mark is reached (confirmed working with this Neural2 voice
    // against the live API), which times the reel builder's subtitles.
    const captionChunks = splitIntoCaptionChunks(suggestion.voice_script)

    const ttsRes = await fetch('https://texttospeech.googleapis.com/v1beta1/text:synthesize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: { ssml: captionChunksToSsml(captionChunks) },
        // Neural2 — noticeably more natural than Standard voices, and
        // this feature's volume (a handful of ~15-20s clips a week)
        // stays nowhere near even Neural2's smaller free allowance.
        voice: { languageCode: 'en-US', name: 'en-US-Neural2-C' },
        audioConfig: { audioEncoding: 'MP3' },
        enableTimePointing: ['SSML_MARK'],
      }),
    })

    if (!ttsRes.ok) {
      const errBody = await ttsRes.text()
      console.error('[synthesize-voice] Google TTS error', ttsRes.status, errBody)
      return NextResponse.json({ error: 'Failed to synthesize narration — try again' }, { status: 502 })
    }

    const ttsData = await ttsRes.json() as {
      audioContent?: string
      timepoints?: { markName: string; timeSeconds: number }[]
    }
    if (!ttsData.audioContent) {
      return NextResponse.json({ error: 'Google TTS returned no audio — try again' }, { status: 502 })
    }

    // Null (not a partial list) when any mark is missing, so the reel
    // builder falls back to its even-spread timing instead of drawing
    // misaligned subtitles.
    const markTimes = new Map((ttsData.timepoints ?? []).map((t) => [t.markName, t.timeSeconds]))
    const voiceTimepoints = captionChunks.every((_, i) => markTimes.has(`c${i}`))
      ? captionChunks.map((text, i) => ({ text, start: Math.round(markTimes.get(`c${i}`)! * 1000) / 1000 }))
      : null
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
      // Explicit Content-Length: R2 rejects PUTs without it
      // (MissingContentLength), and the Vercel runtime's fetch doesn't
      // always add it for a Uint8Array body.
      headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(mp3Buffer.byteLength) },
      body: new Uint8Array(mp3Buffer),
    })
    if (!putRes.ok) {
      const errBody = await putRes.text()
      console.error('[synthesize-voice] R2 upload failed', putRes.status, errBody)
      // R2's S3-style error code (e.g. InvalidAccessKeyId, NoSuchBucket) is
      // safe to show and says which R2 setting on the server is wrong.
      const code = errBody.match(/<Code>([^<]+)<\/Code>/)?.[1] ?? `HTTP ${putRes.status}`
      return NextResponse.json({ error: `Failed to store the narration audio (R2: ${code})` }, { status: 502 })
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
      .update({ voice_media_id: media.id, voice_timepoints: voiceTimepoints })
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
