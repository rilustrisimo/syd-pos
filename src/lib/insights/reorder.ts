// Reorder planning per product (periodic review, weekly ordering):
//   reorder point  = daily demand × lead time + safety stock
//   safety stock   = z(service level by ABC class) × σ_daily × √lead time
//   order-up-to    = daily demand × (lead time + review period) + safety stock
// Delivery time comes from the supplier's setting ("Delivery time (days)"),
// else real gaps between PO date and receiving, else 2 days. Also flags dead
// stock and overstock.

import type { InventoryRow, RawInsights } from './types'
import type { ProductForecast, ProductSeries } from './forecast'
import type { ProductStat } from './products'
import { daysBetween } from './dates'

const Z: Record<string, number> = { A: 1.645, B: 1.2816, C: 1.0364 } // 95% / 90% / 85%
const REVIEW_DAYS = 7
/** Delivery time when neither the supplier setting nor PO dates say (POs are usually entered on arrival). */
export const DEFAULT_LEAD_DAYS = 2

export type StockStatus = 'order_now' | 'order_soon' | 'ok' | 'overstock' | 'dead' | 'no_demand'

export interface ReorderRow {
  product_id: string; code: string; name: string; category: string; uom: string; abc: string | null
  onHand: number; investorQty: number; stockValue: number
  dailyDemand: number; leadDays: number; leadSource: 'supplier' | 'measured' | 'default'
  safetyStock: number; reorderPoint: number; orderUpTo: number; suggestQty: number; suggestValue: number
  daysOfCover: number | null; stockoutDays90: number; lostSales90: number
  lastSale: string | null; daysSinceSale: number | null
  status: StockStatus
}

export function reorderPlan(
  raw: RawInsights, forecasts: ProductForecast[], series: Map<string, ProductSeries>, stats: ProductStat[]
): ReorderRow[] {
  const fc = new Map(forecasts.map((f) => [f.product_id, f]))
  const abc = new Map(stats.map((s) => [s.product_id, s.abc]))

  return raw.inventory.filter((i) => i.is_active || i.qty_on_hand > 0).map((i: InventoryRow) => {
    const f = fc.get(i.product_id)
    const s = series.get(i.product_id)
    const dailyDemand = f ? f.avgWeekly / 7 : 0
    const sigmaDaily = f ? f.sigmaWeekly / Math.sqrt(7) : 0
    const leadSource = i.lead_days != null && i.lead_source ? i.lead_source : 'default'
    const leadDays = Math.max(1, Math.round(i.lead_days != null ? i.lead_days : DEFAULT_LEAD_DAYS))
    const cls = abc.get(i.product_id) ?? 'C'
    const z = Z[cls] ?? Z.C
    const safetyStock = z * sigmaDaily * Math.sqrt(leadDays)
    const reorderPoint = dailyDemand * leadDays + safetyStock
    const orderUpTo = dailyDemand * (leadDays + REVIEW_DAYS) + z * sigmaDaily * Math.sqrt(leadDays + REVIEW_DAYS)
    const onHand = i.qty_on_hand
    const suggestQty = onHand <= reorderPoint && dailyDemand > 0 ? Math.ceil(Math.max(0, orderUpTo - onHand)) : 0

    // Stockout days and lost sales over the last ~13 weeks.
    const out90 = s ? s.outDays.slice(-13).reduce((a, b) => a + b, 0) : 0
    const inStockDays = 91 - out90
    const sold90 = s ? s.qty.slice(-13).reduce((a, b) => a + b, 0) : 0
    const rateInStock = inStockDays > 0 ? sold90 / inStockDays : 0
    const lostSales90 = out90 * rateInStock * (s?.avgPrice ?? 0)

    const daysSinceSale = i.last_sale ? daysBetween(i.last_sale, raw.today) : null
    const daysOfCover = dailyDemand > 0 ? onHand / dailyDemand : null
    let status: StockStatus
    if (onHand > 0 && (daysSinceSale == null || daysSinceSale > 90)) status = 'dead'
    else if (dailyDemand <= 0) status = onHand > 0 ? 'overstock' : 'no_demand'
    else if (onHand <= reorderPoint) status = 'order_now'
    else if (onHand <= orderUpTo) status = 'order_soon'
    else if (daysOfCover != null && daysOfCover > 120 && i.stock_value > 2000) status = 'overstock'
    else status = 'ok'

    return {
      product_id: i.product_id, code: i.code, name: i.name, category: i.category, uom: i.base_uom, abc: abc.get(i.product_id) ?? null,
      onHand, investorQty: i.investor_qty, stockValue: i.stock_value,
      dailyDemand, leadDays, leadSource, safetyStock, reorderPoint, orderUpTo,
      suggestQty, suggestValue: suggestQty * i.unit_cost,
      daysOfCover, stockoutDays90: out90, lostSales90, lastSale: i.last_sale, daysSinceSale, status,
    }
  })
}

export function deadStock(rows: ReorderRow[]) {
  const buckets = [60, 90, 120, 180].map((d) => ({
    days: d,
    items: rows.filter((r) => r.onHand > 0 && (r.daysSinceSale == null || r.daysSinceSale > d)).length,
    value: rows.filter((r) => r.onHand > 0 && (r.daysSinceSale == null || r.daysSinceSale > d)).reduce((a, r) => a + Math.max(0, r.stockValue), 0),
  }))
  const list = rows.filter((r) => r.onHand > 0 && (r.daysSinceSale == null || r.daysSinceSale > 90))
    .sort((a, b) => b.stockValue - a.stockValue).slice(0, 40)
  return { buckets, list }
}

export function supplierPerformance(raw: RawInsights) {
  const by = new Map<string, { supplier: string; pos: number; leadSum: number; late: number; withExpected: number; total: number; setLead: number | null }>()
  for (const r of raw.leadTimes) {
    const x = by.get(r.supplier) ?? { supplier: r.supplier, pos: 0, leadSum: 0, late: 0, withExpected: 0, total: 0, setLead: r.supplier_lead_days ?? null }
    x.pos++; x.leadSum += r.lead_days; x.total += r.total
    if (r.late_days != null) { x.withExpected++; if (r.late_days > 0) x.late++ }
    by.set(r.supplier, x)
  }
  return [...by.values()].map((x) => ({
    supplier: x.supplier, pos: x.pos, avgLeadDays: x.leadSum / x.pos, total: x.total, setLeadDays: x.setLead,
    onTimePct: x.withExpected ? ((x.withExpected - x.late) / x.withExpected) * 100 : null,
  })).sort((a, b) => b.total - a.total)
}

export function shrinkage(raw: RawInsights) {
  const inv = new Map(raw.inventory.map((i) => [i.product_id, i.name]))
  const byMonth = new Map<string, { month: string; valueLost: number; losses: number; count: number; corrections: number }>()
  const byProduct = new Map<string, { name: string; qtyLost: number; valueLost: number; losses: number; count: number }>()
  for (const a of raw.adjustments) {
    const m = a.month.slice(0, 7)
    const x = byMonth.get(m) ?? { month: m, valueLost: 0, losses: 0, count: 0, corrections: 0 }
    x.valueLost += a.value_lost; x.losses += a.value_loss ?? 0; x.count += a.value_count ?? 0; x.corrections += a.value_fix ?? 0
    byMonth.set(m, x)
    const p = byProduct.get(a.product_id) ?? { name: inv.get(a.product_id) ?? '?', qtyLost: 0, valueLost: 0, losses: 0, count: 0 }
    p.qtyLost += a.qty_lost; p.valueLost += a.value_lost; p.losses += a.value_loss ?? 0; p.count += a.value_count ?? 0
    byProduct.set(a.product_id, p)
  }
  const months = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month))
  const sum = (f: (m: (typeof months)[number]) => number) => months.reduce((a, m) => a + f(m), 0)
  return {
    months,
    /** Damage, theft, expired. */
    totalLosses: sum((m) => m.losses),
    /** Stocktake count differences (real shrinkage or earlier recording errors). */
    totalCount: sum((m) => m.count),
    /** Data-entry corrections and "other" — usually not real losses. */
    totalCorrections: sum((m) => m.corrections),
    top: [...byProduct.values()].filter((p) => p.losses + p.count > 0).sort((a, b) => (b.losses + b.count) - (a.losses + a.count)).slice(0, 15),
  }
}
