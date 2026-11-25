/**
 * POST /api/marketing/plan/save  { posts: PlannedPost[] }
 *
 * Saves the planned posts the user picked: each becomes a content idea
 * (purpose 'daily', planned_for its date, best time, hashtags, tags) AND a
 * Feed suggestion pre-filled with the caption + hashtags and, for reels,
 * the voice script — so the next step is straight to the creative (Canva
 * prompt or Reel Builder), then Meta's scheduler.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireMarketingStaff } from '@/lib/marketing/staff-auth'
import { toConceptCode } from '@/lib/marketing/concept-code'
import { isCreativeStyle } from '@/lib/marketing/creative-styles'
import { composeCaption, loadStoreContact } from '@/lib/marketing/store-contact'
import { productIdsByCode } from '@/lib/marketing/product-signals'
import type { PlannedPost } from '@/lib/marketing/planner-prompts'
import { parseNarrationLanguage } from '@/lib/marketing/narration-language'
import { CAST } from '@/lib/marketing/cast'

/** "Story: Mang Ramon · problem pig-pen-fence. " for story posts, else empty. */
function storyNote(p: { character?: string; problem_id?: string }): string {
  const who = CAST.find((c) => c.id === p.character)
  return who ? `Story: ${who.name}${p.problem_id ? ` · problem ${p.problem_id}` : ''}. ` : ''
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const auth = await requireMarketingStaff(supabase as any)
    if (auth.error) return auth.error

    const { posts, language: rawLanguage } = await request.json() as { posts?: PlannedPost[]; language?: string }
    const language = parseNarrationLanguage(rawLanguage)
    if (!Array.isArray(posts) || posts.length === 0) {
      return NextResponse.json({ error: 'Pick at least one post to save' }, { status: 400 })
    }

    const db = supabase as any
    const contact = await loadStoreContact(db)
    const productIds = await productIdsByCode(db, posts.map((p) => p.product_code ?? ''))
    let saved = 0
    for (const p of posts.slice(0, 14)) {
      const isReel = p.format === 'reel'
      const hashtags = p.hashtags.join(' ')
      const conceptCode = toConceptCode(`${p.audience.slice(0, 3)}-${p.title}-${p.format}`)
      const productId = productIds.get(p.product_code?.trim() ?? '') ?? null

      const { data: idea, error: ideaError } = await db
        .from('content_ideas')
        .insert({
          title: p.title,
          description: storyNote(p) + p.why,
          language,
          image_concept: isReel ? p.shot_list : null,
          source_product_id: productId,
          format: p.format,
          creative_prompt: isReel ? null : p.creative_prompt,
          stock_keywords: isReel ? p.stock_keywords : null,
          audience: p.audience,
          angle: p.angle,
          concept_code: conceptCode,
          purpose: 'daily',
          planned_for: p.date,
          best_time: p.best_time,
          hashtags,
          tags: p.tags.join(' · '),
          creative_style: isCreativeStyle(p.creative_style) ? p.creative_style : null,
          reel_stickers: isReel && p.stickers?.length ? p.stickers : null,
          status: 'created',
          created_by: auth.userId,
        })
        .select('id')
        .single()
      if (ideaError) throw new Error(ideaError.message)

      const { error: suggestionError } = await db.from('content_suggestions').insert({
        source_idea_id: idea.id,
        source_product_id: productId,
        platform: 'both',
        script: isReel ? p.voice_script : p.angle,
        voice_script: isReel ? p.voice_script : null,
        caption_draft: composeCaption(p.caption, contact, hashtags),
        format: p.format,
        audience: p.audience,
        concept_code: conceptCode,
        creative_style: isCreativeStyle(p.creative_style) ? p.creative_style : null,
        reel_stickers: isReel && p.stickers?.length ? p.stickers : null,
        notes: `Planned for ${p.date}, post at ${p.best_time}. ${storyNote(p)}${p.why}`,
        language,
      })
      if (suggestionError) throw new Error(suggestionError.message)
      saved++
    }

    return NextResponse.json({ saved })
  } catch (err: any) {
    console.error('[marketing/plan/save]', err)
    return NextResponse.json({ error: err?.message || 'Failed to save the plan' }, { status: 500 })
  }
}
