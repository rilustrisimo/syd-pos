// Product signals for the Gemini planner: what's selling, trending, in season,
// overstocked, newly arrived, asked for online — and what was already
// featured (so a repeated product gets a new angle and style). Condensed into
// a short text section next to the insights digest, with product codes the
// planner hands back so saved ideas link to the product.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ProductSignal {
  product_id: string
  code: string
  name: string
  category_name: string
  created_at: string | null
  stock_on_hand: number
  reorder_point: number
  sold_30d: number
  sold_prior_30d: number
  sold_90d: number
  sold_next_30d_last_year: number
  online_requests_60d: number
  last_featured_at: string | null
  times_featured_90d: number
}

interface FeaturedIdea {
  source_product_id: string
  title: string
  angle: string | null
  creative_style: string | null
  format: string
  planned_for: string | null
  created_at: string
}

export interface ProductSignalsData {
  products: ProductSignal[]
  featured: FeaturedIdea[]
  specialRequests: { description: string; quantity: number }[]
}

const DAY = 86400000

export async function loadProductSignals(supabase: SupabaseClient): Promise<ProductSignalsData> {
  const db = supabase as any
  const since60 = new Date(Date.now() - 60 * DAY).toISOString()
  const since120 = new Date(Date.now() - 120 * DAY).toISOString()
  const [signals, featured, special] = await Promise.all([
    db.rpc('get_marketing_product_signals'),
    db.from('content_ideas')
      .select('source_product_id, title, angle, creative_style, format, planned_for, created_at')
      .not('source_product_id', 'is', null)
      .gte('created_at', since120)
      .order('created_at', { ascending: false })
      .limit(200),
    db.from('online_order_lines')
      .select('request_description, quantity, order:online_orders!inner(created_at, deleted_at)')
      .eq('is_special_request', true)
      .gte('order.created_at', since60)
      .is('order.deleted_at', null)
      .limit(50),
  ])
  if (signals.error) throw new Error(`Product signals: ${signals.error.message}`)
  if (featured.error) throw new Error(featured.error.message)
  // Special requests are a nice-to-have; don't fail the plan over them.
  if (special.error) console.error('[product-signals] special requests', special.error.message)

  const num = (v: unknown) => Number(v ?? 0) || 0
  return {
    products: (signals.data ?? []).map((r: any) => ({
      ...r,
      stock_on_hand: num(r.stock_on_hand),
      reorder_point: num(r.reorder_point),
      sold_30d: num(r.sold_30d),
      sold_prior_30d: num(r.sold_prior_30d),
      sold_90d: num(r.sold_90d),
      sold_next_30d_last_year: num(r.sold_next_30d_last_year),
      online_requests_60d: num(r.online_requests_60d),
      times_featured_90d: num(r.times_featured_90d),
    })),
    featured: featured.data ?? [],
    specialRequests: (special.data ?? [])
      .filter((r: any) => r.request_description?.trim())
      .map((r: any) => ({ description: r.request_description.trim(), quantity: num(r.quantity) })),
  }
}

const daysSince = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DAY) : null)
const clip = (s: string, n = 70) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

function featuredNote(p: ProductSignal): string {
  const d = daysSince(p.last_featured_at)
  return d == null ? 'never featured' : `featured ${d}d ago${p.times_featured_90d > 1 ? `, ${p.times_featured_90d}x in 90d` : ''}`
}

/** A product line for the prompt: code, name, category, and why it's listed. */
function line(p: ProductSignal, why: string): string {
  return `- [${p.code}] ${clip(p.name, 60)} (${p.category_name}) — ${why}; ${featuredNote(p)}`
}

/** Pick up to `n` products, skipping ones already listed in another group. */
function take(list: ProductSignal[], n: number, used: Set<string>): ProductSignal[] {
  const out: ProductSignal[] = []
  for (const p of list) {
    if (out.length >= n) break
    if (used.has(p.product_id)) continue
    used.add(p.product_id)
    out.push(p)
  }
  return out
}

// Recently featured products sink in every list, so fresh products surface
// first, but a strong signal can still bring one back (with a new angle).
const freshness = (p: ProductSignal) => {
  const d = daysSince(p.last_featured_at)
  return d == null ? 1 : d < 14 ? 0.35 : d < 30 ? 0.7 : 1
}

export function buildProductDigest(data: ProductSignalsData): string {
  const inStock = data.products.filter((p) => p.stock_on_hand > 0)
  if (!data.products.length) return ''
  const used = new Set<string>()
  const lines: string[] = [
    '\nPRODUCT SIGNALS (from the store database). Use these to choose WHAT each post is about. The numbers are for choosing only: never state stock levels, quantities sold, or prices in a post. Only feature in-stock products listed here; put the product code in product_code.',
  ]

  const trending = take(
    inStock
      .filter((p) => p.sold_30d >= 3 && p.sold_30d > p.sold_prior_30d * 1.3)
      .sort((a, b) => (b.sold_30d / Math.max(b.sold_prior_30d, 1)) * freshness(b) - (a.sold_30d / Math.max(a.sold_prior_30d, 1)) * freshness(a)),
    5, used,
  )
  if (trending.length) {
    lines.push('Trending now (sales up vs the month before):')
    for (const p of trending) lines.push(line(p, `sales up ${p.sold_prior_30d ? `${Math.round((p.sold_30d / p.sold_prior_30d - 1) * 100)}%` : 'from zero'}`))
  }

  const seasonal = take(
    inStock
      .filter((p) => p.sold_next_30d_last_year >= 3 && p.sold_next_30d_last_year > p.sold_30d * 1.2)
      .sort((a, b) => b.sold_next_30d_last_year * freshness(b) - a.sold_next_30d_last_year * freshness(a)),
    5, used,
  )
  if (seasonal.length) {
    lines.push('In season soon (sold more in the coming 30 days last year than this month — post before the demand):')
    for (const p of seasonal) lines.push(line(p, 'demand rose this time last year'))
  }

  const best = take(
    [...inStock].filter((p) => p.sold_90d > 0).sort((a, b) => b.sold_90d * freshness(b) - a.sold_90d * freshness(a)),
    6, used,
  )
  if (best.length) {
    lines.push('Best sellers (last 90 days) — proven demand, good for ads and reminders:')
    for (const p of best) lines.push(line(p, 'top seller'))
  }

  const online = take(
    inStock.filter((p) => p.online_requests_60d > 0).sort((a, b) => b.online_requests_60d - a.online_requests_60d),
    4, used,
  )
  if (online.length) {
    lines.push('Asked for on the website (quote requests, last 60 days):')
    for (const p of online) lines.push(line(p, `${p.online_requests_60d} online request${p.online_requests_60d === 1 ? '' : 's'}`))
  }

  const fresh = take(
    inStock
      .filter((p) => (daysSince(p.created_at) ?? 999) <= 45)
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')),
    5, used,
  )
  if (fresh.length) {
    lines.push('New arrivals (added in the last 45 days):')
    for (const p of fresh) lines.push(line(p, `new, added ${daysSince(p.created_at)}d ago`))
  }

  // Plenty on the shelf but slow: worth a push (spotlight, bundle idea, use case).
  const overstock = take(
    inStock
      .filter((p) => p.stock_on_hand > Math.max(p.reorder_point * 3, 10) && p.sold_90d * 2 < p.stock_on_hand && p.sold_90d > 0)
      .sort((a, b) => (b.stock_on_hand / Math.max(b.sold_90d, 1)) * freshness(b) - (a.stock_on_hand / Math.max(a.sold_90d, 1)) * freshness(a)),
    4, used,
  )
  if (overstock.length) {
    lines.push('Plenty in stock but moving slowly — good to push with a use-case or "did you know" post:')
    for (const p of overstock) lines.push(line(p, 'well stocked, slow mover'))
  }

  if (data.specialRequests.length) {
    lines.push('Customers asked for these (special requests, not in the catalog) — a post can say "Can\'t find it? Request it on sydconstruct.com and we\'ll source and quote it":')
    for (const r of data.specialRequests.slice(0, 6)) lines.push(`- "${clip(r.description, 70)}"`)
  }

  // Previous angles per product, so a repeat must be a different concept.
  const byProduct = new Map<string, FeaturedIdea[]>()
  for (const f of data.featured) byProduct.set(f.source_product_id, [...(byProduct.get(f.source_product_id) ?? []), f])
  const listedFeatured = [...used].filter((id) => byProduct.has(id))
  if (listedFeatured.length) {
    const nameById = new Map(data.products.map((p) => [p.product_id, p]))
    lines.push('ALREADY FEATURED — if you pick one of these products again, use a DIFFERENT angle, creative style and audience than before:')
    for (const id of listedFeatured.slice(0, 8)) {
      const p = nameById.get(id)
      const past = byProduct.get(id)!.slice(0, 3)
        .map((f) => `${f.planned_for ?? f.created_at.slice(0, 10)} ${f.format}${f.creative_style ? `/${f.creative_style}` : ''}: "${clip(f.angle || f.title, 50)}"`)
      lines.push(`- [${p?.code}] ${clip(p?.name ?? '', 40)}: ${past.join('; ')}`)
    }
  }

  if (lines.length === 1) return ''
  lines.push('Mix it up: not every post needs a product (tips, store/delivery, community posts are fine), but product posts should come from these lists, spread across different categories.')
  return lines.join('\n')
}

/** Resolve planner product codes to product ids (unknown codes → null). */
export async function productIdsByCode(supabase: SupabaseClient, codes: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(codes.map((c) => c.trim()).filter(Boolean))]
  if (!unique.length) return new Map()
  const { data, error } = await (supabase as any).from('products').select('id, code').in('code', unique)
  if (error) throw new Error(error.message)
  return new Map((data ?? []).map((p: { id: string; code: string }) => [p.code, p.id]))
}

/**
 * The product section for a planner prompt, or '' if it can't be loaded
 * (e.g. migration 00102 not run yet) — planning still works without it.
 */
export async function loadProductDigest(supabase: SupabaseClient): Promise<string> {
  try {
    return buildProductDigest(await loadProductSignals(supabase))
  } catch (err) {
    console.error('[product-signals]', err)
    return ''
  }
}
