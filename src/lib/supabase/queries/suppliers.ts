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
