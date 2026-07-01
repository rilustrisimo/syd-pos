import { getClient, createClient } from '../client'
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

  // Start from products table to show ALL products, not just those with inventory
  let query = supabase
    .from('products')
    .select(`
      id,
      code,
      name,
      latest_cogs,
      current_selling_price,
      reorder_point,
      is_active,
      category:product_categories(*),
      base_uom:units_of_measure!products_base_uom_id_fkey(*)
    `, { count: 'exact' })
    .eq('is_active', true)
    .order('name')
    .range(offset, offset + limit - 1)

  if (search) {
    const searchLower = search.toLowerCase()
    query = query.or(`name.ilike.%${searchLower}%,code.ilike.%${searchLower}%`)
  }

  const { data: products, error: productsError, count } = await query

  if (productsError) throw productsError

  if (!products || products.length === 0) {
    return {
      data: [],
      count: 0,
      totalPages: 0,
    }
  }

  // Get inventory data for these products
  const productIds = products.map(p => p.id)
  let inventoryQuery = supabase
    .from('branch_inventory')
    .select(`
      product_id,
      branch_id,
      quantity_on_hand,
      quantity_reserved,
      last_movement_at,
      branch:branches(*)
    `)
    .in('product_id', productIds)

  if (branchId) {
    inventoryQuery = inventoryQuery.eq('branch_id', branchId)
  }

  const { data: inventoryData, error: inventoryError } = await inventoryQuery

  if (inventoryError) throw inventoryError

  // Create a map of product_id -> inventory data
  const inventoryMap = new Map(
    (inventoryData || []).map((inv: any) => [
      `${inv.product_id}-${inv.branch_id}`,
      inv
    ])
  )

  // Get branches if no specific branch is selected
  let branches: any[] = []
  if (!branchId) {
    const { data: branchesData } = await supabase
      .from('branches')
      .select('*')
      .eq('is_active', true)
    branches = branchesData || []
  } else {
    const { data: branchData } = await supabase
      .from('branches')
      .select('*')
      .eq('id', branchId)
      .single()
    branches = branchData ? [branchData] : []
  }

  // Combine products with inventory data
  let combinedData: any[] = []
  
  if (branchId) {
    // Single branch: create one record per product
    combinedData = products.map((product: any) => {
      const invKey = `${product.id}-${branchId}`
      const inventory = inventoryMap.get(invKey)
      
      return {
        id: inventory?.id || `temp-${product.id}-${branchId}`,
        product_id: product.id,
        branch_id: branchId,
        quantity_on_hand: inventory?.quantity_on_hand || 0,
        quantity_reserved: inventory?.quantity_reserved || 0,
        last_movement_at: inventory?.last_movement_at || null,
        product: product,
        branch: branches[0] || null,
      }
    })
  } else {
    // Multiple branches: create one record per product per branch
    products.forEach((product: any) => {
      branches.forEach((branch: any) => {
        const invKey = `${product.id}-${branch.id}`
        const inventory = inventoryMap.get(invKey)
        
        combinedData.push({
          id: inventory?.id || `temp-${product.id}-${branch.id}`,
          product_id: product.id,
          branch_id: branch.id,
          quantity_on_hand: inventory?.quantity_on_hand || 0,
          quantity_reserved: inventory?.quantity_reserved || 0,
          last_movement_at: inventory?.last_movement_at || null,
          product: product,
          branch: branch,
        })
      })
    })
  }

  // Filter for low stock if requested
  if (lowStockOnly) {
    combinedData = combinedData.filter((item: any) => 
      Number(item.quantity_on_hand) <= Number(item.product?.reorder_point || 0)
    )
  }

  // Sort by quantity (lowest first)
  combinedData.sort((a, b) => a.quantity_on_hand - b.quantity_on_hand)

  return {
    data: combinedData,
    count: combinedData.length,
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

// Get total quantity_change per branch for a product (no limit — used for audit accuracy)
export async function getMovementTotals(productId: string): Promise<Map<string, number>> {
  const supabase = getClient()

  const { data, error } = await supabase
    .from('inventory_movements')
    .select('branch_id, quantity_change')
    .eq('product_id', productId)

  if (error) throw error

  const totals = new Map<string, number>()
  for (const row of data ?? []) {
    totals.set(row.branch_id, (totals.get(row.branch_id) ?? 0) + Number(row.quantity_change))
  }
  return totals
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
      created_by_user:users(id, full_name, email)
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

  // Filter: qty <= reorder_point (includes out-of-stock — they need restocking too)
  const lowStockItems = (data || []).filter((item: any) =>
    Number(item.quantity_on_hand) <= Number(item.product?.reorder_point || 0)
  )

  return lowStockItems
}

/**
 * Adjust inventory using atomic RPC with unit conversion, validation, and locking
 * This prevents race conditions and negative inventory (unless explicitly allowed)
 */
export async function adjustInventory(params: {
  branchId: string
  productId: string
  variantId?: string | null
  quantityChange: number
  uomId: string
  reason: string
  notes: string
  userId: string
}) {
  const supabase = createClient()
  const { branchId, productId, variantId, quantityChange, uomId, reason, notes, userId } = params

  // Call atomic RPC function
  // This handles: conversion to base units, locking, validation, update, and movement recording
  // All in a single database transaction
  const { data, error } = await supabase.rpc('adjust_inventory_atomic', {
    p_branch_id: branchId,
    p_product_id: productId,
    p_variant_id: variantId || null,
    p_quantity_change: quantityChange,
    p_uom_id: uomId,
    p_reason: reason,
    p_notes: notes,
    p_user_id: userId
  })

  if (error) {
    // Check if it's a validation error
    if (error.code === 'P0001' && error.message.includes('negative inventory')) {
      throw new Error(error.message)
    }
    if (error.code === 'P0001' && error.message.includes('Invalid UOM')) {
      throw new Error(error.message)
    }
    throw error
  }

  return data
}

// Fetch products by SKU codes with their current inventory for a branch (used by stocktake)
export async function getProductsByCodesWithInventory(
  branchId: string,
  codes: string[]
): Promise<Array<{
  product_id: string
  product_code: string
  product_name: string
  base_uom_id: string
  base_uom_code: string
  quantity_on_hand: number
  allow_negative_inventory: boolean
}>> {
  const supabase = getClient()

  const { data: products, error: productsError } = await supabase
    .from('products')
    .select(`
      id,
      code,
      name,
      base_uom_id,
      allow_negative_inventory,
      base_uom:units_of_measure!products_base_uom_id_fkey(code, name)
    `)
    .in('code', codes)
    .eq('is_active', true)

  if (productsError) throw productsError
  if (!products || products.length === 0) return []

  const productIds = products.map((p: any) => p.id)

  const { data: inventory, error: inventoryError } = await supabase
    .from('branch_inventory')
    .select('product_id, quantity_on_hand')
    .eq('branch_id', branchId)
    .in('product_id', productIds)

  if (inventoryError) throw inventoryError

  const inventoryMap = new Map(
    (inventory || []).map((inv: any) => [inv.product_id, inv.quantity_on_hand])
  )

  return products.map((product: any) => ({
    product_id: product.id,
    product_code: product.code,
    product_name: product.name,
    base_uom_id: product.base_uom_id,
    base_uom_code: (product.base_uom as any)?.code || (product.base_uom as any)?.name || 'unit',
    quantity_on_hand: Number(inventoryMap.get(product.id) ?? 0),
    allow_negative_inventory: product.allow_negative_inventory ?? false,
  }))
}

// Bulk inventory adjustment — wraps the bulk_adjust_inventory RPC (used by stocktake)
export async function bulkAdjustInventory(params: {
  adjustments: Array<{
    product_id: string
    variant_id: string | null
    branch_id: string
    quantity_change: number
    uom_id: string
    notes: string
  }>
  reason: string
  userId: string
}): Promise<{
  success: boolean
  success_count: number
  error_count: number
  errors: any[]
}> {
  const supabase = createClient()
  const { adjustments, reason, userId } = params

  const { data, error } = await supabase.rpc('bulk_adjust_inventory', {
    p_adjustments: adjustments,
    p_reason: reason,
    p_user_id: userId,
  })

  if (error) throw error
  return data
}

// Get inventory summary — uses server-side RPC to avoid PostgREST's 1,000-row default cap
export async function getInventorySummary(branchId?: string) {
  const supabase = getClient()

  const { data, error } = await supabase
    .rpc('get_inventory_summary', { p_branch_id: branchId ?? null })
    .single()

  if (error) throw error

  return {
    totalItems:      Number((data as any).total_items),
    totalQuantity:   Number((data as any).total_quantity),
    totalValue:      Number((data as any).total_value),
    potentialProfit: Number((data as any).potential_profit),
    lowStockItems:   Number((data as any).low_stock_count),
    outOfStockItems: Number((data as any).out_of_stock_count),
  }
}
