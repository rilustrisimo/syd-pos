/**
 * POST /api/marketing/plan  { mode: 'today' | 'week', note?, language?, story_reels? }
 *
 * story_reels (0–3) forces that many problem → fix story reels into the plan
 * (for "today", any value > 0 makes today's post a story reel).
 *
 * Gemini (free tier) plans today's post or the next 7 days, from the
 * imported insights digest (what worked, best times, what's already
 * planned) plus product signals from the store database. Returns the plan for review; nothing is saved until the user
 * picks posts (POST /api/marketing/plan/save).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireMarketingStaff } from '@/lib/marketing/staff-auth'
import { bestTimesFrom, buildDigest, loadInsights } from '@/lib/marketing/insights-data'
import { DAY_SHORT, formatHour, manilaToday } from '@/lib/marketing/best-times'
import { loadProductDigest } from '@/lib/marketing/product-signals'
import { geminiJson, GeminiError } from '@/lib/marketing/gemini'
import { PLANNER_SYSTEM, MAX_STORY_REELS, planSchema, planPrompt, storyReelDates, type PlannedPost } from '@/lib/marketing/planner-prompts'
import { parseNarrationLanguage } from '@/lib/marketing/narration-language'

// Gemini fallback (lib/marketing/gemini.ts) may try several models within 55 s.
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const auth = await requireMarketingStaff(supabase as any)
    if (auth.error) return auth.error

    const { mode = 'today', note, language: rawLanguage, story_reels: rawStories } = await request.json() as { mode?: 'today' | 'week'; note?: string; language?: string; story_reels?: number }
    const language = parseNarrationLanguage(rawLanguage)
    const [data, productDigest] = await Promise.all([loadInsights(supabase as any), loadProductDigest(supabase as any)])
    const best = bestTimesFrom(data)
    const digest = buildDigest(data, best) + productDigest

    const start = new Date(`${manilaToday().date}T00:00:00Z`).getTime()
    const dates = Array.from({ length: mode === 'week' ? 7 : 1 }, (_, i) => new Date(start + i * 86400000).toISOString().slice(0, 10))

    const storyReels = Math.min(dates.length, MAX_STORY_REELS, Math.max(0, Math.floor(Number(rawStories) || 0)))
    const storyDates = storyReelDates(dates, storyReels)
    const otherDates = dates.filter((d) => !storyDates.includes(d))

    const plan = await geminiJson<{ posts?: PlannedPost[]; story_reels?: PlannedPost[] }>({
      feature: 'plan',
      system: PLANNER_SYSTEM,
      prompt: planPrompt(digest, dates, note?.trim().slice(0, 300), language, storyDates),
      schema: planSchema(storyDates, otherDates),
      maxOutputTokens: mode === 'week' ? 9000 : 2500,
    })

    // Story reels are their own list (so the schema can require them); merge
    // them back in date order. The schema already pins format/style; this
    // just guards against a model that ignores it.
    const stories = (plan.story_reels ?? []).slice(0, storyReels).map((p) => ({ ...p, format: 'reel' as const, creative_style: 'story' as const }))
    const posts = fixDates([...stories, ...(plan.posts ?? [])].slice(0, dates.length), dates, best.topSlots)
    const missing = storyReels - stories.length
    return NextResponse.json({
      posts,
      confidence: best.confidence,
      ...(missing > 0 ? { notice: `Gemini returned ${stories.length} of the ${storyReels} story reels asked for — plan again for more.` } : {}),
    })
  } catch (err: any) {
    console.error('[marketing/plan]', err)
    return NextResponse.json({ error: err instanceof GeminiError ? err.message : err?.message || 'Failed to plan posts' }, { status: 500 })
  }
}

/**
 * One post per date: a post on a date that's already taken (or not in the
 * plan) moves to a free date, with that weekday's best time.
 */
function fixDates(posts: PlannedPost[], dates: string[], topSlots: { hour: number }[][]): PlannedPost[] {
  const taken = new Set<string>()
  const misplaced: PlannedPost[] = []
  const out: PlannedPost[] = []
  for (const p of posts) {
    if (dates.includes(p.date) && !taken.has(p.date)) { taken.add(p.date); out.push(p) } else misplaced.push(p)
  }
  const free = dates.filter((d) => !taken.has(d))
  misplaced.forEach((p, i) => {
    const date = free[i]
    if (!date) return
    const day = new Date(`${date}T00:00:00Z`).getUTCDay()
    const slot = topSlots[day]?.[0]
    out.push({ ...p, date, best_time: slot ? `${DAY_SHORT[day]} ${formatHour(slot.hour)}` : p.best_time })
  })
  return out.sort((a, b) => a.date.localeCompare(b.date))
}
