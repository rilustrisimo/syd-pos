// Customer insights: RFM segments judged against each customer's own buying
// rhythm (a contractor who buys every 3 weeks isn't "lost" after 20 days),
// slipping accounts, cohorts/retention, AR aging and credit risk.

import type { CustomerRow, RawInsights } from './types'
import { addMonths, daysBetween, monthKey } from './dates'

export type Segment = 'Champion' | 'Loyal' | 'New' | 'Slipping' | 'At risk' | 'Lost' | 'Occasional'

export interface CustomerInsight extends CustomerRow {
  recencyDays: number; cadenceDays: number | null; overdueRatio: number | null
  segment: Segment; r: number; f: number; m: number
  trendPct: number | null; arAgeDays: number | null; overLimit: boolean
}

export const SEGMENT_HELP: Record<Segment, string> = {
  Champion: 'Top spenders still buying on their usual rhythm — protect them.',
  Loyal: 'Regulars buying on rhythm.',
  New: 'First bought in the last 60 days — follow up to make them regulars.',
  Slipping: 'Regulars now late vs their own usual gap, or spending much less — call them.',
  'At risk': 'Valuable customers gone quiet for a long time — win back with an offer.',
  Lost: 'No purchase in a long time.',
  Occasional: 'One-off or irregular buyers.',
}

/** Quintile (1–5) of v within sorted values, by binary search (O(log n)). */
function quintile(sorted: number[], v: number): number {
  if (!sorted.length) return 3
  let lo = 0, hi = sorted.length
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < v) lo = mid + 1; else hi = mid }
  return Math.min(5, 1 + Math.floor((lo / sorted.length) * 5))
}

export function customerInsights(raw: RawInsights): CustomerInsight[] {
  const named = raw.customers.filter((c) => !c.is_walkin && c.orders > 0 && c.last_date)
  const revs = named.map((c) => c.revenue).sort((a, b) => a - b)
  const freqs = named.map((c) => c.buy_days).sort((a, b) => a - b)
  const recencies = named.map((c) => daysBetween(c.last_date!, raw.today)).sort((a, b) => a - b)
  const sortedRev = [...revs].reverse()
  const top20 = sortedRev[Math.floor(sortedRev.length * 0.2)] ?? Infinity
  const top40 = sortedRev[Math.floor(sortedRev.length * 0.4)] ?? Infinity

  return named.map((c) => {
    const recencyDays = daysBetween(c.last_date!, raw.today)
    const cadenceDays = c.median_gap_days != null && c.buy_days >= 3 ? Math.max(1, c.median_gap_days) : null
    const overdueRatio = cadenceDays ? recencyDays / Math.max(cadenceDays, 7) : null
    const trendPct = c.rev_prev_90 > 0 ? ((c.rev_90 - c.rev_prev_90) / c.rev_prev_90) * 100 : null
    const isNew = daysBetween(c.first_date!, raw.today) <= 60 && c.buy_days <= 2
    const lostAfter = Math.max(150, (cadenceDays ?? 45) * 4)

    let segment: Segment
    if (isNew) segment = 'New'
    else if (recencyDays > lostAfter) segment = c.revenue >= top40 ? 'At risk' : 'Lost'
    else if (cadenceDays && overdueRatio! > 3 && c.revenue >= top40) segment = 'At risk'
    else if (cadenceDays && (overdueRatio! > 1.5 || (trendPct != null && trendPct < -50 && c.rev_prev_90 > 5000))) segment = 'Slipping'
    else if (c.revenue >= top20 && recencyDays <= Math.max(45, (cadenceDays ?? 30) * 1.5)) segment = 'Champion'
    else if (c.buy_days >= 4 && recencyDays <= Math.max(45, (cadenceDays ?? 30) * 1.5)) segment = 'Loyal'
    else segment = recencyDays > 120 ? 'Lost' : 'Occasional'

    return {
      ...c, recencyDays, cadenceDays, overdueRatio, segment, trendPct,
      r: 6 - quintile(recencies, recencyDays),
      f: quintile(freqs, c.buy_days), m: quintile(revs, c.revenue),
      arAgeDays: c.oldest_unpaid ? daysBetween(c.oldest_unpaid, raw.today) : null,
      overLimit: c.credit_limit > 0 && c.open_ar > c.credit_limit,
    }
  }).sort((a, b) => b.revenue - a.revenue)
}

export function segmentSummary(list: CustomerInsight[]) {
  const order: Segment[] = ['Champion', 'Loyal', 'New', 'Slipping', 'At risk', 'Occasional', 'Lost']
  return order.map((s) => {
    const xs = list.filter((c) => c.segment === s)
    return { segment: s, count: xs.length, revenue: xs.reduce((a, c) => a + c.revenue, 0), rev90: xs.reduce((a, c) => a + c.rev_90, 0), help: SEGMENT_HELP[s] }
  })
}

/** Slipping and at-risk regulars, most valuable first — the call list. */
export function slipping(list: CustomerInsight[]) {
  return list.filter((c) => c.segment === 'Slipping' || c.segment === 'At risk').sort((a, b) => b.revenue - a.revenue).slice(0, 30)
}

export function arAging(list: CustomerInsight[], walkinAr: number) {
  const buckets = [
    { label: 'Current (0–30 days)', min: 0, max: 30, amount: 0, customers: 0 },
    { label: '31–60 days', min: 31, max: 60, amount: 0, customers: 0 },
    { label: '61–90 days', min: 61, max: 90, amount: 0, customers: 0 },
    { label: 'Over 90 days', min: 91, max: Infinity, amount: 0, customers: 0 },
  ]
  for (const c of list) {
    if (c.open_ar <= 0.009 || c.arAgeDays == null) continue
    const b = buckets.find((x) => c.arAgeDays! >= x.min && c.arAgeDays! <= x.max)!
    b.amount += c.open_ar; b.customers++
  }
  return { buckets, walkinAr, debtors: list.filter((c) => c.open_ar > 0.009).sort((a, b) => b.open_ar - a.open_ar).slice(0, 30) }
}

/** Monthly cohorts (last 12 months) by first purchase month: % still buying N months later. */
export function cohorts(raw: RawInsights) {
  const thisMonth = monthKey(raw.today)
  const oldest = monthKey(addMonths(raw.today, -11))
  const first = new Map<string, string>()
  for (const c of raw.customers) {
    if (c.is_walkin || !c.first_date) continue
    const m = monthKey(c.first_date)
    if (m >= oldest) first.set(c.customer_id, m)
  }
  const months = new Map<string, Set<string>>()
  for (const r of raw.customerMonths) {
    if (!first.has(r.customer_id) || r.orders <= 0) continue
    if (!months.has(r.customer_id)) months.set(r.customer_id, new Set())
    months.get(r.customer_id)!.add(monthKey(r.month))
  }
  const byCohort = new Map<string, string[]>()
  for (const [id, m] of first) { if (!byCohort.has(m)) byCohort.set(m, []); byCohort.get(m)!.push(id) }
  return [...byCohort.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([cohort, ids]) => {
    const retention: (number | null)[] = []
    for (let k = 1; k <= 11; k++) {
      const m = monthKey(addMonths(cohort + '-01', k))
      if (m > thisMonth) { retention.push(null); continue }
      retention.push((ids.filter((id) => months.get(id)?.has(m)).length / ids.length) * 100)
    }
    return { cohort, size: ids.length, retention }
  })
}

export function quotationConversion(raw: RawInsights) {
  const rows = [...raw.quotations].sort((a, b) => a.month.localeCompare(b.month))
  const q = rows.reduce((a, r) => a + r.quotes, 0)
  const c = rows.reduce((a, r) => a + r.converted, 0)
  const qa = rows.reduce((a, r) => a + r.quoted_amount, 0)
  const ca = rows.reduce((a, r) => a + r.converted_amount, 0)
  return { rows, rate: q ? (c / q) * 100 : 0, amountRate: qa ? (ca / qa) * 100 : 0, quotes: q, converted: c }
}
