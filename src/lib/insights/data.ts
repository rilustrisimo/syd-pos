// Loads everything the Insights engine needs. The database keeps pre-summed
// rollups (migration 00114); each load first tops them up incrementally
// (insights_refresh: skipped if done in the last 10 minutes, otherwise only
// the last ~week + edited days) and then reads them in ONE call
// (insights_data), so the cost stays flat as years of data accumulate.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { RawInsights, SeriesRow } from './types'
import { loadWeather } from './weather'
import { ALL_HISTORY } from './dates'

const NUMERIC_TEXT = /^-?\d+(\.\d+)?(e-?\d+)?$/i
const TEXT_KEYS = new Set(['code', 'po_number', 'name', 'phone', 'place', 'supplier', 'customer', 'category', 'category_name', 'base_uom', 'method', 'customer_type'])

/** Numbers can arrive as strings; turn those into numbers (arrays inside are already numbers). */
function normalise<T>(rows: unknown): T[] {
  const list = (rows as any[]) ?? []
  for (const r of list) {
    for (const k in r) {
      const v = r[k]
      if (typeof v === 'string' && NUMERIC_TEXT.test(v) && !k.endsWith('_id') && !TEXT_KEYS.has(k)) r[k] = Number(v)
    }
  }
  return list as T[]
}

/**
 * The database sends weekly series sparsely (only weeks with sales or
 * stock-outs, numbered from 1). Expand to dense arrays aligned to `weeks`;
 * rev/cogs cover the last 16 weeks.
 */
function expandSeries(rows: any[], n: number): SeriesRow[] {
  const tail = Math.min(16, n)
  return rows.map((r) => {
    const qty = new Array(n).fill(0), out = new Array(n).fill(0)
    const rev = new Array(tail).fill(0), cogs = new Array(tail).fill(0)
    ;(r.wi as number[]).forEach((i, k) => { qty[i - 1] = Number(r.q[k]) })
    ;(r.oi as number[]).forEach((i, k) => { out[i - 1] = Number(r.o[k]) })
    ;(r.ri as number[]).forEach((i, k) => { const j = i - 1 - (n - tail); if (j >= 0) { rev[j] = Number(r.rv[k]); cogs[j] = Number(r.cg[k]) } })
    return { product_id: r.product_id, qty, out, rev, cogs }
  })
}

async function rpc<T>(db: SupabaseClient, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await (db as any).rpc(fn, args)
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data as T
}

export async function loadRawInsights(
  db: SupabaseClient,
  opts: { from: string; to: string; today: string; branchId?: string | null }
): Promise<RawInsights> {
  const { from, to, today } = opts
  const branch = opts.branchId || null

  // Top up the rollups first (cheap; a no-op when fresh or when another refresh is running).
  await rpc(db, 'insights_refresh', { p_force: false })

  const [branchesRes, bulk, weather] = await Promise.all([
    (db as any).from('branches').select('id, name').eq('is_active', true).order('name'),
    rpc<any>(db, 'insights_data', { p_hist_from: ALL_HISTORY, p_to: today, p_range_from: from, p_range_to: to, p_branch: branch }),
    loadWeather(db, today).catch((e) => { console.warn('[insights] weather unavailable:', e?.message); return [] }),
  ])
  if (branchesRes.error) throw new Error(`branches: ${branchesRes.error.message}`)

  return {
    from, to, today, branchId: branch,
    branches: branchesRes.data ?? [],
    dailyAll: normalise(bulk.daily),
    hourly: normalise(bulk.hourly),
    paymentMix: normalise(bulk.payment_mix),
    productRange: normalise(bulk.product_range),
    weeks: (bulk.weeks ?? []) as string[],
    series: expandSeries(bulk.series ?? [], (bulk.weeks ?? []).length),
    categoryMonths: normalise(bulk.category_months),
    customers: normalise(bulk.customers),
    customerMonths: (bulk.customer_months ?? []).flatMap((c: { customer_id: string; months: string[] }) =>
      c.months.map((m) => ({ customer_id: c.customer_id, month: `${m}-01`, revenue: 0, orders: 1 }))),
    inventory: normalise(bulk.inventory),
    leadTimes: normalise(bulk.lead_times),
    basketPairs: normalise(bulk.pairs),
    adjustments: normalise(bulk.adjustments),
    quotations: normalise(bulk.quotations),
    deliveries: normalise(bulk.deliveries),
    expensesAll: normalise(bulk.expenses),
    purchasesAll: normalise(bulk.purchases),
    apOpen: { open_ap: Number(bulk.ap_open?.open_ap ?? 0), due_30: Number(bulk.ap_open?.due_30 ?? 0) },
    weather,
    refreshedAt: bulk.refreshed_at ?? null,
  }
}
