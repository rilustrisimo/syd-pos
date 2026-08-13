'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getBranches,
  getBranchInventory,
  getProductInventory,
  getInventoryMovements,
  getMovementTotals,
  getLowStockAlerts,
  adjustInventory,
  getInventorySummary,
  bulkAdjustInventory,
} from '@/lib/supabase/queries/inventory'

// Branches hooks
export function useBranches() {
  return useQuery({
    queryKey: ['branches'],
    queryFn: getBranches,
  })
}

// Branch inventory hooks
export function useBranchInventory(params?: {
  branchId?: string
  search?: string
  lowStockOnly?: boolean
  page?: number
  limit?: number
  enabled?: boolean
}) {
  const { enabled = true, ...queryParams } = params || {}
  return useQuery({
    queryKey: ['branch-inventory', queryParams],
    queryFn: () => getBranchInventory(queryParams),
    enabled,
  })
}

export function useProductInventory(productId: string) {
  return useQuery({
    queryKey: ['product-inventory', productId],
    queryFn: () => getProductInventory(productId),
    enabled: !!productId,
  })
}

// Server-side movement totals per branch — used for audit (no record limit)
export function useMovementTotals(productId: string) {
  return useQuery({
    queryKey: ['movement-totals', productId],
    queryFn: () => getMovementTotals(productId),
    enabled: !!productId,
  })
}

// Inventory movements hooks
export function useInventoryMovements(params?: {
  branchId?: string
  productId?: string
  movementType?: string
  page?: number
  limit?: number
}) {
  return useQuery({
    queryKey: ['inventory-movements', params],
    queryFn: () => getInventoryMovements(params),
  })
}

// Low stock alerts hook
export function useLowStockAlerts(branchId?: string) {
  return useQuery({
    queryKey: ['low-stock-alerts', branchId],
    queryFn: () => getLowStockAlerts(branchId),
  })
}

// Inventory summary hook
export function useInventorySummary(branchId?: string) {
  return useQuery({
    queryKey: ['inventory-summary', branchId],
    queryFn: () => getInventorySummary(branchId),
  })
}

// Bulk inventory adjustment mutation (used by stocktake)
export function useBulkAdjustInventory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: {
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
    }) => bulkAdjustInventory(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branch-inventory'] })
      queryClient.invalidateQueries({ queryKey: ['product-inventory'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] })
      queryClient.invalidateQueries({ queryKey: ['low-stock-alerts'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-summary'] })
    },
  })
}

// Adjust inventory mutation
export function useAdjustInventory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: {
      branchId: string
      productId: string
      variantId?: string | null
      quantityChange: number
      uomId: string
      reason: string
      notes: string
      userId: string
    }) => adjustInventory(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branch-inventory'] })
      queryClient.invalidateQueries({ queryKey: ['product-inventory'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] })
      queryClient.invalidateQueries({ queryKey: ['low-stock-alerts'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-summary'] })
    },
  })
}
