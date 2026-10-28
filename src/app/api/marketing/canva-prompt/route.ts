/**
 * POST /api/marketing/canva-prompt  { idea_id? | suggestion_id?, pattern? }
 *
 * (Re)generates a detailed Canva prompt for an image/carousel post:
 * Gemini designs the post as a structured spec on one curated layout
 * pattern (picked to suit the creative style, and different from the
 * previous prompt's, unless one is requested), then the spec is formatted
 * with SYD's fixed brand kit (canva-prompt.ts).
 *
 * Saved on the idea (or, for a Feed post made without an idea, on the
 * suggestion). Returns { creative_prompt, pattern }.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireMarketingStaff } from '@/lib/marketing/staff-auth'
import { geminiJson, GeminiError } from '@/lib/marketing/gemini'
import {
  CANVA_DESIGNER_SYSTEM,
  CANVA_SPEC_SCHEMA,
  canvaSpecPrompt,
  formatCanvaPrompt,
  isLayoutPattern,
  layoutPatternOf,
  pickLayoutPattern,
  type CanvaPostContext,
  type CanvaSpec,
} from '@/lib/marketing/canva-prompt'

export const maxDuration = 60

async function loadProduct(db: any, productId: string | null): Promise<CanvaPostContext['product']> {
  if (!productId) return null
  const [{ data: product }, { count }] = await Promise.all([
    db.from('products').select('name, category:product_categories(name)').eq('id', productId).single(),
    db.from('product_images').select('id', { count: 'exact', head: true }).eq('product_id', productId),
  ])
  if (!product) return null
  return { name: product.name, category: product.category?.name ?? null, hasPhoto: (count ?? 0) > 0 }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const auth = await requireMarketingStaff(supabase as any)
    if (auth.error) return auth.error
    const db = supabase as any

    const body = await request.json() as { idea_id?: string; suggestion_id?: string; pattern?: string }
    let ideaId = body.idea_id ?? null
    let suggestionId: string | null = null
    let ctx: CanvaPostContext | null = null

    if (body.suggestion_id) {
      const { data: s } = await db
        .from('content_suggestions')
        .select('id, source_idea_id, source_product_id, format, audience, creative_style, caption_final, caption_draft, script, notes, creative_prompt')
        .eq('id', body.suggestion_id)
        .single()
      if (!s) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
      if (s.source_idea_id) {
        ideaId = s.source_idea_id
      } else {
        suggestionId = s.id
        ctx = {
          title: (s.notes || s.script || 'Feed post').slice(0, 120),
          format: s.format === 'carousel' ? 'carousel' : 'image',
          audience: s.audience,
          creative_style: s.creative_style,
          description: s.script,
          caption: s.caption_final || s.caption_draft,
          product: await loadProduct(db, s.source_product_id),
          previous_prompt: s.creative_prompt,
          pattern: 'type_led',
        }
      }
    }

    if (!ctx) {
      if (!ideaId) return NextResponse.json({ error: 'idea_id or suggestion_id is required' }, { status: 400 })
      const { data: idea } = await db
        .from('content_ideas')
        .select('id, title, description, image_concept, format, audience, angle, creative_style, creative_prompt, source_product_id')
        .eq('id', ideaId)
        .single()
      if (!idea) return NextResponse.json({ error: 'Idea not found' }, { status: 404 })
      ctx = {
        title: idea.title,
        format: idea.format,
        audience: idea.audience,
        creative_style: idea.creative_style,
        angle: idea.angle,
        description: idea.description,
        image_concept: idea.image_concept,
        product: await loadProduct(db, idea.source_product_id),
        previous_prompt: idea.creative_prompt,
        pattern: 'type_led',
      }
    }

    if (ctx.format === 'reel') {
      return NextResponse.json({ error: 'Reels are built with the reel builder, not Canva' }, { status: 400 })
    }

    ctx.pattern = isLayoutPattern(body.pattern)
      ? body.pattern
      : pickLayoutPattern(ctx.format, ctx.creative_style, layoutPatternOf(ctx.previous_prompt))

    const spec = await geminiJson<CanvaSpec>({
      system: CANVA_DESIGNER_SYSTEM,
      prompt: canvaSpecPrompt(ctx),
      schema: CANVA_SPEC_SCHEMA,
      maxOutputTokens: 6000,
      temperature: 0.8,
    })
    if (!spec.slides?.length) return NextResponse.json({ error: 'Gemini returned no design — try again' }, { status: 502 })

    const creative_prompt = formatCanvaPrompt(spec, ctx)
    const { error } = suggestionId
      ? await db.from('content_suggestions').update({ creative_prompt }).eq('id', suggestionId)
      : await db.from('content_ideas').update({ creative_prompt }).eq('id', ideaId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ creative_prompt, pattern: ctx.pattern })
  } catch (err: any) {
    if (err instanceof GeminiError) return NextResponse.json({ error: err.message }, { status: 502 })
    console.error('[canva-prompt]', err)
    return NextResponse.json({ error: err?.message || 'Failed to generate the Canva prompt' }, { status: 500 })
  }
}
