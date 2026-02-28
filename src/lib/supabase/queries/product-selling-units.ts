/**
 * Product Selling Units Queries
 * Manages multiple selling units per product with different pricing
 */

import { createClient } from '@/lib/supabase/client'
import type { ProductSellingUnitRow } from '@/types/database'

export interface ProductSellingUnit extends ProductSellingUnitRow {
  uom?: {
    id: string
    code: string
    name: string
  }
}

/**
 * Get all selling units for a product
 */
export async function getProductSellingUnits(productId: string): Promise<ProductSellingUnit[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('product_selling_units')
    .select(`
      *,
      uom:units_of_measure!uom_id(id, code, name)
    `)
    .eq('product_id', productId)
    .eq('is_active', true)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data as any[]) || []
}

/**
 * Get primary selling unit for a product
 */
export async function getPrimarySellingUnit(productId: string): Promise<ProductSellingUnit | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('product_selling_units')
    .select(`
      *,
      uom:units_of_measure!uom_id(id, code, name)
    `)
    .eq('product_id', productId)
    .eq('is_primary', true)
    .eq('is_active', true)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // No rows found
    throw error
  }
  return data as any
}

/**
 * Create a new selling unit for a product
 */
export interface CreateSellingUnitInput {
  product_id: string
  uom_id: string
  conversion_factor: number
  markup_percentage: number
  selling_price: number
  is_primary?: boolean
}

export async function createSellingUnit(input: CreateSellingUnitInput): Promise<ProductSellingUnit> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('product_selling_units')
    .insert({
      product_id: input.product_id,
      uom_id: input.uom_id,
      conversion_factor: input.conversion_factor,
      markup_percentage: input.markup_percentage,
      selling_price: input.selling_price,
      is_primary: input.is_primary || false,
      is_active: true,
    })
    .select(`
      *,
      uom:units_of_measure!uom_id(id, code, name)
    `)
    .single()

  if (error) throw error
  return data as any
}

/**
 * Update a selling unit
 */
export interface UpdateSellingUnitInput {
  id: string
  conversion_factor?: number
  markup_percentage?: number
  selling_price?: number
  is_primary?: boolean
  is_active?: boolean
}

export async function updateSellingUnit(input: UpdateSellingUnitInput): Promise<ProductSellingUnit> {
  const supabase = createClient()

  const { id, ...updates } = input

  const { data, error } = await supabase
    .from('product_selling_units')
    .update(updates)
    .eq('id', id)
    .select(`
      *,
      uom:units_of_measure!uom_id(id, code, name)
    `)
    .single()

  if (error) throw error
  return data as any
}

/**
 * Delete a selling unit (soft delete by setting is_active = false)
 */
export async function deleteSellingUnit(id: string): Promise<void> {
  const supabase = createClient()

  const { error } = await supabase
    .from('product_selling_units')
    .update({ is_active: false })
    .eq('id', id)

  if (error) throw error
}

/**
 * Set a selling unit as primary (unsets all others for the product)
 */
export async function setPrimarySellingUnit(id: string): Promise<void> {
  const supabase = createClient()

  const { error } = await supabase
    .from('product_selling_units')
    .update({ is_primary: true })
    .eq('id', id)

  if (error) throw error
}

/**
 * Calculate selling price for a unit based on product COGS
 */
export function calculateSellingPrice(
  productCOGS: number,
  conversionFactor: number,
  markupPercentage: number
): number {
  // COGS is per selling unit (from products.latest_cogs)
  // Convert to this unit's cost, then apply markup
  const unitCost = productCOGS * conversionFactor
  return unitCost * (1 + markupPercentage / 100)
}
