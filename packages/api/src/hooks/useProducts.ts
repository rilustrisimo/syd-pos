import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { Product } from '../types'

const PRODUCTS_QUERY_KEY = ['products']

/**
 * Hook to fetch all products
 * Caches for 5 minutes, perfect for mobile offline support
 */
export const useProducts = (options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: PRODUCTS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(
          `
          *,
          category:product_categories(id, name),
          subcategory:product_subcategories(id, name),
          variants:product_variants(*)
        `
        )
        .eq('is_active', true)
        .order('name')

      if (error) {
        throw new Error(`Failed to fetch products: ${error.message}`)
      }

      return (data || []) as Product[]
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 60, // 1 hour in cache
    enabled: options?.enabled !== false,
    retry: 2,
  })
}

/**
 * Hook to search products by name or code
 */
export const useSearchProducts = (query: string, options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: [PRODUCTS_QUERY_KEY, 'search', query],
    queryFn: async () => {
      if (!query.trim()) {
        return []
      }

      const searchTerm = `%${query}%`

      const { data, error } = await supabase
        .from('products')
        .select(
          `
          *,
          category:product_categories(id, name),
          subcategory:product_subcategories(id, name),
          variants:product_variants(*)
        `
        )
        .eq('is_active', true)
        .or(`name.ilike.${searchTerm},code.ilike.${searchTerm}`)
        .limit(20)

      if (error) {
        throw new Error(`Failed to search products: ${error.message}`)
      }

      return (data || []) as Product[]
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30, // 30 minutes
    enabled: options?.enabled !== false && query.trim().length > 0,
    retry: 2,
  })
}

/**
 * Hook to get a single product by ID
 */
export const useProduct = (id: string | undefined, options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: [PRODUCTS_QUERY_KEY, id],
    queryFn: async () => {
      if (!id) {
        return null
      }

      const { data, error } = await supabase
        .from('products')
        .select(
          `
          *,
          category:product_categories(id, name),
          subcategory:product_subcategories(id, name),
          variants:product_variants(*)
        `
        )
        .eq('id', id)
        .single()

      if (error) {
        throw new Error(`Failed to fetch product: ${error.message}`)
      }

      return data as Product
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60,
    enabled: options?.enabled !== false && !!id,
    retry: 2,
  })
}

/**
 * Hook to get products by category
 */
export const useProductsByCategory = (
  categoryId: string | undefined,
  options?: { enabled?: boolean }
) => {
  return useQuery({
    queryKey: [PRODUCTS_QUERY_KEY, 'category', categoryId],
    queryFn: async () => {
      if (!categoryId) {
        return []
      }

      const { data, error } = await supabase
        .from('products')
        .select(
          `
          *,
          category:product_categories(id, name),
          subcategory:product_subcategories(id, name),
          variants:product_variants(*)
        `
        )
        .eq('category_id', categoryId)
        .eq('is_active', true)
        .order('name')

      if (error) {
        throw new Error(`Failed to fetch products: ${error.message}`)
      }

      return (data || []) as Product[]
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60,
    enabled: options?.enabled !== false && !!categoryId,
    retry: 2,
  })
}

/**
 * Hook to create or update a product
 */
export const useUpsertProduct = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (product: Partial<Product>) => {
      if (product.id) {
        // Update
        const { error } = await supabase
          .from('products')
          .update(product)
          .eq('id', product.id)

        if (error) {
          throw new Error(`Failed to update product: ${error.message}`)
        }

        return product
      } else {
        // Create
        const { data, error } = await supabase.from('products').insert([product]).select().single()

        if (error) {
          throw new Error(`Failed to create product: ${error.message}`)
        }

        return data
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY })
    },
  })
}

export default useProducts
