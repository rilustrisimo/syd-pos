/**
 * POST /api/content/generate-storyboard  { suggestion_id }
 *
 * Turns a reel post's narration into an animated-reel storyboard: one scene
 * per narration sentence (timed from voice_timepoints), with short on-screen
 * text written by Gemini. Saved to content_suggestions.reel_storyboard so
 * staff can edit it in the Animated reel dialog before rendering.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireMarketingStaff } from '@/lib/marketing/staff-auth'
import { geminiJson, GeminiError } from '@/lib/marketing/gemini'
import { timepointsToSentences, type Storyboard, type StoryboardScene, type SceneRole } from '@/lib/marketing/reel-styles'

export const maxDuration = 60

const SYSTEM = `You write the ON-SCREEN TEXT for a short animated social-media reel for
SYD Construction Supplies Trading, a hardware/construction supplies store in
Talakag, Bukidnon, Philippines. A narrator reads the script; your text appears
on screen, one scene per narration sentence, so it must echo what is being
said at that moment — punchy, never a full sentence.

Rules:
- headline: 1–4 words, the key idea of that sentence (Taglish is fine).
- sub: optional, at most 6 words, only when it adds something.
- stamp: optional 1–2 words with "!" for emphasis (e.g. "Matibay!"), at most one per scene.
- items: only for "proof" scenes that list things — 2 or 3 entries of at most 4 words each.
- role: the FIRST scene is "hook", the LAST scene is "cta"; a scene about the
  product itself is "product"; anything listing reasons/options/steps is "proof".
- Use ONLY what the narrator says in that sentence. Never add prices, discounts,
  delivery promises, schedules ("araw-araw", "24/7") or qualities ("mabilis",
  "pinakamura") that the narrator doesn't say.
- The cta headline is a short action like "Order online" or "Call us"; the site
  and phone number are added automatically — don't write them.`

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    scenes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          role: { type: 'STRING', enum: ['hook', 'product', 'proof', 'cta'] },
          headline: { type: 'STRING' },
          sub: { type: 'STRING' },
          stamp: { type: 'STRING' },
          items: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['role', 'headline'],
      },
    },
  },
  required: ['scenes'],
}

const ROLES: SceneRole[] = ['hook', 'product', 'proof', 'cta']
const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.trim().slice(0, max) : '')

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
      .select('id, format, voice_script, voice_timepoints, voice_media_id, source_product_id')
      .eq('id', suggestion_id)
      .single()
    if (!suggestion) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    if (!suggestion.voice_media_id || !Array.isArray(suggestion.voice_timepoints) || suggestion.voice_timepoints.length === 0) {
      return NextResponse.json({ error: 'Make the narration first (Voice → Synthesize). The animation is timed to it.' }, { status: 400 })
    }

    const sentences = timepointsToSentences(suggestion.voice_timepoints)

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

    const prompt = [
      productName ? `Product: ${productName}` : 'No single product (general store post).',
      `There are ${sentences.length} scenes. Write exactly ${sentences.length} scenes, in order:`,
      ...sentences.map((s, i) => `${i + 1}. Narrator says: "${s.text}"`),
    ].join('\n')

    const result = await geminiJson<{ scenes: Partial<StoryboardScene>[] }>({
      feature: 'generate-storyboard',
      system: SYSTEM,
      prompt,
      schema: SCHEMA,
      maxOutputTokens: 2000,
      temperature: 0.7,
    })

    // One scene per sentence whatever Gemini returned; timing always comes from the narration.
    const scenes: StoryboardScene[] = sentences.map((s, i) => {
      const g = result.scenes?.[i] ?? {}
      let role: SceneRole = ROLES.includes(g.role as SceneRole) ? (g.role as SceneRole) : 'proof'
      if (i === 0) role = 'hook'
      if (i === sentences.length - 1 && sentences.length > 1) role = 'cta'
      const items = Array.isArray(g.items) ? g.items.map((x) => clean(x, 40)).filter(Boolean).slice(0, 3) : []
      return {
        role,
        spoken: s.text,
        start: s.start,
        headline: clean(g.headline, 60) || s.text.split(/\s+/).slice(0, 4).join(' '),
        ...(clean(g.sub, 60) ? { sub: clean(g.sub, 60) } : {}),
        ...(clean(g.stamp, 20) ? { stamp: clean(g.stamp, 20) } : {}),
        ...(items.length ? { items } : {}),
      }
    })

    const storyboard: Storyboard = { version: 1, scenes, productName, productImageUrl }
    const { error } = await db.from('content_suggestions').update({ reel_storyboard: storyboard }).eq('id', suggestion_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ storyboard })
  } catch (err: any) {
    if (err instanceof GeminiError) return NextResponse.json({ error: err.message }, { status: 502 })
    console.error('[generate-storyboard]', err)
    return NextResponse.json({ error: err?.message || 'Failed to make the storyboard' }, { status: 500 })
  }
}
