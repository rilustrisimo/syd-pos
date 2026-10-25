/**
 * POST /api/marketing/plan  { mode: 'today' | 'week', note? }
 *
 * Gemini (free tier) plans today's post or the next 7 days, from the
 * imported insights digest (what worked, best times, what's already
 * planned). Returns the plan for review; nothing is saved until the user
 * picks posts (POST /api/marketing/plan/save).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireMarketingStaff } from '@/lib/marketing/staff-auth'
import { bestTimesFrom, buildDigest, loadInsights } from '@/lib/marketing/insights-data'
import { manilaToday } from '@/lib/marketing/best-times'
import { geminiJson, GeminiError } from '@/lib/marketing/gemini'
import { PLANNER_SYSTEM, PLAN_SCHEMA, planPrompt, type PlannedPost } from '@/lib/marketing/planner-prompts'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const auth = await requireMarketingStaff(supabase as any)
    if (auth.error) return auth.error

    const { mode = 'today', note } = await request.json() as { mode?: 'today' | 'week'; note?: string }
    const data = await loadInsights(supabase as any)
    const best = bestTimesFrom(data)
    const digest = buildDigest(data, best)

    const start = new Date(`${manilaToday().date}T00:00:00Z`).getTime()
    const dates = Array.from({ length: mode === 'week' ? 7 : 1 }, (_, i) => new Date(start + i * 86400000).toISOString().slice(0, 10))

    const plan = await geminiJson<{ posts: PlannedPost[] }>({
      system: PLANNER_SYSTEM,
      prompt: planPrompt(digest, dates, note?.trim().slice(0, 300)),
      schema: PLAN_SCHEMA,
      maxOutputTokens: mode === 'week' ? 9000 : 2500,
    })

    return NextResponse.json({ posts: plan.posts ?? [], confidence: best.confidence })
  } catch (err: any) {
    console.error('[marketing/plan]', err)
    return NextResponse.json({ error: err instanceof GeminiError ? err.message : err?.message || 'Failed to plan posts' }, { status: 500 })
  }
}
