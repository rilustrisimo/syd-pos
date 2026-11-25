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
import { NARRATION_LANGUAGE_RULES, parseNarrationLanguage } from '@/lib/marketing/narration-language'
import { geminiGenerate, GeminiError } from '@/lib/marketing/gemini'

// Gemini fallback (lib/marketing/gemini.ts) may try several models within 55 s.
export const maxDuration = 60

const VOICE_BRIEF = `You rewrite a social media post's script into a short voiceover
script for SYD Construction Supplies Trading, a hardware/construction
supplies store in Talakag, Bukidnon, Philippines. Spoken cadence: short
sentences, natural contractions, no bullet points, no emoji, no hashtags —
this will be read aloud by a text-to-speech voice over a 15-20 second
video clip. Keep the same key facts and tone as the original script, just
tighter and more natural to say out loud. If it ends with a call to
action, point to sydconstruct.com or to calling the store ("the number's
on screen") — never read out a phone number. Return only the rewritten
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

    const { suggestion_id, language: rawLanguage } = await request.json() as { suggestion_id?: string; language?: string }
    const language = parseNarrationLanguage(rawLanguage)
    if (!suggestion_id) {
      return NextResponse.json({ error: 'suggestion_id is required' }, { status: 400 })
    }

    const { data: suggestion } = await (supabase as any)
      .from('content_suggestions')
      .select('script, notes')
      .eq('id', suggestion_id)
      .single() as { data: { script: string | null; notes: string | null } | null }

    if (!suggestion?.script?.trim()) {
      return NextResponse.json({ error: 'This suggestion has no script to rewrite yet.' }, { status: 400 })
    }

    // Story posts (notes start "Story: <character> · problem <id>.") keep their character and beats.
    const story = suggestion.notes?.match(/^Story: ([^.]+)\./)?.[1]
    const storyRule = story ? `\n\nThis is a story post (${story}): keep the same character, the problem → fix beats and their order.` : ''

    let voice_script: string
    try {
      // Falls back to lighter models when one hits its free-tier limit.
      const { text } = await geminiGenerate({
        feature: 'generate-voice-script',
        system: `${VOICE_BRIEF}\n\nLanguage: ${NARRATION_LANGUAGE_RULES[language]}${storyRule}`,
        prompt: suggestion.script,
        // Bisaya runs longer than English for the same message.
        generationConfig: { maxOutputTokens: 600 },
      })
      voice_script = text.trim()
    } catch (err) {
      const message = err instanceof GeminiError ? err.message : 'Failed to generate a voice script — try again'
      return NextResponse.json({ error: message }, { status: 502 })
    }

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
