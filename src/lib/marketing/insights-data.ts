// Loads imported marketing insights and the idea bank, and condenses them
// into (a) numbers for the Insights page and (b) a compact text digest for
// the Gemini planner — a few hundred words instead of raw rows, to stay
// well inside the free tier's token limits. Takes a Supabase client, so it
// runs the same with the browser client (page) or the server client
// (routes), under the signed-in staff user's RLS.

import type { SupabaseClient } from '@supabase/supabase-js'
import { computeBestTimes, formatSlot, manilaDayHour, manilaToday, type BestTimes } from '@/lib/marketing/best-times'

export interface PostMetric {
  id: string
  platform: string
  external_id: string
  published_at: string
  post_type: string | null
  text: string | null
  permalink: string | null
  reach: number | null
  impressions: number | null
  reactions: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  link_clicks: number | null
  video_views: number | null
  follows: number | null
  concept_code: string | null
}

export interface AdMetric {
  ad_name: string
  adset_name: string | null
  campaign_name: string | null
  period_start: string
  period_end: string
  impressions: number | null
  reach: number | null
  link_clicks: number | null
  results: number | null
  result_type: string | null
  spend: number | null
  follows: number | null
  delivery_status?: string | null
}

export interface GaMetric {
  dimension: string
  dimension_value: string
  period_start: string
  period_end: string
  metrics: Record<string, number>
}

export interface IdeaLite {
  title: string
  format: string
  audience: string
  purpose: string
  status: string
  concept_code: string | null
  planned_for: string | null
  angle: string | null
  creative_style: string | null
  created_at: string
}

export interface InsightsData {
  posts: PostMetric[]
  ads: AdMetric[]
  ga: GaMetric[]
  ideas: IdeaLite[]
}

const DAYS_BACK = 90

export async function loadInsights(supabase: SupabaseClient): Promise<InsightsData> {
  const since = new Date(Date.now() - DAYS_BACK * 86400000).toISOString()
  const sinceDate = since.slice(0, 10)
  const db = supabase as any
  const [posts, ads, ga, ideas] = await Promise.all([
    db.from('social_post_metrics').select('*').gte('published_at', since).order('published_at', { ascending: false }).limit(1000),
    db.from('ad_metrics').select('*').gte('period_end', sinceDate).limit(1000),
    db.from('ga_metrics').select('dimension, dimension_value, period_start, period_end, metrics').gte('period_end', sinceDate).limit(2000),
    db.from('content_ideas').select('title, format, audience, purpose, status, concept_code, planned_for, angle, creative_style, created_at').order('created_at', { ascending: false }).limit(200),
  ])
  for (const r of [posts, ads, ga, ideas]) if (r.error) throw new Error(r.error.message)
  return { posts: posts.data ?? [], ads: ads.data ?? [], ga: ga.data ?? [], ideas: ideas.data ?? [] }
}

// GA4 rows can come from several overlapping exports; keep only the most
// recent period for each dimension so visits aren't double counted.
function latestPeriod(rows: GaMetric[], dimension: string): GaMetric[] {
  const own = rows.filter((r) => r.dimension === dimension)
  const latest = own.reduce<string | null>((max, r) => (!max || r.period_end > max ? r.period_end : max), null)
  return own.filter((r) => r.period_end === latest)
}

export function bestTimesFrom(data: InsightsData): BestTimes {
  const dayHour = latestPeriod(data.ga, 'day_hour')
  const hourOnly = dayHour.length ? [] : latestPeriod(data.ga, 'hour')
  const site = [
    ...dayHour.map((r) => {
      const [day, hour] = r.dimension_value.split('-').map(Number)
      return { day, hour, sessions: r.metrics.sessions ?? 0 }
    }),
    ...hourOnly.map((r) => ({ day: null, hour: Number(r.dimension_value), sessions: r.metrics.sessions ?? 0 })),
  ]
  const adHours = latestPeriod(data.ga, 'ad_hour').map((r) => ({
    hour: Number(r.dimension_value),
    impressions: r.metrics.impressions ?? 0,
    actions: (r.metrics.results ?? 0) + (r.metrics.link_clicks ?? 0),
  }))
  return computeBestTimes(data.posts, site, adHours)
}

/** Plain-words name for an Ads Manager result indicator (e.g. "actions:…call…" → "Calls"). */
export function resultLabel(resultType: string | null): string {
  const t = (resultType ?? '').toLowerCase()
  if (!t) return 'Results'
  if (t.includes('call')) return 'Calls'
  if (t.includes('lead')) return 'Leads'
  if (t.includes('landing_page')) return 'Landing page views'
  if (t.includes('link_click')) return 'Link clicks'
  if (t.includes('like') || t.includes('follow')) return 'Follows'
  if (t.includes('message') || t.includes('messaging')) return 'Messages'
  if (t.includes('video_view') || t.includes('thruplay')) return 'Video views'
  if (t.includes('reach')) return 'Reach'
  if (t.includes('post_engagement') || t.includes('engagement')) return 'Engagements'
  return resultType ?? 'Results'
}

export function engagementRate(p: PostMetric): number | null {
  if (!p.reach) return null
  return ((p.reactions ?? 0) + (p.comments ?? 0) + (p.shares ?? 0) + (p.saves ?? 0)) / p.reach
}

export interface AdSummary {
  ad_name: string
  campaign_name: string | null
  spend: number
  results: number
  resultType: string
  link_clicks: number
  reach: number
  impressions: number
  follows: number
  days: number
  costPerResult: number | null
  /** Cost per 1,000 impressions. */
  cpm: number | null
  /** Average times each person saw it (impressions ÷ reach). */
  frequency: number | null
  /** Link clicks ÷ impressions. */
  ctr: number | null
  audience: string | null
  format: string | null
  creativeStyle: string | null
  /** Ads Manager's Delivery column from the latest import. */
  deliveryStatus: string | null
  /** Meta flagged the creative as too similar / worn out. */
  creativeWarning: boolean
}

export function isCreativeWarning(status: string | null | undefined): boolean {
  const s = (status ?? '').toLowerCase()
  return s.includes('creative limited') || s.includes('fatigue') || s.includes('limited creative')
}

/** Ad results summed per ad name (= concept code), joined to the idea it came from. */
export function summarizeAds(data: InsightsData): AdSummary[] {
  const byName = new Map<string, AdSummary>()
  const latestEnd = new Map<string, string>()
  for (const a of data.ads) {
    const s = byName.get(a.ad_name) ?? {
      ad_name: a.ad_name, campaign_name: a.campaign_name, spend: 0, results: 0, resultType: resultLabel(a.result_type),
      link_clicks: 0, reach: 0, impressions: 0, follows: 0, days: 0,
      costPerResult: null, cpm: null, frequency: null, ctr: null, audience: null, format: null,
      creativeStyle: null, deliveryStatus: null, creativeWarning: false,
    }
    if (a.delivery_status && (!latestEnd.has(a.ad_name) || a.period_end >= latestEnd.get(a.ad_name)!)) {
      latestEnd.set(a.ad_name, a.period_end)
      s.deliveryStatus = a.delivery_status
    }
    s.spend += a.spend ?? 0
    s.results += a.results ?? 0
    s.link_clicks += a.link_clicks ?? 0
    // Reach isn't additive across periods (the same person can be in
    // both); keep the largest single-period reach as a floor.
    s.reach = Math.max(s.reach, a.reach ?? 0)
    s.impressions += a.impressions ?? 0
    s.follows += a.follows ?? 0
    s.days += Math.round((Date.parse(a.period_end) - Date.parse(a.period_start)) / 86400000) + 1
    byName.set(a.ad_name, s)
  }
  const ideasByCode = new Map(data.ideas.filter((i) => i.concept_code).map((i) => [i.concept_code!, i]))
  return [...byName.values()].map((s) => {
    const idea = ideasByCode.get(s.ad_name.toLowerCase())
    return {
      ...s,
      costPerResult: s.results > 0 ? s.spend / s.results : null,
      cpm: s.impressions > 0 ? (s.spend / s.impressions) * 1000 : null,
      frequency: s.reach > 0 ? s.impressions / s.reach : null,
      ctr: s.impressions > 0 ? s.link_clicks / s.impressions : null,
      audience: idea?.audience ?? null,
      format: idea?.format ?? null,
      creativeStyle: idea?.creative_style ?? null,
      creativeWarning: isCreativeWarning(s.deliveryStatus),
    }
  })
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`
const peso = (n: number) => `₱${n.toFixed(2)}`
const clip = (s: string | null, n = 70) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

/** Compact text summary of what's working, for Gemini prompts. */
export function buildDigest(data: InsightsData, best: BestTimes = bestTimesFrom(data)): string {
  const lines: string[] = []
  const { date, day } = manilaToday()
  lines.push(`Today (Manila): ${date}, ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day]}.`)

  // Best times
  lines.push(`\nBEST TIMES TO POST (confidence: ${best.confidence}; based on ${best.postCount} posts, ${best.sessionCount} site sessions and ${best.adImpressions} ad impressions by hour${best.confidence === 'low' ? ' — mostly a starting assumption until more data is imported' : ''}):`)
  for (let d = 0; d < 7; d++) lines.push(`- ${best.topSlots[d].map((s) => formatSlot(s.day, s.hour)).join(', ')}`)

  // Organic posts, last 30 days
  const monthAgo = Date.now() - 30 * 86400000
  const recent = data.posts.filter((p) => new Date(p.published_at).getTime() >= monthAgo)
  if (recent.length) {
    const rated = recent.map((p) => ({ p, rate: engagementRate(p) })).filter((x): x is { p: PostMetric; rate: number } => x.rate != null)
    const byType = new Map<string, number[]>()
    for (const { p, rate } of rated) {
      const key = (p.post_type ?? 'unknown').toLowerCase()
      byType.set(key, [...(byType.get(key) ?? []), rate])
    }
    lines.push(`\nORGANIC POSTS, LAST 30 DAYS: ${recent.length} posts, ${recent.reduce((s, p) => s + (p.follows ?? 0), 0)} follows from posts.`)
    lines.push(`Avg engagement rate by type: ${[...byType].map(([t, r]) => `${t} ${pct(r.reduce((a, b) => a + b, 0) / r.length)} (${r.length})`).join('; ')}`)
    const sorted = [...rated].sort((a, b) => b.rate - a.rate)
    const describe = ({ p, rate }: { p: PostMetric; rate: number }) => {
      const { day: d, hour } = manilaDayHour(p.published_at)
      return `- ${p.post_type ?? 'post'} ${formatSlot(d, hour)}, ER ${pct(rate)}, reach ${p.reach ?? 0}${p.concept_code ? `, concept ${p.concept_code}` : ''}: "${clip(p.text)}"`
    }
    lines.push('Top posts:', ...sorted.slice(0, 3).map(describe))
    if (sorted.length > 4) lines.push('Weakest posts:', ...sorted.slice(-2).map(describe))
  } else {
    lines.push('\nORGANIC POSTS: no post insights imported yet.')
  }

  // Ads
  const ads = summarizeAds(data)
  if (ads.length) {
    const totalSpend = ads.reduce((s, a) => s + a.spend, 0)
    const totalImpr = ads.reduce((s, a) => s + a.impressions, 0)
    lines.push(`\nADS (last 90 days): ${ads.length} ads, total spend ${peso(totalSpend)}, ${totalImpr.toLocaleString('en-US')} impressions${totalImpr ? `, average CPM ${peso((totalSpend / totalImpr) * 1000)}` : ''}.`)
    lines.push('Ads are compared only against ads with the same result type (calls, follows, link clicks are different goals).')
    const describe = (a: AdSummary) =>
      `- ${a.ad_name}${a.campaign_name ? ` (campaign "${clip(a.campaign_name, 40)}")` : ''}${a.audience ? ` [${a.audience}${a.format ? `, ${a.format}` : ''}]` : ''}: ` +
      `${a.results} ${a.resultType.toLowerCase()}${a.costPerResult != null ? ` at ${peso(a.costPerResult)} each` : ''}; ` +
      `reach ${a.reach.toLocaleString('en-US')}, ${a.impressions.toLocaleString('en-US')} impressions over ~${a.days} days` +
      `${a.frequency != null ? `, frequency ${a.frequency.toFixed(1)}` : ''}${a.cpm != null ? `, CPM ${peso(a.cpm)}` : ''}` +
      `${a.ctr != null ? `, link CTR ${pct(a.ctr)}` : ''}; spend ${peso(a.spend)}`
    const byType = new Map<string, AdSummary[]>()
    for (const a of ads) byType.set(a.resultType, [...(byType.get(a.resultType) ?? []), a])
    for (const [type, group] of byType) {
      const sorted = [...group].sort((a, b) => (a.costPerResult ?? Infinity) - (b.costPerResult ?? Infinity))
      lines.push(`${type} ads (${group.length}), cheapest first:`, ...sorted.slice(0, 4).map(describe))
    }
    const flagged = ads.filter((a) => a.creativeWarning)
    if (flagged.length) {
      lines.push('META FLAGGED THESE CREATIVES (too similar or worn out — the next creatives must look visibly different: another creative style and format):')
      for (const a of flagged) lines.push(`- ${a.ad_name}: "${a.deliveryStatus}"${a.creativeStyle ? ` (style ${a.creativeStyle})` : ''}`)
    }
  } else {
    lines.push('\nADS: no ad results imported yet.')
  }

  // Site visits per concept
  const content = latestPeriod(data.ga, 'utm_content').sort((a, b) => (b.metrics.sessions ?? 0) - (a.metrics.sessions ?? 0))
  if (content.length) {
    lines.push('\nWEBSITE VISITS BY CONCEPT (GA4 utm_content):')
    for (const r of content.slice(0, 5)) lines.push(`- ${r.dimension_value}: ${r.metrics.sessions ?? 0} sessions, ${r.metrics.key_events ?? 0} quote requests`)
  }

  // Creative styles: what's been used lately, and how posts in each style did.
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)
  const recentStyled = data.ideas
    .filter((i) => i.creative_style && (i.planned_for ?? i.created_at.slice(0, 10)) >= twoWeeksAgo)
    .sort((a, b) => (b.planned_for ?? b.created_at).localeCompare(a.planned_for ?? a.created_at))
  if (recentStyled.length) {
    lines.push(`\nCREATIVE STYLES USED IN THE LAST 14 DAYS (newest first): ${recentStyled.slice(0, 10).map((i) => i.creative_style).join(', ')}`)
  }
  const styleByCode = new Map(data.ideas.filter((i) => i.concept_code && i.creative_style).map((i) => [i.concept_code!, i.creative_style!]))
  const styleRates = new Map<string, number[]>()
  for (const p of data.posts) {
    const style = p.concept_code ? styleByCode.get(p.concept_code) : undefined
    const rate = engagementRate(p)
    if (style && rate != null) styleRates.set(style, [...(styleRates.get(style) ?? []), rate])
  }
  if (styleRates.size) {
    lines.push(`Engagement rate by creative style: ${[...styleRates].map(([s, r]) => `${s} ${pct(r.reduce((a, b) => a + b, 0) / r.length)} (${r.length})`).join('; ')}`)
  }

  // What's already planned / in the bank
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const planned = data.ideas.filter((i) => i.planned_for && i.planned_for >= weekAgo)
  if (planned.length) {
    lines.push('\nALREADY PLANNED THIS WEEK (avoid repeating these topics; balance the format mix):')
    for (const i of planned.slice(0, 10)) lines.push(`- ${i.planned_for}: ${i.format}, ${i.audience}${i.creative_style ? `, ${i.creative_style}` : ''} — ${clip(i.title, 60)}`)
  }
  const unused = data.ideas.filter((i) => i.status === 'idea').slice(0, 8)
  if (unused.length) {
    lines.push('\nUNUSED IDEAS IN THE BANK (may be reused or improved):')
    for (const i of unused) lines.push(`- ${i.format}, ${i.audience}: ${clip(i.title, 60)}`)
  }
  return lines.join('\n')
}
