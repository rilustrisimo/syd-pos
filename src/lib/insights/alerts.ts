// Alert rules over the computed insights. Each alert has a stable key so it
// is written to notifications at most once per day.

import type { CustomerInsight } from './customers'
import type { MarginLeak } from './products'
import type { ReorderRow } from './reorder'
import type { MonthForecast } from './forecast'

export type AlertLevel = 'critical' | 'warning' | 'info'
export interface InsightAlert {
  key: string; level: AlertLevel
  area: 'stock' | 'customers' | 'credit' | 'margin' | 'forecast' | 'weather' | 'cash'
  title: string; message: string; href?: string
}

const peso = (n: number) => '₱' + Math.round(n).toLocaleString('en-PH')
const qty = (n: number) => n.toLocaleString('en-PH', { maximumFractionDigits: 1 })

export function buildAlerts(input: {
  reorder: ReorderRow[]; customers: CustomerInsight[]; leaks: MarginLeak[]
  weekly: { thisWeekForecast: number; last4Avg: number; nextWeeks: { week: string; revenue: number }[] }
  months: MonthForecast[]; marginNow: number; marginPrev: number
  rain: { day: string; rain_mm: number; heavy: boolean }[]
  deadValue: number; apDue30: number; cashIn30: number
}): InsightAlert[] {
  const out: InsightAlert[] = []

  // Stock: order now (A/B items first).
  const orderNow = input.reorder.filter((r) => r.status === 'order_now' && r.dailyDemand > 0)
    .sort((a, b) => (a.abc ?? 'Z').localeCompare(b.abc ?? 'Z') || (a.daysOfCover ?? 0) - (b.daysOfCover ?? 0))
  for (const r of orderNow.filter((r) => r.abc === 'A' || r.abc === 'B').slice(0, 8)) {
    const cover = r.daysOfCover != null ? Math.max(0, r.daysOfCover) : 0
    out.push({
      key: `stock:${r.product_id}`, level: r.onHand <= 0 || cover < r.leadDays / 2 ? 'critical' : 'warning', area: 'stock',
      title: `${r.name}: ${r.onHand <= 0 ? 'out of stock' : `~${Math.floor(cover)} days left`}`,
      message: `Sells ~${qty(r.dailyDemand * 7)} ${r.uom}/week; delivery takes ~${r.leadDays} days. Order ~${qty(r.suggestQty)} ${r.uom} (${peso(r.suggestValue)}).`,
      href: '/purchases/reorder',
    })
  }
  if (orderNow.length > 8) out.push({ key: 'stock:more', level: 'info', area: 'stock', title: `${orderNow.length} products are at or below their reorder point`, message: 'See the Forecast tab for the full order list.' })

  // Customers slipping (top value).
  for (const c of input.customers.filter((c) => c.segment === 'Slipping' || c.segment === 'At risk').slice(0, 5)) {
    out.push({
      key: `cust:${c.customer_id}`, level: c.segment === 'At risk' ? 'warning' : 'info', area: 'customers',
      title: `${c.name} hasn't bought in ${c.recencyDays} days`,
      message: c.cadenceDays ? `Usually buys every ~${Math.round(c.cadenceDays)} days (${peso(c.revenue)} so far this year). Worth a call.` : `Spending is down ${Math.abs(Math.round(c.trendPct ?? 0))}% vs the previous 90 days.`,
      href: `/customers/${c.customer_id}`,
    })
  }

  // Credit.
  for (const c of input.customers.filter((c) => c.open_ar > 0 && ((c.arAgeDays ?? 0) > 60 || c.overLimit)).sort((a, b) => b.open_ar - a.open_ar).slice(0, 5)) {
    out.push({
      key: `ar:${c.customer_id}`, level: (c.arAgeDays ?? 0) > 90 ? 'critical' : 'warning', area: 'credit',
      title: `${c.name} owes ${peso(c.open_ar)}`,
      message: `${c.overLimit ? `Over the ${peso(c.credit_limit)} credit limit. ` : ''}Oldest unpaid sale is ${c.arAgeDays} days old.`,
      href: '/reports/ar-aging',
    })
  }

  // Margin.
  const below = input.leaks.filter((l) => l.kind === 'below_cost')
  if (below.length) {
    const loss = below.reduce((a, l) => a + l.impact, 0)
    out.push({ key: 'margin:below_cost', level: loss > 2000 ? 'warning' : 'info', area: 'margin', title: `Sold below cost: ${peso(loss)} lost`, message: `${below.length} product(s), e.g. ${below.slice(0, 3).map((l) => l.name).join(', ')}.` })
  }
  if (input.marginPrev - input.marginNow >= 3) {
    out.push({ key: 'margin:drop', level: 'warning', area: 'margin', title: `Gross margin down to ${input.marginNow.toFixed(1)}%`, message: `It was ${input.marginPrev.toFixed(1)}% in the previous 4 weeks. Check cost increases not yet in prices.` })
  }
  for (const l of input.leaks.filter((l) => l.kind === 'cost_not_passed').slice(0, 3)) {
    out.push({ key: `margin:cost:${l.product_id}`, level: 'info', area: 'margin', title: `${l.name}: price may be too low`, message: l.detail })
  }

  // Forecast waves.
  const wave = input.weekly.nextWeeks.find((w) => input.weekly.last4Avg > 0 && w.revenue > input.weekly.last4Avg * 1.25)
  if (wave) {
    out.push({ key: `forecast:wave:${wave.week}`, level: 'info', area: 'forecast', title: `Busier week ahead (week of ${wave.week})`, message: `Expected ~${peso(wave.revenue)}, ${Math.round((wave.revenue / input.weekly.last4Avg - 1) * 100)}% above the recent average. Stock up on fast movers.` })
  }
  const next = input.months[1]
  const cur = input.months[0]
  if (next && cur && next.revenue > cur.revenue * 1.15) {
    out.push({ key: `forecast:month:${next.month}`, level: 'info', area: 'forecast', title: `${next.month} looks ${Math.round((next.revenue / cur.revenue - 1) * 100)}% busier`, message: `Forecast ${peso(next.revenue)} (range ${peso(next.lo)}–${peso(next.hi)}). Plan stock and cash ahead.` })
  }

  // Weather.
  const heavy = input.rain.filter((r) => r.heavy).slice(0, 3)
  if (heavy.length) out.push({ key: `weather:${heavy[0].day}`, level: 'info', area: 'weather', title: `Heavy rain expected (${heavy.map((h) => h.day.slice(5)).join(', ')})`, message: 'Expect fewer walk-ins; schedule deliveries around it and keep roofing/sealant stocked.' })

  // Cash.
  if (input.deadValue > 20000) out.push({ key: 'cash:dead', level: 'info', area: 'cash', title: `${peso(input.deadValue)} tied up in stock unsold for 90+ days`, message: 'Consider a promo, bundle, or return to supplier.' })
  if (input.apDue30 > input.cashIn30 && input.apDue30 > 0) out.push({ key: 'cash:ap', level: 'warning', area: 'cash', title: `${peso(input.apDue30)} due to suppliers in 30 days`, message: `More than the ~${peso(input.cashIn30)} gross profit expected in the same period.` })

  const rank = { critical: 0, warning: 1, info: 2 }
  return out.sort((a, b) => rank[a.level] - rank[b.level])
}
