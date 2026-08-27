import { getClient } from '../client'
import type { Tables, InsertTables, UpdateTables } from '@/types/database'

export type Supplier = Tables<'suppliers'>

// Fetch all suppliers
export async function getSuppliers(params?: {
  search?: string
  page?: number
  limit?: number
  includeInactive?: boolean
}) {
  const supabase = getClient()
  const { search, page = 1, limit = 50, includeInactive = false } = params || {}
  const offset = (page - 1) * limit

  let query = supabase
    .from('suppliers')
    .select('*', { count: 'exact' })
    .order('name')
    .range(offset, offset + limit - 1)

  if (!includeInactive) {
    query = query.eq('is_active', true)
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%,contact_person.ilike.%${search}%`)
  }

  const { data, error, count } = await query

  if (error) throw error

  return {
    data: data as Supplier[],
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  }
}

// Fetch single supplier by ID
export async function getSupplier(id: string) {
  const supabase = getClient()

  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as Supplier
}

// Create a new supplier
export async function createSupplier(supplier: InsertTables<'suppliers'>) {
  const supabase = getClient()

  const { data, error } = await supabase
    .from('suppliers')
    .insert(supplier)
    .select()
    .single()

  if (error) throw error
  return data as Supplier
}

// Update a supplier
export async function updateSupplier(id: string, updates: UpdateTables<'suppliers'>) {
  const supabase = getClient()

  const { data, error } = await supabase
    .from('suppliers')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Supplier
}

// Delete (soft) a supplier
export async function deleteSupplier(id: string) {
  const supabase = getClient()

  const { error } = await supabase
    .from('suppliers')
    .update({ is_active: false })
    .eq('id', id)

  if (error) throw error
}

// Generate next supplier code
export async function generateSupplierCode() {
  const supabase = getClient()

  const { data, error } = await supabase
    .from('suppliers')
    .select('code')
    .order('code', { ascending: false })
    .limit(1)

  if (error) throw error

  if (!data || data.length === 0) {
    return 'SUP-0001'
  }

  const lastCode = data[0].code
  const match = lastCode.match(/SUP-(\d+)/)
  if (match) {
    const nextNum = parseInt(match[1], 10) + 1
    return `SUP-${nextNum.toString().padStart(4, '0')}`
  }

  return 'SUP-0001'
}

// Get supplier purchase history
export async function getSupplierPurchaseHistory(supplierId: string, params?: {
  page?: number
  limit?: number
}) {
  const supabase = getClient()
  const { page = 1, limit = 20 } = params || {}
  const offset = (page - 1) * limit

  const { data, error, count } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      branch:branches(id, name, code)
    `, { count: 'exact' })
    .eq('supplier_id', supplierId)
    .eq('is_deleted', false)
    .order('po_date', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw error

  return {
    data,
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  }
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export interface SupplierStats {
  total_pos: number
  total_spend: number
  received_pos: number
  pending_pos: number         // draft | sent | confirmed | partially_received
  cancelled_pos: number
  last_order_date: string | null
  // monthly spend for the last 12 months
  monthly_spend: { month: string; amount: number }[]
}

export async function getSupplierStats(supplierId: string): Promise<SupplierStats> {
  const supabase = getClient()

  const { data: pos, error } = await supabase
    .from('purchase_orders')
    .select('id, po_date, status, total_amount')
    .eq('supplier_id', supplierId)
    .eq('is_deleted', false)
    .order('po_date', { ascending: false })

  if (error) throw error

  const rows = (pos as any[]) || []

  const total_pos = rows.length
  const total_spend = rows.reduce((s, r) => s + Number(r.total_amount || 0), 0)
  const received_pos = rows.filter(r => r.status === 'received').length
  const cancelled_pos = rows.filter(r => r.status === 'cancelled').length
  const pending_pos = rows.filter(r => !['received', 'cancelled'].includes(r.status)).length
  const last_order_date = rows.length > 0 ? rows[0].po_date : null

  // Build monthly spend buckets for last 12 months
  const monthlyMap = new Map<string, number>()
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthlyMap.set(key, 0)
  }
  for (const r of rows) {
    const key = r.po_date?.slice(0, 7) // "YYYY-MM"
    if (key && monthlyMap.has(key)) {
      monthlyMap.set(key, (monthlyMap.get(key) || 0) + Number(r.total_amount || 0))
    }
  }
  const monthly_spend = Array.from(monthlyMap.entries()).map(([month, amount]) => ({ month, amount }))

  return { total_pos, total_spend, received_pos, pending_pos, cancelled_pos, last_order_date, monthly_spend }
}

export interface SupplierTopProduct {
  product_id: string
  product_name: string
  product_code: string
  total_ordered: number
  total_spend: number
  po_count: number
  uom: string
}

export async function getSupplierTopProducts(supplierId: string): Promise<SupplierTopProduct[]> {
  const supabase = getClient()

  // Get all non-cancelled PO ids for this supplier
  const { data: pos, error: posErr } = await supabase
    .from('purchase_orders')
    .select('id')
    .eq('supplier_id', supplierId)
    .eq('is_deleted', false)
    .neq('status', 'cancelled')

  if (posErr) throw posErr
  const poIds = ((pos as any[]) || []).map((p: any) => p.id)
  if (poIds.length === 0) return []

  const { data: lines, error: linesErr } = await supabase
    .from('purchase_order_lines')
    .select(`
      po_id,
      product_id,
      quantity_ordered,
      unit_cost,
      uom_id,
      product:products(id, code, name),
      uom:units_of_measure(code, name)
    `)
    .in('po_id', poIds)

  if (linesErr) throw linesErr

  const productMap = new Map<string, SupplierTopProduct>()
  for (const line of (lines as any[]) || []) {
    const pid = line.product?.id || line.product_id
    if (!pid) continue
    if (!productMap.has(pid)) {
      productMap.set(pid, {
        product_id: pid,
        product_name: line.product?.name || 'Unknown',
        product_code: line.product?.code || '—',
        total_ordered: 0,
        total_spend: 0,
        po_count: 0,
        uom: line.uom?.code || line.uom?.name || 'pc',
      })
    }
    const entry = productMap.get(pid)!
    entry.total_ordered += Number(line.quantity_ordered || 0)
    entry.total_spend += Number(line.quantity_ordered || 0) * Number(line.unit_cost || 0)
    entry.po_count += 1
  }

  return Array.from(productMap.values()).sort((a, b) => b.total_spend - a.total_spend)
}

// ── Replenishment / stock-vs-supplier view ──────────────────────────────────
// Every product ever bought from this supplier, with current stock (one row
// per product+branch, no cross-branch summing) and a cross-supplier price
// comparison, so staff can see both "what's running low" and "are we even
// buying it from the cheapest source."

export interface SupplierProductInventoryRow {
  product_id: string
  product_code: string
  product_name: string
  uom: string
  branch_id: string
  branch_name: string
  quantity_on_hand: number
  last_movement_at: string | null
  has_inventory_record: boolean   // false = never actually received into this branch yet
  is_stale_zero: boolean          // qty === 0 && last_movement_at is 30+ days old
  last_purchased_at: string | null   // most recent po_date for this product from THIS supplier
  is_stale_supplier_purchase: boolean // qty === 0 && last_purchased_at is 3+ months old
  own_best_unit_cost: number | null
  cheapest_unit_cost: number | null
  cheapest_supplier_id: string | null
  cheapest_supplier_name: string | null
  is_cheapest_supplier: boolean
  price_diff: number | null       // own_best_unit_cost - cheapest_unit_cost, only when not cheapest
  supplier_count: number          // distinct suppliers with received-price history for this product
}

const STALE_ZERO_MS = 30 * 24 * 60 * 60 * 1000

export async function getSupplierProductInventory(supplierId: string): Promise<SupplierProductInventoryRow[]> {
  const supabase = getClient()

  // Step 1: this supplier's non-cancelled, non-deleted POs + their branch/date
  const { data: pos, error: posErr } = await supabase
    .from('purchase_orders')
    .select('id, branch_id, po_date')
    .eq('supplier_id', supplierId)
    .eq('is_deleted', false)
    .neq('status', 'cancelled')

  if (posErr) throw posErr
  const poRows = (pos as any[]) || []
  if (poRows.length === 0) return []

  const poIdToBranch = new Map<string, string>(poRows.map((p: any) => [p.id, p.branch_id]))
  const poIdToDate = new Map<string, string>(poRows.map((p: any) => [p.id, p.po_date]))
  const poIds = poRows.map((p: any) => p.id)

  // Step 2: every line ever ordered from this supplier — gives the full
  // (product, branch) pair set, including products from POs not yet
  // received (so they show up at qty 0, not marked stale).
  const { data: lines, error: linesErr } = await supabase
    .from('purchase_order_lines')
    .select(`
      po_id,
      product_id,
      product:products(id, code, name),
      uom:units_of_measure(code, name)
    `)
    .in('po_id', poIds)

  if (linesErr) throw linesErr

  const productMeta = new Map<string, { code: string; name: string; uom: string }>()
  const pairMap = new Map<string, { product_id: string; branch_id: string }>()
  const lastPurchaseMap = new Map<string, string>() // pairKey -> most recent po_date from this supplier

  for (const line of (lines as any[]) || []) {
    const pid = line.product?.id || line.product_id
    if (!pid) continue
    const branchId = poIdToBranch.get(line.po_id)
    if (!branchId) continue

    if (!productMeta.has(pid)) {
      productMeta.set(pid, {
        code: line.product?.code || '—',
        name: line.product?.name || 'Unknown',
        uom: line.uom?.code || line.uom?.name || 'pc',
      })
    }
    const pairKey = `${pid}|${branchId}`
    pairMap.set(pairKey, { product_id: pid, branch_id: branchId })

    const poDate = poIdToDate.get(line.po_id)
    if (poDate) {
      const existingDate = lastPurchaseMap.get(pairKey)
      if (!existingDate || poDate > existingDate) {
        lastPurchaseMap.set(pairKey, poDate)
      }
    }
  }

  const productIds = [...productMeta.keys()]
  if (productIds.length === 0) return []

  // Step 3: current inventory for this product set, batched (no N+1)
  const { data: inventory, error: invErr } = await supabase
    .from('branch_inventory')
    .select('product_id, branch_id, quantity_on_hand, last_movement_at, branch:branches(id, name)')
    .in('product_id', productIds)

  if (invErr) throw invErr

  const invMap = new Map<string, { quantity_on_hand: number; last_movement_at: string | null; branch_name: string }>()
  for (const inv of (inventory as any[]) || []) {
    const branch = Array.isArray(inv.branch) ? inv.branch[0] : inv.branch
    invMap.set(`${inv.product_id}|${inv.branch_id}`, {
      quantity_on_hand: Number(inv.quantity_on_hand || 0),
      last_movement_at: inv.last_movement_at,
      branch_name: branch?.name || '—',
    })
  }

  // Branch names for pairs with no inventory row yet (never received) — fall
  // back to a plain branches lookup for just the branch ids we need.
  const branchIds = [...new Set(poRows.map((p: any) => p.branch_id))]
  const { data: branches } = await supabase.from('branches').select('id, name').in('id', branchIds)
  const branchNameMap = new Map<string, string>(((branches as any[]) || []).map((b: any) => [b.id, b.name]))

  // Step 4: cross-supplier price history for the same product set — same
  // "best-ever cost per supplier, tie-broken by recency" logic already used
  // by getAutoReorderSuggestions in purchases.ts.
  const { data: priceLines, error: priceErr } = await supabase
    .from('purchase_order_lines')
    .select(`
      product_id,
      unit_cost,
      purchase_order:purchase_orders!purchase_order_lines_po_id_fkey(
        po_date, status, is_deleted,
        supplier:suppliers(id, name)
      )
    `)
    .in('product_id', productIds)

  if (priceErr) throw priceErr

  const validPriceLines = ((priceLines as any[]) || []).filter((line: any) =>
    !line.purchase_order?.is_deleted &&
    ['received', 'partially_received'].includes(line.purchase_order?.status)
  )

  const supplierMap: Record<string, Record<string, { best_unit_cost: number; last_po_date: string; supplier_name: string }>> = {}

  for (const line of validPriceLines) {
    const pid = line.product_id
    const po = line.purchase_order
    const supplierRaw = po?.supplier
    const supplier = Array.isArray(supplierRaw) ? supplierRaw[0] : supplierRaw
    if (!supplier || !pid) continue

    const sid = supplier.id
    const cost = Number(line.unit_cost)
    const date = po?.po_date ?? ''

    if (!supplierMap[pid]) supplierMap[pid] = {}

    const existing = supplierMap[pid][sid]
    if (!existing || cost < existing.best_unit_cost || (cost === existing.best_unit_cost && date > existing.last_po_date)) {
      supplierMap[pid][sid] = { best_unit_cost: cost, last_po_date: date, supplier_name: supplier.name }
    }
  }

  // Step 5: assemble rows
  const now = Date.now()
  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  const staleSupplierCutoff = threeMonthsAgo.toISOString().slice(0, 10) // po_date is a DATE column
  const rows: SupplierProductInventoryRow[] = []

  for (const { product_id, branch_id } of pairMap.values()) {
    const meta = productMeta.get(product_id)!
    const key = `${product_id}|${branch_id}`
    const inv = invMap.get(key)

    const quantity_on_hand = inv?.quantity_on_hand ?? 0
    const last_movement_at = inv?.last_movement_at ?? null
    const has_inventory_record = !!inv
    const is_stale_zero =
      quantity_on_hand === 0 &&
      last_movement_at !== null &&
      now - new Date(last_movement_at).getTime() >= STALE_ZERO_MS

    const last_purchased_at = lastPurchaseMap.get(key) ?? null
    const is_stale_supplier_purchase =
      quantity_on_hand === 0 &&
      last_purchased_at !== null &&
      last_purchased_at <= staleSupplierCutoff

    const priceOptions = supplierMap[product_id] ?? {}
    const priceEntries = Object.entries(priceOptions)
    const own = priceOptions[supplierId]
    const own_best_unit_cost = own?.best_unit_cost ?? null

    let cheapest_unit_cost: number | null = null
    let cheapest_supplier_id: string | null = null
    let cheapest_supplier_name: string | null = null
    for (const [sid, info] of priceEntries) {
      if (cheapest_unit_cost === null || info.best_unit_cost < cheapest_unit_cost) {
        cheapest_unit_cost = info.best_unit_cost
        cheapest_supplier_id = sid
        cheapest_supplier_name = info.supplier_name
      }
    }

    const is_cheapest_supplier = own_best_unit_cost !== null && own_best_unit_cost === cheapest_unit_cost
    const price_diff =
      own_best_unit_cost !== null && cheapest_unit_cost !== null && !is_cheapest_supplier
        ? own_best_unit_cost - cheapest_unit_cost
        : null

    rows.push({
      product_id,
      product_code: meta.code,
      product_name: meta.name,
      uom: meta.uom,
      branch_id,
      branch_name: inv?.branch_name || branchNameMap.get(branch_id) || '—',
      quantity_on_hand,
      last_movement_at,
      has_inventory_record,
      is_stale_zero,
      last_purchased_at,
      is_stale_supplier_purchase,
      own_best_unit_cost,
      cheapest_unit_cost,
      cheapest_supplier_id,
      cheapest_supplier_name,
      is_cheapest_supplier,
      price_diff,
      supplier_count: priceEntries.length,
    })
  }

  rows.sort((a, b) => {
    const aStale = a.is_stale_zero || a.is_stale_supplier_purchase
    const bStale = b.is_stale_zero || b.is_stale_supplier_purchase
    if (aStale !== bStale) return aStale ? 1 : -1
    if (a.quantity_on_hand !== b.quantity_on_hand) return a.quantity_on_hand - b.quantity_on_hand
    return a.product_name.localeCompare(b.product_name)
  })

  return rows
}

// Aggregated stats for all suppliers (for the list page columns)
export interface SupplierListStat {
  supplier_id: string
  total_pos: number
  total_spend: number
  last_order_date: string | null
}

export async function getAllSupplierStats(): Promise<Map<string, SupplierListStat>> {
  const supabase = getClient()

  const { data, error } = await supabase
    .from('purchase_orders')
    .select('supplier_id, total_amount, po_date, status')
    .eq('is_deleted', false)

  if (error) throw error

  const map = new Map<string, SupplierListStat>()
  for (const row of (data as any[]) || []) {
    const sid = row.supplier_id
    if (!map.has(sid)) {
      map.set(sid, { supplier_id: sid, total_pos: 0, total_spend: 0, last_order_date: null })
    }
    const e = map.get(sid)!
    e.total_pos += 1
    e.total_spend += Number(row.total_amount || 0)
    if (!e.last_order_date || row.po_date > e.last_order_date) {
      e.last_order_date = row.po_date
    }
  }

  return map
}
