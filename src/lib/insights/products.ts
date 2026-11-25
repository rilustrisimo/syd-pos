// Product insights: ABC–XYZ classes, category profit, margin leaks,
// price-vs-volume changes, and frequently-bought-together pairs.

import type { InventoryRow, RawInsights } from './types'
import { pct } from './kpis'

export type Abc = 'A' | 'B' | 'C'
export type Xyz = 'X' | 'Y' | 'Z'

export interface ProductStat {
  product_id: string; code: string; name: string; category: string; uom: string
  qty: number; revenue: number; cogs: number; profit: number; marginPct: number
  orders: number; belowCostLines: number; belowCostLoss: number; discounts: number
  abc: Abc | null; xyz: Xyz | null; cv: number | null; sharePct: number
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)
const sd = (a: number[]) => { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)) : 0 }

export function productStats(raw: RawInsights): ProductStat[] {
  const inv = new Map(raw.inventory.map((i) => [i.product_id, i]))
  const list: ProductStat[] = raw.productRange.map((r) => {
    const i = inv.get(r.product_id)
    return {
      product_id: r.product_id, code: i?.code ?? '', name: i?.name ?? 'Unknown product', category: i?.category ?? 'Uncategorized', uom: i?.base_uom ?? '',
      qty: r.qty_base, revenue: r.revenue, cogs: r.cogs, profit: 0, marginPct: 0, orders: r.orders,
      belowCostLines: r.below_cost_lines, belowCostLoss: r.below_cost_loss, discounts: r.discounts,
      abc: null, xyz: null, cv: null, sharePct: 0,
    }
  })
  const total = list.reduce((a, p) => a + Math.max(0, p.revenue), 0)
  list.sort((a, b) => b.revenue - a.revenue)
  let cum = 0
  for (const p of list) {
    p.profit = p.revenue - p.cogs
    p.marginPct = pct(p.profit, p.revenue)
    p.sharePct = pct(Math.max(0, p.revenue), total)
    cum += p.sharePct
    p.abc = p.revenue <= 0 ? null : cum - p.sharePct < 80 ? 'A' : cum - p.sharePct < 95 ? 'B' : 'C'
  }
  // XYZ from the variability of weekly demand over the last 26 weeks.
  const wq = new Map(raw.series.map((x) => [x.product_id, x.qty.slice(-26)]))
  for (const p of list) {
    const series = wq.get(p.product_id)
    if (!series || !series.length) continue
    const m = mean(series)
    if (m <= 0) continue
    p.cv = sd(series) / m
    p.xyz = p.cv < 0.5 ? 'X' : p.cv < 1 ? 'Y' : 'Z'
  }
  return list
}

export function abcXyzMatrix(stats: ProductStat[]) {
  const cells: Record<string, { count: number; revenue: number }> = {}
  for (const a of ['A', 'B', 'C']) for (const x of ['X', 'Y', 'Z']) cells[a + x] = { count: 0, revenue: 0 }
  for (const p of stats) if (p.abc && p.xyz) { cells[p.abc + p.xyz].count++; cells[p.abc + p.xyz].revenue += p.revenue }
  return cells
}

export function categoryStats(stats: ProductStat[], inventory: InventoryRow[], rangeDays: number) {
  const by = new Map<string, { category: string; revenue: number; cogs: number; profit: number; stockValue: number; products: number }>()
  for (const p of stats) {
    const c = by.get(p.category) ?? { category: p.category, revenue: 0, cogs: 0, profit: 0, stockValue: 0, products: 0 }
    c.revenue += p.revenue; c.cogs += p.cogs; c.profit += p.profit; c.products++
    by.set(p.category, c)
  }
  for (const i of inventory) {
    const c = by.get(i.category) ?? { category: i.category, revenue: 0, cogs: 0, profit: 0, stockValue: 0, products: 0 }
    c.stockValue += Math.max(0, i.stock_value)
    by.set(i.category, c)
  }
  const annual = 365 / Math.max(1, rangeDays)
  return [...by.values()].map((c) => ({
    ...c,
    marginPct: pct(c.profit, c.revenue),
    gmroi: c.stockValue ? (c.profit * annual) / c.stockValue : null,
    turns: c.stockValue ? (c.cogs * annual) / c.stockValue : null,
  })).sort((a, b) => b.profit - a.profit)
}

export interface MarginLeak { product_id: string; name: string; kind: 'below_cost' | 'margin_drop' | 'cost_not_passed' | 'heavy_discount'; detail: string; impact: number }

export function marginLeaks(raw: RawInsights, stats: ProductStat[]): MarginLeak[] {
  const leaks: MarginLeak[] = []
  const inv = new Map(raw.inventory.map((i) => [i.product_id, i]))
  const name = (id: string) => inv.get(id)?.name ?? 'Unknown product'

  // 1. Sold below cost in the range.
  for (const p of stats) {
    if (p.belowCostLines > 0) leaks.push({ product_id: p.product_id, name: p.name, kind: 'below_cost', detail: `${p.belowCostLines} sale line(s) below cost`, impact: p.belowCostLoss })
  }

  // 2. Margin in the last 4 weeks vs the 12 weeks before (series rev/cogs hold the last 16 weeks).
  const sumOf = (a: number[]) => a.reduce((x, y) => x + y, 0)
  for (const sr of raw.series) {
    if (sr.rev.length < 16) continue
    const x = { r: [sumOf(sr.rev.slice(-4)), sumOf(sr.cogs.slice(-4))], p: [sumOf(sr.rev.slice(0, 12)), sumOf(sr.cogs.slice(0, 12))] }
    const id = sr.product_id
    if (x.r[0] < 2000 || x.p[0] < 2000) continue
    const mr = pct(x.r[0] - x.r[1], x.r[0]), mp = pct(x.p[0] - x.p[1], x.p[0])
    if (mp - mr >= 5) leaks.push({ product_id: id, name: name(id), kind: 'margin_drop', detail: `margin ${mp.toFixed(1)}% → ${mr.toFixed(1)}% (last 4 weeks)`, impact: ((mp - mr) / 100) * x.r[0] })
  }

  // 3. Current cost vs current price: cost went up but the price didn't.
  for (const p of stats) {
    const i = inv.get(p.product_id)
    if (!i || !i.selling_price || !i.unit_cost || p.revenue < 2000) continue
    const costPerSellUnit = i.unit_cost / (i.sell_conv || 1)
    const nowMargin = pct(i.selling_price - costPerSellUnit, i.selling_price)
    if (p.marginPct - nowMargin >= 5 || nowMargin < 5) {
      leaks.push({ product_id: p.product_id, name: p.name, kind: 'cost_not_passed', detail: `price ₱${i.selling_price.toFixed(2)} leaves ${nowMargin.toFixed(1)}% margin at today's cost (was ${p.marginPct.toFixed(1)}%)`, impact: ((p.marginPct - nowMargin) / 100) * p.revenue / 4 })
    }
  }

  // 4. Heavy discounting.
  for (const p of stats) {
    if (p.revenue > 5000 && p.discounts / (p.revenue + p.discounts) > 0.08) {
      leaks.push({ product_id: p.product_id, name: p.name, kind: 'heavy_discount', detail: `discounts are ${pct(p.discounts, p.revenue + p.discounts).toFixed(1)}% of list price`, impact: p.discounts })
    }
  }
  return leaks.sort((a, b) => b.impact - a.impact)
}

/** Average price and volume: first half vs second half of the last 16 weeks. */
export function priceVolume(raw: RawInsights) {
  const sumOf = (a: number[]) => a.reduce((x, y) => x + y, 0)
  const agg = new Map<string, { a: [number, number]; b: [number, number] }>()
  for (const sr of raw.series) {
    if (sr.rev.length < 16) continue
    const q = sr.qty.slice(-16)
    agg.set(sr.product_id, { a: [sumOf(sr.rev.slice(0, 8)), sumOf(q.slice(0, 8))], b: [sumOf(sr.rev.slice(8)), sumOf(q.slice(8))] })
  }
  const inv = new Map(raw.inventory.map((i) => [i.product_id, i]))
  const out: { product_id: string; name: string; priceChange: number; volumeChange: number; revenueChange: number }[] = []
  for (const [id, x] of agg) {
    if (x.a[1] <= 0 || x.b[1] <= 0 || x.a[0] < 3000) continue
    const pa = x.a[0] / x.a[1], pb = x.b[0] / x.b[1]
    const priceChange = ((pb - pa) / pa) * 100
    if (Math.abs(priceChange) < 4) continue
    out.push({ product_id: id, name: inv.get(id)?.name ?? 'Unknown', priceChange, volumeChange: ((x.b[1] - x.a[1]) / x.a[1]) * 100, revenueChange: ((x.b[0] - x.a[0]) / x.a[0]) * 100 })
  }
  return out.sort((a, b) => Math.abs(b.priceChange) - Math.abs(a.priceChange)).slice(0, 25)
}

export function basketPairs(raw: RawInsights) {
  const inv = new Map(raw.inventory.map((i) => [i.product_id, i.name]))
  return raw.basketPairs.map((p) => ({ a: inv.get(p.product_a) ?? '?', b: inv.get(p.product_b) ?? '?', together: p.together }))
}
