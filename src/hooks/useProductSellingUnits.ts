/**
 * React hooks for Product Selling Units
 */

'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getProductSellingUnits,
  getPrimarySellingUnit,
  createSellingUnit,
  updateSellingUnit,
  deleteSellingUnit,
  setPrimarySellingUnit,
  type CreateSellingUnitInput,
  type UpdateSellingUnitInput,
} from '@/lib/supabase/queries/product-selling-units'
import { toast } from 'sonner'

// Query keys
export const sellingUnitsKeys = {
  all: ['selling-units'] as const,
  product: (productId: string) => [...sellingUnitsKeys.all, productId] as const,
  primary: (productId: string) => [...sellingUnitsKeys.all, 'product', productId, 'primary'] as const,
}

/**
 * Get all selling units for a product
 */
export function useProductSellingUnits(productId: string | undefined) {
  return useQuery({
    queryKey: sellingUnitsKeys.product(productId || ''),
    queryFn: () => getProductSellingUnits(productId!),
    enabled: !!productId,
    staleTime: 300000, // 5 minutes
  })
}

/**
 * Get primary selling unit for a product
 */
export function usePrimarySellingUnit(productId: string | undefined) {
  return useQuery({
    queryKey: sellingUnitsKeys.primary(productId || ''),
    queryFn: () => getPrimarySellingUnit(productId!),
    enabled: !!productId,
    staleTime: 300000, // 5 minutes
  })
}

/**
 * Create a new selling unit
 */
export function useCreateSellingUnit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateSellingUnitInput) => createSellingUnit(input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: sellingUnitsKeys.product(data.product_id) })
      queryClient.invalidateQueries({ queryKey: sellingUnitsKeys.primary(data.product_id) })
      toast.success('Selling unit added successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to add selling unit')
    },
  })
}

/**
 * Update a selling unit
 */
export function useUpdateSellingUnit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateSellingUnitInput) => updateSellingUnit(input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: sellingUnitsKeys.product(data.product_id) })
      queryClient.invalidateQueries({ queryKey: sellingUnitsKeys.primary(data.product_id) })
      toast.success('Selling unit updated successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update selling unit')
    },
  })
}

/**
 * Delete a selling unit
 */
export function useDeleteSellingUnit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteSellingUnit(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sellingUnitsKeys.all })
      toast.success('Selling unit removed successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to remove selling unit')
    },
  })
}

/**
 * Set a selling unit as primary
 */
export function useSetPrimarySellingUnit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => setPrimarySellingUnit(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sellingUnitsKeys.all })
      toast.success('Primary selling unit updated')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update primary unit')
    },
  })
}
