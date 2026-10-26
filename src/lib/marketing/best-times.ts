// "When are our people most active?" — a 7×24 score grid in Manila time
// (UTC+8, no DST), blended from three signals:
//
//   1. Organic posts: engagement rate (reactions + comments + shares +
//      saves ÷ reach) by the hour each post went out. Shrunk toward the
//      page's average (k = 3 posts) so one lucky post can't dominate, and
//      spread to neighbouring hours since posts are sparse.
//   2. Website visits: GA4 sessions by weekday/hour (or hour only).
//   3. A starting assumption for local Facebook use (lunch and evening
//      peaks) that carries the grid while there's little data and fades
//      out as real data grows.
//
// Pure functions — used by the Insights page and the Gemini planner.

export interface PostSample {
  published_at: string
  reach: number | null
  reactions: number | null
  comments: number | null
  shares: number | null
  saves: number | null
}

export interface SiteSample {
  day: number | null // 0 = Sunday; null when the export was hour-only
  hour: number
  sessions: number
}

/** Meta ads "Time of day" breakdown: responses (results + link clicks) per hour. */
export interface AdHourSample {
  hour: number
  impressions: number
  actions: number
}

export type Confidence = 'low' | 'medium' | 'high'

export interface BestTimes {
  /** grid[day][hour], 0..1, day 0 = Sunday. */
  grid: number[][]
  topSlots: { day: number; hour: number; score: number }[][]
  confidence: Confidence
  postCount: number
  sessionCount: number
  adImpressions: number
  weights: { assumption: number; posts: number; site: number; ads: number }
}

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000
const SHRINK_K = 3

export function manilaDayHour(iso: string): { day: number; hour: number } {
  const d = new Date(new Date(iso).getTime() + MANILA_OFFSET_MS)
  return { day: d.getUTCDay(), hour: d.getUTCHours() }
}

export function manilaToday(now = new Date()): { day: number; date: string } {
  const d = new Date(now.getTime() + MANILA_OFFSET_MS)
  return { day: d.getUTCDay(), date: d.toISOString().slice(0, 10) }
}

export function formatHour(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12
  return `${h}:00 ${hour < 12 ? 'AM' : 'PM'}`
}

export function formatSlot(day: number, hour: number): string {
  return `${DAY_SHORT[day]} ${formatHour(hour)}`
}

// Starting assumption: evening scroll (7–9 PM) strongest, lunch (12 PM)
// next, early morning and after-work moderate, overnight near zero.
// Weekends get a little more midday activity.
function assumption(day: number, hour: number): number {
  const curve = [
    0.05, 0.03, 0.02, 0.02, 0.03, 0.12, 0.3, 0.42, 0.38, 0.32, 0.35, 0.55,
    0.72, 0.6, 0.38, 0.35, 0.4, 0.55, 0.7, 0.92, 1.0, 0.85, 0.55, 0.22,
  ][hour]
  const weekend = day === 0 || day === 6
  return weekend && hour >= 9 && hour <= 16 ? Math.min(1, curve + 0.12) : curve
}

function emptyGrid(fill = 0): number[][] {
  return Array.from({ length: 7 }, () => Array(24).fill(fill))
}

function normalize(grid: number[][]): number[][] {
  const max = Math.max(...grid.flat())
  return max > 0 ? grid.map((row) => row.map((v) => v / max)) : grid
}

function engagementRate(p: PostSample): number | null {
  if (!p.reach || p.reach <= 0) return null
  const engaged = (p.reactions ?? 0) + (p.comments ?? 0) + (p.shares ?? 0) + (p.saves ?? 0)
  return engaged / p.reach
}

export function computeBestTimes(posts: PostSample[], site: SiteSample[], adHours: AdHourSample[] = []): BestTimes {
  // ── 1. Posts ──
  const rated = posts
    .map((p) => ({ ...manilaDayHour(p.published_at), rate: engagementRate(p) }))
    .filter((p): p is { day: number; hour: number; rate: number } => p.rate != null)
  const mean = rated.length ? rated.reduce((s, p) => s + p.rate, 0) / rated.length : 0
  const sum = emptyGrid()
  const weight = emptyGrid()
  for (const p of rated) {
    sum[p.day][p.hour] += p.rate
    weight[p.day][p.hour] += 1
  }
  const lift = emptyGrid(1)
  if (mean > 0) {
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const shrunk = (sum[d][h] + SHRINK_K * mean) / (weight[d][h] + SHRINK_K)
        lift[d][h] = shrunk / mean
      }
    }
  }
  // Light smoothing so neighbouring hours share some of a strong hour's
  // signal (posts are sparse) while the hour itself stays the peak.
  const postLift = lift.map((row) => row.map((v, h) => 0.6 * v + 0.2 * row[(h + 23) % 24] + 0.2 * row[(h + 1) % 24]))
  const postGrid = normalize(postLift)

  // ── 2. Site visits ──
  const siteRaw = emptyGrid()
  let sessionCount = 0
  for (const s of site) {
    if (s.hour < 0 || s.hour > 23) continue
    sessionCount += s.sessions
    const days = s.day == null ? [0, 1, 2, 3, 4, 5, 6] : [s.day]
    const share = s.day == null ? s.sessions / 7 : s.sessions
    for (const d of days) {
      siteRaw[d][s.hour] += share
      siteRaw[d][(s.hour + 23) % 24] += share * 0.4
      siteRaw[d][(s.hour + 1) % 24] += share * 0.4
    }
  }
  const siteGrid = normalize(siteRaw)

  // ── 3. Ad responses by hour (same for every weekday — Meta's time-of-day
  //    breakdown has no weekday). Response rate per impression, shrunk
  //    toward the overall rate with ~500 impressions of prior, so a quiet
  //    hour with a lucky click doesn't top the list.
  const hourImpr = Array(24).fill(0)
  const hourActs = Array(24).fill(0)
  for (const a of adHours) {
    if (a.hour < 0 || a.hour > 23) continue
    hourImpr[a.hour] += a.impressions
    hourActs[a.hour] += a.actions
  }
  const adImpressions = hourImpr.reduce((s, n) => s + n, 0)
  const adRate = adImpressions ? hourActs.reduce((s, n) => s + n, 0) / adImpressions : 0
  const adHourScore = hourImpr.map((impr, h) => (adRate > 0 ? (hourActs[h] + 500 * adRate) / (impr + 500) : 0))
  const adGrid = normalize(Array.from({ length: 7 }, () => adHourScore.map((v, h) => 0.6 * v + 0.2 * adHourScore[(h + 23) % 24] + 0.2 * adHourScore[(h + 1) % 24])))

  // ── 4. Blend ── real data takes over as it accumulates.
  const postsW = Math.min(1, rated.length / 30) * 0.75
  const siteW = Math.min(1, sessionCount / 300) * 0.3
  const adsW = adRate > 0 ? Math.min(1, adImpressions / 20000) * 0.35 : 0
  const assumptionW = Math.max(0.1, 1 - postsW - siteW - adsW)
  const total = postsW + siteW + adsW + assumptionW

  const blended = emptyGrid()
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      blended[d][h] = (
        assumption(d, h) * assumptionW +
        (rated.length ? postGrid[d][h] : 0) * postsW +
        (sessionCount ? siteGrid[d][h] : 0) * siteW +
        (adsW ? adGrid[d][h] : 0) * adsW
      ) / total
    }
  }
  const grid = normalize(blended)

  // Top 3 hours per day, at least 2 hours apart so they're real options.
  const topSlots = grid.map((row, day) => {
    const picks: { day: number; hour: number; score: number }[] = []
    const order = row.map((score, hour) => ({ day, hour, score })).sort((a, b) => b.score - a.score)
    for (const slot of order) {
      if (picks.every((p) => Math.abs(p.hour - slot.hour) >= 2)) picks.push(slot)
      if (picks.length === 3) break
    }
    return picks
  })

  const confidence: Confidence = rated.length >= 30 || (rated.length >= 15 && (sessionCount >= 300 || adImpressions >= 20000))
    ? 'high'
    : rated.length >= 10 || sessionCount >= 150 || adImpressions >= 10000 ? 'medium' : 'low'

  return {
    grid,
    topSlots,
    confidence,
    postCount: rated.length,
    sessionCount,
    adImpressions,
    weights: { assumption: assumptionW / total, posts: postsW / total, site: siteW / total, ads: adsW / total },
  }
}
