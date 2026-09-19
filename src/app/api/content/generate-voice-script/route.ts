/**
 * POST /api/content/generate-voice-script
 *
 * Rewrites a suggestion's script into a shorter, spoken-cadence version
 * for narration, via Gemini. Does not synthesize audio — staff review
 * and edit the spoken text first (same draft-then-use pattern as
 * captions), then trigger synthesize-voice separately once it reads
 * the way they want.
 *
 * Requires GEMINI_API_KEY (server-only, never NEXT_PUBLIC_*).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const GEMINI_MODEL = 'gemini-3.6-flash'

const VOICE_BRIEF = `You rewrite a social media post's script into a short voiceover
script for SYD Construction Supplies Trading, a hardware/construction
supplies store in Talakag, Bukidnon, Philippines. Spoken cadence: short
sentences, natural contractions, no bullet points, no emoji, no hashtags —
this will be read aloud by a text-to-speech voice over a 15-20 second
video clip. Keep the same key facts and tone as the original script, just
tighter and more natural to say out loud. Return only the rewritten
script text, nothing else.`

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
      .select('script')
      .eq('id', suggestion_id)
      .single() as { data: { script: string | null } | null }

    if (!suggestion?.script?.trim()) {
      return NextResponse.json({ error: 'This suggestion has no script to rewrite yet.' }, { status: 400 })
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: VOICE_BRIEF }] },
          contents: [{ role: 'user', parts: [{ text: suggestion.script }] }],
          generationConfig: {
            maxOutputTokens: 300,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    )

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text()
      console.error('[generate-voice-script] Gemini error', geminiRes.status, errBody)
      return NextResponse.json({ error: 'Failed to generate a voice script — try again' }, { status: 502 })
    }

    const geminiData = await geminiRes.json()
    const voice_script: string = (geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()

    if (!voice_script) {
      return NextResponse.json({ error: 'Gemini returned an empty voice script — try again' }, { status: 502 })
    }

    const { error: updateError } = await (supabase as any)
      .from('content_suggestions')
      .update({ voice_script })
      .eq('id', suggestion_id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ voice_script })
  } catch (err: any) {
    console.error('[generate-voice-script]', err)
    return NextResponse.json({ error: err?.message || 'Failed to generate voice script' }, { status: 500 })
  }
}
