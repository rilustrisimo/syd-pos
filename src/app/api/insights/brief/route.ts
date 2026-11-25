/**
 * GET  /api/insights/brief        → latest briefs (weekly + monthly)
 * POST /api/insights/brief { kind: 'weekly' | 'monthly', lang?: 'english' | 'taglish' }
 *
 * Admin only. Weekly = last 7 days vs the 7 before; monthly = last full
 * month vs the month before. Gemini (free tier) writes the brief from the
 * compact Insights report; it's stored in insights_briefs.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTodayPH } from '@/lib/utils/datetime'
import { requireAdmin } from '@/lib/insights/auth'
import { loadRawInsights } from '@/lib/insights/data'
import { buildBundle } from '@/lib/insights/bundle'
import { buildMarkdown } from '@/lib/insights/report'
import { addDays, addMonths, monthStart } from '@/lib/insights/dates'
import { BRIEF_SCHEMA, briefPrompt, briefSystem, type InsightsBrief } from '@/lib/insights/brief'
import { geminiJson, GeminiError } from '@/lib/marketing/gemini'

export const maxDuration = 60

export async function GET() {
  const supabase = await createClient()
  const auth = await requireAdmin(supabase as any)
  if (auth.error) return auth.error
  const { data, error } = await (supabase as any).from('insights_briefs')
    .select('id, kind, period_start, period_end, payload, created_at').order('created_at', { ascending: false }).limit(12)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ briefs: data ?? [] })
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const auth = await requireAdmin(supabase as any)
    if (auth.error) return auth.error
    const body = await req.json().catch(() => ({}))
    const kind: 'weekly' | 'monthly' = body.kind === 'monthly' ? 'monthly' : 'weekly'
    const lang: 'english' | 'taglish' = body.lang === 'english' ? 'english' : 'taglish'

    const today = getTodayPH()
    const range = kind === 'weekly'
      ? { from: addDays(today, -6), to: today }
      : { from: addMonths(monthStart(today), -1), to: addDays(monthStart(today), -1) }
    const raw = await loadRawInsights(supabase as any, { ...range, today, branchId: null })
    const bundle = buildBundle(raw)
    const report = buildMarkdown(bundle, { compact: true })

    const brief = await geminiJson<InsightsBrief>({
      feature: `insights-brief-${kind}`,
      system: briefSystem(lang),
      prompt: briefPrompt(kind, report),
      schema: BRIEF_SCHEMA,
      maxOutputTokens: 3500,
      temperature: 0.4,
    })
    const payload = { ...brief, lang, kpis: { revenue: bundle.overview.current.revenue, grossProfit: bundle.overview.current.grossProfit, revenueGrowth: bundle.overview.growth.revenue } }
    const { data, error } = await (supabase as any).from('insights_briefs')
      .insert({ kind, period_start: range.from, period_end: range.to, payload, created_by: auth.userId })
      .select('id, kind, period_start, period_end, payload, created_at').single()
    if (error) throw new Error(error.message)
    return NextResponse.json({ brief: data })
  } catch (err: any) {
    console.error('[insights/brief]', err)
    return NextResponse.json({ error: err instanceof GeminiError ? err.message : err?.message || 'Failed to write the brief' }, { status: 500 })
  }
}
