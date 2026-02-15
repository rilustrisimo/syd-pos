'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getSuppliers,
  getSupplier,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  generateSupplierCode,
  getSupplierPurchaseHistory,
} from '@/lib/supabase/queries/suppliers'
import type { InsertTables, UpdateTables } from '@/types/database'

// Get all suppliers
export function useSuppliers(params?: {
  search?: string
  page?: number
  limit?: number
  includeInactive?: boolean
}) {
  return useQuery({
    queryKey: ['suppliers', params],
    queryFn: () => getSuppliers(params),
  })
}

// Get single supplier
export function useSupplier(id: string) {
  return useQuery({
    queryKey: ['supplier', id],
    queryFn: () => getSupplier(id),
    enabled: !!id,
  })
}

// Generate supplier code
export function useGenerateSupplierCode() {
  return useQuery({
    queryKey: ['supplier-code-generate'],
    queryFn: generateSupplierCode,
    staleTime: 0, // Always fetch fresh
  })
}

// Get supplier purchase history
export function useSupplierPurchaseHistory(supplierId: string, params?: {
  page?: number
  limit?: number
}) {
  return useQuery({
    queryKey: ['supplier-purchase-history', supplierId, params],
    queryFn: () => getSupplierPurchaseHistory(supplierId, params),
    enabled: !!supplierId,
  })
}

// Create supplier mutation
export function useCreateSupplier() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (supplier: InsertTables<'suppliers'>) => createSupplier(supplier),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      queryClient.invalidateQueries({ queryKey: ['supplier-code-generate'] })
      queryClient.refetchQueries({ queryKey: ['suppliers'], type: 'active' })
    },
  })
}

// Update supplier mutation
export function useUpdateSupplier() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateTables<'suppliers'> }) =>
      updateSupplier(id, updates),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      queryClient.invalidateQueries({ queryKey: ['supplier', variables.id] })
      queryClient.refetchQueries({ queryKey: ['suppliers'], type: 'active' })
      queryClient.refetchQueries({ queryKey: ['supplier', variables.id], type: 'active' })
    },
  })
}

// Delete supplier mutation
export function useDeleteSupplier() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteSupplier(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      queryClient.refetchQueries({ queryKey: ['suppliers'], type: 'active' })
    },
  })
}
