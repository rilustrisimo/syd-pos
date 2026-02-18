import { getClient } from '../client'
import type { Tables, InsertTables, UpdateTables } from '@/types/database'

export type Product = Tables<'products'> & {
  category?: Tables<'product_categories'>
  subcategory?: Tables<'product_subcategories'> | null
  base_uom?: Tables<'units_of_measure'>
  selling_uom?: Tables<'units_of_measure'>
}

export type ProductCategory = Tables<'product_categories'>
export type UnitOfMeasure = Tables<'units_of_measure'>

// Fetch all products with related data
export async function getProducts(params?: {
  search?: string
  categoryId?: string
  page?: number
  limit?: number
}) {
  const supabase = getClient()
  const { search, categoryId, page = 1, limit = 50 } = params || {}
  const offset = (page - 1) * limit

  let query = supabase
    .from('products')
    .select(`
      *,
      category:product_categories(*),
      subcategory:product_subcategories(*),
      base_uom:units_of_measure!products_base_uom_id_fkey(*),
      selling_uom:units_of_measure!products_selling_uom_id_fkey(*)
    `, { count: 'exact' })
    .eq('is_active', true)
    .order('name')
    .range(offset, offset + limit - 1)

  if (search) {
    query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`)
  }

  if (categoryId) {
    query = query.eq('category_id', categoryId)
  }

  const { data, error, count } = await query

  if (error) throw error

  return {
    data: data as Product[],
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  }
}

// Fetch all products for export (no pagination)
export async function getAllProductsForExport(params?: {
  search?: string
  categoryId?: string
}) {
  const supabase = getClient()
  const { search, categoryId } = params || {}

  let query = supabase
    .from('products')
    .select(`
      *,
      category:product_categories(*),
      subcategory:product_subcategories(*),
      base_uom:units_of_measure!products_base_uom_id_fkey(*),
      selling_uom:units_of_measure!products_selling_uom_id_fkey(*)
    `)
    .eq('is_active', true)
    .order('category_id')
    .order('name')

  if (search) {
    query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`)
  }

  if (categoryId) {
    query = query.eq('category_id', categoryId)
  }

  const { data, error } = await query

  if (error) throw error

  return data as Product[]
}

// Fetch single product by ID
export async function getProduct(id: string) {
  const supabase = getClient()

  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      category:product_categories(*),
      subcategory:product_subcategories(*),
      base_uom:units_of_measure!products_base_uom_id_fkey(*),
      selling_uom:units_of_measure!products_selling_uom_id_fkey(*),
      variants:product_variants(*),
      images:product_images(*)
    `)
    .eq('id', id)
    .order('sort_order', { referencedTable: 'product_images', ascending: true })
    .single()

  if (error) throw error
  return data as Product & {
    variants: Tables<'product_variants'>[]
    images: Tables<'product_images'>[]
  }
}

// Create a new product
export async function createProduct(product: InsertTables<'products'>) {
  const supabase = getClient()

  const { data, error } = await supabase
    .from('products')
    .insert(product as any)
    .select()
    .single()

  if (error) throw error
  return data
}

// Update a product
export async function updateProduct(id: string, updates: UpdateTables<'products'>) {
  const supabase = getClient()

  const { data, error } = await supabase
    .from('products')
    .update(updates as any)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// Delete (soft) a product
export async function deleteProduct(id: string) {
  const supabase = getClient()

  const { error } = await supabase
    .from('products')
    .update({ is_active: false } as any)
    .eq('id', id)

  if (error) throw error
}

// Fetch all categories
export async function getCategories() {
  const supabase = getClient()

  const { data, error } = await supabase
    .from('product_categories')
    .select('*')
    .eq('is_active', true)
    .order('name')

  if (error) throw error
  return data as ProductCategory[]
}

// Fetch subcategories by category
export async function getSubcategories(categoryId?: string) {
  const supabase = getClient()

  let query = supabase
    .from('product_subcategories')
    .select('*')
    .eq('is_active', true)
    .order('name')

  if (categoryId) {
    query = query.eq('category_id', categoryId)
  }

  const { data, error } = await query

  if (error) throw error
  return data as Tables<'product_subcategories'>[]
}

// Fetch all units of measure
export async function getUnitsOfMeasure() {
  const supabase = getClient()

  const { data, error } = await supabase
    .from('units_of_measure')
    .select('*')
    .order('name')

  if (error) throw error
  return data as UnitOfMeasure[]
}

// Create category
export async function createCategory(category: InsertTables<'product_categories'>) {
  const supabase = getClient()

  const { data, error } = await supabase
    .from('product_categories')
    .insert(category as any)
    .select()
    .single()

  if (error) throw error
  return data
}

// Update category
export async function updateCategory(id: string, updates: UpdateTables<'product_categories'>) {
  const supabase = getClient()

  const { data, error } = await supabase
    .from('product_categories')
    .update(updates as any)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// Delete (soft) category
export async function deleteCategory(id: string) {
  const supabase = getClient()

  const { error } = await supabase
    .from('product_categories')
    .update({ is_active: false } as any)
    .eq('id', id)

  if (error) throw error
}

// Create subcategory
export async function createSubcategory(subcategory: InsertTables<'product_subcategories'>) {
  const supabase = getClient()

  const { data, error } = await supabase
    .from('product_subcategories')
    .insert(subcategory as any)
    .select()
    .single()

  if (error) throw error
  return data
}

// Update subcategory
export async function updateSubcategory(id: string, updates: UpdateTables<'product_subcategories'>) {
  const supabase = getClient()

  const { data, error } = await supabase
    .from('product_subcategories')
    .update(updates as any)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// Delete (soft) subcategory
export async function deleteSubcategory(id: string) {
  const supabase = getClient()

  const { error } = await supabase
    .from('product_subcategories')
    .update({ is_active: false } as any)
    .eq('id', id)

  if (error) throw error
}
