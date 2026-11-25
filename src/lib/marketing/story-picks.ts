// Picks the problem (and cast member) for each story post before asking
// Gemini, so stories don't keep landing on the same case: problems used in
// the last weeks are skipped, the owner's note/topic decides the subject
// when given, and the rest are spread over different audiences at random.

import type { SupabaseClient } from '@supabase/supabase-js'
import { inSeason, problemScore, type Problem } from '@/lib/marketing/problem-bank'
import { CAST, type CastId } from '@/lib/marketing/cast'

export interface StoryPick {
  problem: Problem | null
  /** Set when no bank problem fits the owner's note: Gemini writes a new one about this. */
  customTopic?: string
  cast: CastId
}

const CAST_FOR: Record<string, CastId> = { business_farm: 'ramon', contractor: 'joy', family_build: 'ben', general: 'ben' }

/** Problem ids used by ideas/posts in the last `days` (from "Story: … · problem <id>." notes). */
export async function loadRecentProblemIds(supabase: SupabaseClient, days = 45): Promise<string[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const db = supabase as any
  const [ideas, posts] = await Promise.all([
    db.from('content_ideas').select('description').gte('created_at', since).ilike('description', '%problem %').limit(200),
    db.from('content_suggestions').select('notes').gte('created_at', since).ilike('notes', '%problem %').limit(200),
  ])
  const text = [...(ideas.data ?? []).map((r: any) => r.description), ...(posts.data ?? []).map((r: any) => r.notes)].join('\n')
  return [...new Set([...text.matchAll(/problem ([a-z0-9-]+)/g)].map((m) => m[1]))]
}

const shuffle = <T,>(a: T[]) => a.map((x) => ({ x, r: Math.random() })).sort((p, q) => p.r - q.r).map((p) => p.x)

export function pickStories(n: number, opts: { note?: string; recent?: string[]; month?: number } = {}): StoryPick[] {
  if (n <= 0) return []
  const recent = new Set(opts.recent ?? [])
  const fresh = inSeason(opts.month).filter((p) => !recent.has(p.id))
  // If nearly everything was used recently, start over rather than run dry.
  const pool = fresh.length >= n ? fresh : inSeason(opts.month)
  const picks: StoryPick[] = []
  const used = new Set<string>()
  const note = opts.note?.trim()

  if (note) {
    const matching = pool.map((p) => ({ p, s: problemScore(p, note) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || Math.random() - 0.5)
    if (matching.length === 0) picks.push({ problem: null, customTopic: note, cast: 'ben' })
    for (const { p } of matching) {
      if (picks.length >= n) break
      picks.push({ problem: p, cast: CAST_FOR[p.audience] }); used.add(p.id)
    }
  }
  // Fill the rest at random, preferring audiences (and so characters) not used yet.
  for (const p of shuffle(pool)) {
    if (picks.length >= n) break
    if (used.has(p.id)) continue
    const cast = CAST_FOR[p.audience]
    if (picks.some((k) => k.cast === cast) && pool.some((q) => !used.has(q.id) && !picks.some((k) => k.cast === CAST_FOR[q.audience]))) continue
    picks.push({ problem: p, cast }); used.add(p.id)
  }
  for (const p of shuffle(pool)) { if (picks.length >= n) break; if (!used.has(p.id)) { picks.push({ problem: p, cast: CAST_FOR[p.audience] }); used.add(p.id) } }
  return picks.slice(0, n)
}

/** One prompt line per pick. */
export function storyPickLine(pick: StoryPick, label: string): string {
  const name = CAST.find((c) => c.id === pick.cast)?.name ?? pick.cast
  if (!pick.problem) {
    return `${label}: ${name} — a NEW realistic local problem about "${pick.customTopic}" (not in the bank): what goes wrong, the wrong fix people try, and the right fix with SYD products. Set problem_id to a short new slug for it.`
  }
  const p = pick.problem
  return `${label}: ${name} — problem [${p.id}] ${p.problem}. Wrong fix: ${p.wrong_fix}. Right fix: ${p.right_fix}.`
}
