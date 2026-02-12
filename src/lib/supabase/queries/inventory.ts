import { getClient } from '../client'
import type { Tables, InsertTables } from '@/types/database'

export type BranchInventory = Tables<'branch_inventory'> & {
  product: Tables<'products'> & {
    category?: Tables<'product_categories'>
    base_uom?: Tables<'units_of_measure'>
  }
  branch: Tables<'branches'>
}

export type InventoryMovement = Tables<'inventory_movements'> & {
  product: Tables<'products'>
  branch: Tables<'branches'>
  created_by_user: Tables<'users'>
}

export type Branch = Tables<'branches'>

// Fetch all branches
export async function getBranches() {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .eq('is_active', true)
    .order('name')

  if (error) throw error
  return data
}

// Fetch branch inventory with product details
export async function getBranchInventory(params?: {
  branchId?: string
  search?: string
  lowStockOnly?: boolean
  page?: number
  limit?: number
}) {
  const supabase = getClient()
  const { branchId, search, lowStockOnly, page = 1, limit = 50 } = params || {}
  const offset = (page - 1) * limit

  let query = supabase
    .from('branch_inventory')
    .select(`
      *,
      product:products(
        *,
        category:product_categories(*),
        base_uom:units_of_measure!products_base_uom_id_fkey(*)
      ),
      branch:branches(*)
    `, { count: 'exact' })
    .order('quantity_on_hand', { ascending: true })
    .range(offset, offset + limit - 1)

  if (branchId) {
    query = query.eq('branch_id', branchId)
  }

  if (search) {
    // This is a workaround - ideally we'd filter on the joined table
    // but for now we'll filter client-side after fetching
  }

  if (lowStockOnly) {
    // Will filter client-side based on product.reorder_point
  }

  const { data, error, count } = await query

  if (error) throw error

  let filteredData = data || []

  // Client-side filtering for search
  if (search && filteredData.length > 0) {
    const searchLower = search.toLowerCase()
    filteredData = filteredData.filter((item: any) => 
      item.product?.name?.toLowerCase().includes(searchLower) ||
      item.product?.code?.toLowerCase().includes(searchLower)
    )
  }

  // Client-side filtering for low stock
  if (lowStockOnly && filteredData.length > 0) {
    filteredData = filteredData.filter((item: any) => 
      Number(item.quantity_on_hand) <= Number(item.product?.reorder_point || 0)
    )
  }

  return {
    data: filteredData,
    count: filteredData.length,
    totalPages: Math.ceil((count || 0) / limit),
  }
}

// Get inventory for a specific product across all branches
export async function getProductInventory(productId: string) {
  const supabase = getClient()

  const { data, error } = await supabase
    .from('branch_inventory')
    .select(`
      *,
      branch:branches(*)
    `)
    .eq('product_id', productId)
    .order('quantity_on_hand', { ascending: false })

  if (error) throw error
  return data
}

// Get inventory movements/history
export async function getInventoryMovements(params?: {
  branchId?: string
  productId?: string
  movementType?: string
  page?: number
  limit?: number
}) {
  const supabase = getClient()
  const { branchId, productId, movementType, page = 1, limit = 50 } = params || {}
  const offset = (page - 1) * limit

  let query = supabase
    .from('inventory_movements')
    .select(`
      *,
      product:products(id, code, name),
      branch:branches(id, code, name),
      created_by_user:users(id, name, email)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (branchId) {
    query = query.eq('branch_id', branchId)
  }

  if (productId) {
    query = query.eq('product_id', productId)
  }

  if (movementType) {
    query = query.eq('movement_type', movementType)
  }

  const { data, error, count } = await query

  if (error) throw error

  return {
    data,
    count,
    totalPages: Math.ceil((count || 0) / limit),
  }
}

// Get low stock alerts (products below reorder point)
export async function getLowStockAlerts(branchId?: string) {
  const supabase = getClient()

  let query = supabase
    .from('branch_inventory')
    .select(`
      *,
      product:products(
        *,
        category:product_categories(*),
        base_uom:units_of_measure!products_base_uom_id_fkey(*)
      ),
      branch:branches(*)
    `)

  if (branchId) {
    query = query.eq('branch_id', branchId)
  }

  const { data, error } = await query

  if (error) throw error

  // Filter for items where quantity_on_hand <= reorder_point
  const lowStockItems = (data || []).filter((item: any) => 
    Number(item.quantity_on_hand) <= Number(item.product?.reorder_point || 0)
  )

  return lowStockItems
}

// Adjust inventory (manual adjustment)
export async function adjustInventory(params: {
  branchId: string
  productId: string
  quantityChange: number
  notes: string
  userId: string
}) {
  const supabase = getClient()
  const { branchId, productId, quantityChange, notes, userId } = params

  // Get current inventory
  const { data: currentInventory, error: fetchError } = await supabase
    .from('branch_inventory')
    .select('*')
    .eq('branch_id', branchId)
    .eq('product_id', productId)
    .maybeSingle() as { data: any; error: any }

  if (fetchError) throw fetchError

  const currentQuantity = Number(currentInventory?.quantity_on_hand || 0)
  const newQuantity = currentQuantity + quantityChange

  if (newQuantity < 0) {
    throw new Error('Adjustment would result in negative inventory')
  }

  // Update or insert inventory record
  if (currentInventory) {
    const updateData = {
      quantity_on_hand: newQuantity,
      last_movement_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const { error: updateError } = await supabase
      .from('branch_inventory')
      // @ts-ignore - Supabase type inference issue
      .update(updateData)
      .eq('id', currentInventory.id)

    if (updateError) throw updateError
  } else {
    const insertData = {
      branch_id: branchId,
      product_id: productId,
      quantity_on_hand: newQuantity,
      quantity_reserved: 0,
      last_movement_at: new Date().toISOString(),
    }
    const { error: insertError } = await supabase
      .from('branch_inventory')
      // @ts-ignore - Supabase type inference issue
      .insert(insertData)

    if (insertError) throw insertError
  }

  // Record movement
  const movementData = {
    branch_id: branchId,
    product_id: productId,
    movement_type: 'adjustment' as const,
    quantity_change: quantityChange,
    quantity_before: currentQuantity,
    quantity_after: newQuantity,
    reference_type: 'manual_adjustment',
    notes,
    created_by: userId,
  }
  const { error: movementError } = await supabase
    .from('inventory_movements')
    // @ts-ignore - Supabase type inference issue
    .insert(movementData)

  if (movementError) throw movementError

  return { success: true }
}

// Get inventory summary (total value, items count, etc.)
export async function getInventorySummary(branchId?: string) {
  const supabase = getClient()

  let query = supabase
    .from('branch_inventory')
    .select(`
      *,
      product:products(
        latest_cogs,
        current_selling_price,
        reorder_point
      )
    `)

  if (branchId) {
    query = query.eq('branch_id', branchId)
  }

  const { data, error } = await query

  if (error) throw error

  const summary = {
    totalItems: data?.length || 0,
    totalQuantity: data?.reduce((sum: number, item: any) => sum + Number(item.quantity_on_hand), 0) || 0,
    totalValue: data?.reduce((sum: number, item: any) => 
      sum + (Number(item.quantity_on_hand) * Number(item.product?.latest_cogs || 0)), 0
    ) || 0,
    lowStockItems: data?.filter((item: any) => 
      Number(item.quantity_on_hand) <= Number(item.product?.reorder_point || 0)
    ).length || 0,
    outOfStockItems: data?.filter((item: any) => Number(item.quantity_on_hand) === 0).length || 0,
  }

  return summary
}
