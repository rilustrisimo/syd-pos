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
      quantity_ordered,
      unit_cost,
      total_amount,
      product:products!product_id(id, code, name),
      uom:units_of_measure!uom_id(code, name)
    `)
    .in('po_id', poIds)

  if (linesErr) throw linesErr

  const productMap = new Map<string, SupplierTopProduct>()
  for (const line of (lines as any[]) || []) {
    const pid = line.product?.id
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
    entry.total_spend += Number(line.total_amount || line.quantity_ordered * line.unit_cost || 0)
    entry.po_count += 1
  }

  return Array.from(productMap.values()).sort((a, b) => b.total_spend - a.total_spend)
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
