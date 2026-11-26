// Builds the full Insights bundle (one JSON object) used by the page, the
// AI brief, alerts, the monthly PDF and the AI export.

import type { RawInsights } from './types'
import { addDays, daysBetween, eachDay, monthKey, weekStart } from './dates'
import { branchComparison, cashCycle, dailySeries, growth, monthly, patterns, previousRange, totals, pct } from './kpis'
import { abcXyzMatrix, basketPairs, categoryStats, marginLeaks, priceVolume, productStats } from './products'
import { arAging, cohorts, customerInsights, quotationConversion, segmentSummary, slipping } from './customers'
import { backtest, calendarEffects, forecastMonthly, forecastProducts, rainOutlook, seasonality } from './forecast'
import { deadStock, reorderPlan, shrinkage, supplierPerformance } from './reorder'
import { buildAlerts } from './alerts'
import { holidaysFor } from './holidays'

export function buildBundle(raw: RawInsights) {
  const { from, to, today } = raw
  const prev = previousRange(from, to)
  const cur = totals(raw.dailyAll, raw.expensesAll, from, to)
  const before = totals(raw.dailyAll, raw.expensesAll, prev.from, prev.to)
  const months = monthly(raw.dailyAll, raw.expensesAll, raw.purchasesAll, today)
  const cash = cashCycle(raw)

  // Products
  const stats = productStats(raw)
  const leaks = marginLeaks(raw, stats)

  // Customers
  const cust = customerInsights(raw)
  const walkinAr = raw.customers.filter((c) => c.is_walkin).reduce((a, c) => a + c.open_ar, 0)

  // Forecast
  const season = seasonality(months)
  const fx = calendarEffects(raw)
  const last90 = totals(raw.dailyAll, raw.expensesAll, addDays(today, -89), today)
  const total12 = forecastMonthly(months, season, 12, today, last90.marginPct, fx)
  const { list: productFc, series } = forecastProducts(raw, season, fx)
  const topIds = stats.filter((s) => s.abc === 'A').map((s) => s.product_id).slice(0, 80)
  const bt = backtest(series, topIds)

  // Category forecast: monthly revenue per category (pre-summed in the database).
  const catMonths = new Map<string, Map<string, number>>()
  for (const r of raw.categoryMonths) {
    if (!catMonths.has(r.category)) catMonths.set(r.category, new Map())
    const m = monthKey(r.month)
    catMonths.get(r.category)!.set(m, (catMonths.get(r.category)!.get(m) ?? 0) + r.revenue)
  }
  const thisMonth = monthKey(today)
  const yearAgo = monthKey(addDays(today, -365))
  // Rank categories by the last 12 months.
  const catTotals = [...catMonths.entries()].map(([c, m]) => ({ c, total: [...m.entries()].filter(([k]) => k > yearAgo).reduce((a, [, v]) => a + v, 0) })).sort((a, b) => b.total - a.total)
  const categoryFc = catTotals.slice(0, 12).map(({ c }) => {
    const m = catMonths.get(c)!
    const rows = [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, revenue]) => ({ month, revenue, partial: month === thisMonth }))
    const f = forecastMonthly(rows, season, 4, today, last90.marginPct, fx)
    const last3 = rows.filter((r) => !r.partial).slice(-3)
    return { category: c, last3Avg: last3.length ? last3.reduce((a, r) => a + r.revenue, 0) / last3.length : 0, months: f.months.map((x) => ({ month: x.month, revenue: x.revenue, lo: x.lo, hi: x.hi })) }
  })

  // Reorder / inventory
  const reorder = reorderPlan(raw, productFc, series, stats)
  const dead = deadStock(reorder)
  const lostSales90 = reorder.reduce((a, r) => a + r.lostSales90, 0)

  // Weekly revenue view (actual last 8 weeks + forecast next 4 from products).
  const thisWeek = weekStart(today)
  const weeklyActual: { week: string; revenue: number }[] = []
  for (let k = 8; k >= 1; k--) {
    const w = addDays(thisWeek, -7 * k)
    weeklyActual.push({ week: w, revenue: raw.dailyAll.filter((d) => d.ph_date >= w && d.ph_date <= addDays(w, 6)).reduce((a, d) => a + d.revenue, 0) })
  }
  const nextWeeks = [0, 1, 2, 3].map((k) => ({ week: addDays(thisWeek, 7 * k), revenue: productFc.reduce((a, p) => a + (p.weeks[k]?.qty ?? 0) * (p.total4w > 0 ? p.value4w / p.total4w : 0), 0) }))
  const last4Avg = weeklyActual.slice(-4).reduce((a, w) => a + w.revenue, 0) / 4

  const rain = rainOutlook(raw, fx)
  const m4 = totals(raw.dailyAll, raw.expensesAll, addDays(today, -27), today)
  const m4prev = totals(raw.dailyAll, raw.expensesAll, addDays(today, -55), addDays(today, -28))
  const alerts = buildAlerts({
    reorder, customers: cust, leaks,
    weekly: { thisWeekForecast: nextWeeks[0].revenue, last4Avg, nextWeeks: nextWeeks.slice(1) },
    months: total12.months, marginNow: m4.marginPct, marginPrev: m4prev.marginPct,
    rain, deadValue: dead.buckets[1].value, apDue30: cash.apDue30,
    cashIn30: (last90.grossProfit / 90) * 30,
  })

  const invByName = new Map(raw.inventory.map((i) => [i.product_id, i]))
  const rangeDays = daysBetween(from, to) + 1
  const year = Number(today.slice(0, 4))

  return {
    meta: { from, to, today, branchId: raw.branchId, refreshedAt: raw.refreshedAt, branches: raw.branches, prevFrom: prev.from, prevTo: prev.to, rangeDays, generatedAt: new Date().toISOString() },
    overview: {
      current: cur, previous: before,
      // No comparison when the previous period had no trading (e.g. before the store opened).
      hasPrevious: before.sales > 0,
      growth: before.sales > 0 ? {
        revenue: growth(cur.revenue, before.revenue), grossProfit: growth(cur.grossProfit, before.grossProfit),
        netProfit: growth(cur.netProfit, before.netProfit), sales: growth(cur.sales, before.sales),
        avgTicket: growth(cur.avgTicket, before.avgTicket), newCustomers: growth(cur.newCustomers, before.newCustomers),
      } : { revenue: null, grossProfit: null, netProfit: null, sales: null, avgTicket: null, newCustomers: null },
      cash,
    },
    sales: {
      daily: dailySeries(raw.dailyAll, from, to),
      months,
      patterns: patterns(raw.dailyAll, from, to),
      hourly: raw.hourly,
      paymentMix: raw.paymentMix.sort((a, b) => b.amount - a.amount),
      deliveries: (() => {
        const bands = [{ label: '0–3 km', max: 3 }, { label: '3–7 km', max: 7 }, { label: '7–15 km', max: 15 }, { label: '15+ km', max: Infinity }]
          .map((b) => ({ ...b, count: 0, revenue: 0, fees: 0 }))
        const places = new Map<string, { place: string; count: number; revenue: number }>()
        for (const d of raw.deliveries) {
          const b = bands.find((x) => (d.distance_km ?? 0) <= x.max)!
          b.count++; b.revenue += d.revenue; b.fees += d.delivery_fee
          const p = places.get(d.place) ?? { place: d.place, count: 0, revenue: 0 }
          p.count++; p.revenue += d.revenue; places.set(d.place, p)
        }
        return { bands: bands.map((b) => ({ label: b.label, count: b.count, revenue: b.revenue, fees: b.fees })), places: [...places.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 15) }
      })(),
      branches: branchComparison(raw, from, to),
    },
    products: {
      counts: { sold: stats.filter((p) => p.revenue > 0).length, a: stats.filter((p) => p.abc === 'A').length },
      top: stats.slice(0, 50),
      all: stats,
      matrix: abcXyzMatrix(stats),
      categories: categoryStats(stats, raw.inventory, rangeDays),
      leaks: leaks.slice(0, 40),
      priceVolume: priceVolume(raw),
      pairs: basketPairs(raw),
    },
    customers: {
      count: cust.length,
      list: cust,
      segments: segmentSummary(cust),
      slipping: slipping(cust),
      projects: cust.filter((c) => c.segment === 'Project').sort((a, b) => b.revenue - a.revenue).slice(0, 20),
      top: cust.slice(0, 20).map((c) => ({ ...c, sharePct: pct(c.revenue, cust.reduce((a, x) => a + x.revenue, 0)) })),
      ar: arAging(cust, walkinAr),
      cohorts: cohorts(raw),
      quotations: quotationConversion(raw),
      walkinShare: pct(raw.customers.filter((c) => c.is_walkin).reduce((a, c) => a + c.revenue, 0), raw.customers.reduce((a, c) => a + c.revenue, 0)),
    },
    inventory: {
      statusCounts: reorder.reduce<Record<string, number>>((a, r) => { a[r.status] = (a[r.status] ?? 0) + 1; return a }, {}),
      reorder,
      dead,
      lostSales90,
      stockoutProducts: reorder.filter((r) => r.stockoutDays90 > 0).sort((a, b) => b.lostSales90 - a.lostSales90).slice(0, 25),
      overstock: reorder.filter((r) => r.status === 'overstock').sort((a, b) => b.stockValue - a.stockValue).slice(0, 25),
      suppliers: supplierPerformance(raw),
      shrinkage: shrinkage(raw),
    },
    forecast: {
      total12: total12.months,
      sigma: total12.sigma,
      categories: categoryFc,
      products: productFc.slice(0, 150).map((p) => ({ ...p, name: invByName.get(p.product_id)?.name ?? '?', uom: invByName.get(p.product_id)?.base_uom ?? '', category: invByName.get(p.product_id)?.category ?? '' })),
      weeklyActual, nextWeeks,
      season, effects: fx, backtest: bt, rain,
      holidays: [...holidaysFor(year), ...holidaysFor(year + 1)].filter((h) => h.day >= today).slice(0, 10),
      historyMonths: months.filter((m) => !m.partial).length,
      upcomingDays: eachDay(today, addDays(today, 13)).length,
    },
    alerts,
  }
}

export type InsightsBundle = ReturnType<typeof buildBundle>

/**
 * What the browser needs: the full lists (every product, customer and
 * stock row) stay on the server for the AI export/PDF; the page gets the
 * top rows plus counts, keeping the response small for multi-year data.
 */
export function slimForPage(b: InsightsBundle): InsightsBundle {
  const forecastIds = new Set(b.forecast.products.map((p) => p.product_id))
  const keepStatus = new Set(['order_now', 'order_soon'])
  return {
    ...b,
    products: { ...b.products, all: [] },
    customers: { ...b.customers, list: [] },
    inventory: { ...b.inventory, reorder: b.inventory.reorder.filter((r) => forecastIds.has(r.product_id) || keepStatus.has(r.status)) },
  }
}
