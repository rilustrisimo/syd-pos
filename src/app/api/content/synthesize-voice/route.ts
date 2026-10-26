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
import { splitIntoCaptionChunks, splitIntoSentences, captionChunksToSsml } from '@/lib/marketing/captions'
import { getNarrationVoice } from '@/lib/marketing/voices'
import { joinWav, parseWav, pcmSeconds } from '@/lib/marketing/wav'

const MAX_VOICE_SCRIPT_CHARS = 1500
const MAX_NARRATIONS_PER_MONTH = 300
const TTS_URL = 'https://texttospeech.googleapis.com'

interface SynthesizedNarration {
  audio: Buffer
  mime: string
  ext: string
  durationSeconds: number | null
  voiceTimepoints: { text: string; start: number }[] | null
}

async function callTts(accessToken: string, version: 'v1' | 'v1beta1', body: Record<string, unknown>) {
  const res = await fetch(`${TTS_URL}/${version}/text:synthesize`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`TTS ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json() as { audioContent?: string; timepoints?: { markName: string; timeSeconds: number }[] }
  if (!data.audioContent) throw new Error('TTS returned no audio')
  return data
}

/**
 * Neural2: one request as SSML with a mark before each caption chunk;
 * v1beta1 reports when each mark is reached, which times the captions.
 */
async function synthesizeWithMarks(accessToken: string, voiceId: string, script: string): Promise<SynthesizedNarration> {
  const chunks = splitIntoCaptionChunks(script)
  const data = await callTts(accessToken, 'v1beta1', {
    input: { ssml: captionChunksToSsml(chunks) },
    voice: { languageCode: 'en-US', name: voiceId },
    audioConfig: { audioEncoding: 'MP3' },
    enableTimePointing: ['SSML_MARK'],
  })
  // Null (not a partial list) when any mark is missing, so the reel
  // builder falls back to its even-spread timing.
  const marks = new Map((data.timepoints ?? []).map((t) => [t.markName, t.timeSeconds]))
  const voiceTimepoints = chunks.every((_, i) => marks.has(`c${i}`))
    ? chunks.map((text, i) => ({ text, start: Math.round(marks.get(`c${i}`)! * 1000) / 1000 }))
    : null
  return { audio: Buffer.from(data.audioContent!, 'base64'), mime: 'audio/mpeg', ext: 'mp3', durationSeconds: null, voiceTimepoints }
}

/**
 * Chirp 3 HD: far more natural, but returns no mark timepoints (tested).
 * Each sentence is synthesized on its own as uncompressed audio, so its
 * exact length is known; the pieces are joined into one WAV and every
 * sentence's start time is exact. Caption chunks inside a sentence are
 * spread by character count, which is close enough for short phrases.
 * Same total characters as one request, so the free tier is unaffected.
 */
async function synthesizeBySentence(accessToken: string, voiceId: string, script: string): Promise<SynthesizedNarration> {
  const sentences = splitIntoSentences(script)
  const pieces = await Promise.all(sentences.map(async (sentence) => {
    const data = await callTts(accessToken, 'v1', {
      input: { text: sentence },
      voice: { languageCode: 'en-US', name: voiceId },
      audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000 },
    })
    return parseWav(new Uint8Array(Buffer.from(data.audioContent!, 'base64')))
  }))

  const voiceTimepoints: { text: string; start: number }[] = []
  let cursor = 0
  sentences.forEach((sentence, i) => {
    const length = pcmSeconds(pieces[i])
    const chunks = splitIntoCaptionChunks(sentence)
    const chars = chunks.reduce((s, c) => s + c.length, 0) || 1
    let offset = 0
    for (const text of chunks) {
      voiceTimepoints.push({ text, start: Math.round((cursor + offset) * 1000) / 1000 })
      offset += (text.length / chars) * length
    }
    cursor += length
  })

  return {
    audio: Buffer.from(joinWav(pieces)),
    mime: 'audio/wav',
    ext: 'wav',
    durationSeconds: Math.round(cursor * 100) / 100,
    voiceTimepoints,
  }
}

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

    const { suggestion_id, voice: voiceId } = await request.json() as { suggestion_id?: string; voice?: string }
    if (!suggestion_id) {
      return NextResponse.json({ error: 'suggestion_id is required' }, { status: 400 })
    }
    const voice = getNarrationVoice(voiceId)

    const { data: suggestion } = await (supabase as any)
      .from('content_suggestions')
      .select('voice_script')
      .eq('id', suggestion_id)
      .single() as { data: { voice_script: string | null } | null }

    if (!suggestion?.voice_script?.trim()) {
      return NextResponse.json({ error: 'Write or generate a voice script first.' }, { status: 400 })
    }

    // Free-tier guard: the Cloud project has billing enabled (TTS requires
    // it), so nothing on Google's side stops charges. Chirp 3 HD and Neural2
    // are each free up to 1M characters/month; capping script length and
    // narrations per month keeps the worst case (incl. SSML mark overhead)
    // around 70% of that.
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

    let narration: SynthesizedNarration
    try {
      narration = voice.kind === 'chirp3hd'
        ? await synthesizeBySentence(accessToken, voice.id, suggestion.voice_script)
        : await synthesizeWithMarks(accessToken, voice.id, suggestion.voice_script)
    } catch (ttsErr: any) {
      console.error('[synthesize-voice] Google TTS error', ttsErr?.message)
      return NextResponse.json({ error: 'Failed to synthesize narration — try again' }, { status: 502 })
    }
    const { audio: mp3Buffer, voiceTimepoints } = narration

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

    const key = `voice/${crypto.randomUUID()}.${narration.ext}`
    const r2 = new AwsClient({ accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey, service: 's3', region: 'auto' })
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`
    const putRes = await r2.fetch(endpoint, {
      method: 'PUT',
      // Explicit Content-Length: R2 rejects PUTs without it
      // (MissingContentLength), and the Vercel runtime's fetch doesn't
      // always add it for a Uint8Array body.
      headers: { 'Content-Type': narration.mime, 'Content-Length': String(mp3Buffer.byteLength) },
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

    // duration_seconds is otherwise a video-only field, reused for audio;
    // known exactly for per-sentence (WAV) narration, null for MP3.
    const { data: media, error: insertError } = await (supabase as any)
      .from('content_media')
      .insert({
        media_type: 'audio',
        storage_key: key,
        original_filename: `voice-${voice.id.split('-').pop()}-${Date.now()}.${narration.ext}`,
        mime_type: narration.mime,
        size_bytes: mp3Buffer.byteLength,
        duration_seconds: narration.durationSeconds,
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
