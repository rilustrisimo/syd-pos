/**
 * POST /api/marketing/analyze
 *
 * Gemini (free tier) reads the insights digest and reports like a social
 * media manager: what's working, what isn't, what to test next, when to
 * post, and how to split the ad budget.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireMarketingStaff } from '@/lib/marketing/staff-auth'
import { buildDigest, loadInsights } from '@/lib/marketing/insights-data'
import { geminiJson, GeminiError } from '@/lib/marketing/gemini'
import { PLANNER_SYSTEM, ANALYSIS_SCHEMA, analysisPrompt, type InsightsAnalysis } from '@/lib/marketing/planner-prompts'

export async function POST() {
  try {
    const supabase = await createClient()
    const auth = await requireMarketingStaff(supabase as any)
    if (auth.error) return auth.error

    const data = await loadInsights(supabase as any)
    const analysis = await geminiJson<InsightsAnalysis>({
      system: PLANNER_SYSTEM,
      prompt: analysisPrompt(buildDigest(data)),
      schema: ANALYSIS_SCHEMA,
      maxOutputTokens: 3000,
      temperature: 0.4,
    })
    return NextResponse.json({ analysis })
  } catch (err: any) {
    console.error('[marketing/analyze]', err)
    return NextResponse.json({ error: err instanceof GeminiError ? err.message : err?.message || 'Failed to analyze' }, { status: 500 })
  }
}
