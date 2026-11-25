/**
 * POST /api/content/generate-storyboard  { suggestion_id }
 *
 * Turns a reel post's narration into an animated-reel storyboard: one scene
 * per narration sentence (timed from voice_timepoints), with short on-screen
 * text, a cast character with a pose, and props tied to what's said — all
 * written by Gemini from the post's own idea, story and language, so the
 * visuals follow the story instead of a generic template. Saved to
 * content_suggestions.reel_storyboard for staff to edit before rendering.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireMarketingStaff } from '@/lib/marketing/staff-auth'
import { geminiJson, GeminiError } from '@/lib/marketing/gemini'
import { timepointsToSentences, sanitizeStoryboard, propForProduct, type Storyboard } from '@/lib/marketing/reel-styles'
import { STORYBOARD_SYSTEM, STORYBOARD_SCHEMA, storyboardPrompt, type GeminiScene } from '@/lib/marketing/storyboard-prompt'
import { CREATIVE_STYLES, isCreativeStyle } from '@/lib/marketing/creative-styles'
import { parseNarrationLanguage } from '@/lib/marketing/narration-language'

export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const auth = await requireMarketingStaff(supabase)
    if (auth.error) return auth.error
    const db = supabase as any

    const { suggestion_id } = await request.json() as { suggestion_id?: string }
    if (!suggestion_id) return NextResponse.json({ error: 'suggestion_id is required' }, { status: 400 })

    const { data: suggestion } = await db
      .from('content_suggestions')
      .select('id, format, voice_script, voice_timepoints, voice_media_id, source_product_id, creative_style, language, idea:content_ideas(title, angle, description)')
      .eq('id', suggestion_id)
      .single()
    if (!suggestion) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    if (!suggestion.voice_media_id || !Array.isArray(suggestion.voice_timepoints) || suggestion.voice_timepoints.length === 0) {
      return NextResponse.json({ error: 'Make the narration first (Voice → Synthesize). The animation is timed to it.' }, { status: 400 })
    }

    const sentences = timepointsToSentences(suggestion.voice_timepoints)
    const language = parseNarrationLanguage(suggestion.language)

    let productName: string | null = null
    let productImageUrl: string | null = null
    if (suggestion.source_product_id) {
      const { data: product } = await db
        .from('products')
        .select('name, images:product_images(url, is_primary, sort_order)')
        .eq('id', suggestion.source_product_id)
        .single()
      if (product) {
        productName = product.name
        const images = (product.images ?? []).sort((a: any, b: any) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order)
        productImageUrl = images[0]?.url ?? null
      }
    }

    const idea = suggestion.idea as { title?: string; angle?: string; description?: string } | null
    const styleKey: unknown = suggestion.creative_style
    const style = isCreativeStyle(styleKey) ? CREATIVE_STYLES[styleKey] : null
    const productProp = propForProduct(productName)
    const prompt = storyboardPrompt({ sentences, language, idea, style, productName, productProp })

    const result = await geminiJson<{ scenes: GeminiScene[] }>({
      feature: 'generate-storyboard',
      system: STORYBOARD_SYSTEM,
      prompt,
      schema: STORYBOARD_SCHEMA,
      maxOutputTokens: 2500,
      temperature: 0.8,
    })

    // One scene per sentence whatever Gemini returned; timing always comes
    // from the narration. First = hook, last = cta.
    const rawScenes = sentences.map((s, i) => {
      const g = result.scenes?.[i] ?? {}
      let role = g.role
      if (i === 0) role = 'hook'
      if (i === sentences.length - 1 && sentences.length > 1) role = 'cta'
      return {
        role,
        spoken: s.text,
        start: s.start,
        headline: g.headline || s.text.split(/\s+/).slice(0, 4).join(' '),
        sub: g.sub,
        stamp: g.stamp,
        items: g.items,
        character: g.character && g.character !== 'none' ? { cast: g.character, pose: g.pose, mood: g.mood } : undefined,
        props: g.props,
      }
    })
    // Stamps on at most 2 scenes, never repeated (the prompt asks; this enforces).
    const seenStamps = new Set<string>()
    for (const sc of rawScenes) {
      const key = sc.stamp?.trim().toLowerCase()
      if (!key) continue
      if (seenStamps.size >= 2 || seenStamps.has(key)) sc.stamp = undefined
      else seenStamps.add(key)
    }

    const storyboard: Storyboard | null = sanitizeStoryboard({ scenes: rawScenes, productName, productImageUrl })
    if (!storyboard) return NextResponse.json({ error: 'Gemini returned an unusable storyboard — try again' }, { status: 502 })
    const { error } = await db.from('content_suggestions').update({ reel_storyboard: storyboard }).eq('id', suggestion_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ storyboard })
  } catch (err: any) {
    if (err instanceof GeminiError) return NextResponse.json({ error: err.message }, { status: 502 })
    console.error('[generate-storyboard]', err)
    return NextResponse.json({ error: err?.message || 'Failed to make the storyboard' }, { status: 500 })
  }
}
