/**
 * POST /api/marketing/concepts  { topic, source_product_id?, audiences[], count? }
 *
 * Gemini (free tier) generates distinct Meta ad concepts — different
 * audience and/or proof type, mixed formats — informed by the insights
 * digest. Returns them for review; the Ideas page saves the ones picked.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireMarketingStaff } from '@/lib/marketing/staff-auth'
import { buildDigest, loadInsights } from '@/lib/marketing/insights-data'
import { loadProductDigest, productIdsByCode } from '@/lib/marketing/product-signals'
import { geminiJson, GeminiError } from '@/lib/marketing/gemini'
import { toConceptCode } from '@/lib/marketing/concept-code'
import { PLANNER_SYSTEM, CONCEPTS_SCHEMA, conceptsPrompt, type AdConcept } from '@/lib/marketing/planner-prompts'
import type { ContentAudience } from '@/hooks/useContentIdeas'

const VALID_AUDIENCES: ContentAudience[] = ['contractor', 'business_farm', 'family_build', 'general']

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const auth = await requireMarketingStaff(supabase as any)
    if (auth.error) return auth.error

    const body = await request.json() as { topic?: string; source_product_id?: string; audiences?: string[]; count?: number }
    const audiences = (body.audiences ?? []).filter((a): a is ContentAudience => VALID_AUDIENCES.includes(a as ContentAudience))
    if (!audiences.length) return NextResponse.json({ error: 'Pick at least one audience' }, { status: 400 })
    const count = Math.min(Math.max(Math.round(body.count ?? 6), 2), 10)

    let productName: string | null = null
    if (body.source_product_id) {
      const { data: product } = await (supabase as any).from('products').select('name').eq('id', body.source_product_id).single()
      productName = product?.name ?? null
    }

    // With a product picked, the concepts are about it; otherwise the
    // planner picks products from the store signals.
    const [data, productDigest] = await Promise.all([
      loadInsights(supabase as any),
      body.source_product_id ? Promise.resolve('') : loadProductDigest(supabase as any),
    ])
    const result = await geminiJson<{ concepts: AdConcept[] }>({
      system: PLANNER_SYSTEM,
      prompt: conceptsPrompt(buildDigest(data) + productDigest, { topic: body.topic?.trim().slice(0, 200) ?? '', productName, audiences, count }),
      schema: CONCEPTS_SCHEMA,
      maxOutputTokens: 9000,
    })

    // Make codes unique against each other and against existing ideas.
    const taken = new Set(data.ideas.map((i) => i.concept_code).filter(Boolean))
    const productIds = body.source_product_id ? null : await productIdsByCode(supabase as any, (result.concepts ?? []).map((c) => c.product_code ?? ''))
    const concepts = (result.concepts ?? []).map((c) => {
      let code = toConceptCode(c.concept_code || c.title)
      for (let n = 2; taken.has(code); n++) code = `${toConceptCode(c.concept_code || c.title).slice(0, 36)}-${n}`
      taken.add(code)
      const source_product_id = body.source_product_id ?? productIds?.get(c.product_code?.trim() ?? '') ?? null
      return { ...c, concept_code: code, source_product_id }
    })

    return NextResponse.json({ concepts })
  } catch (err: any) {
    console.error('[marketing/concepts]', err)
    return NextResponse.json({ error: err instanceof GeminiError ? err.message : err?.message || 'Failed to generate concepts' }, { status: 500 })
  }
}
