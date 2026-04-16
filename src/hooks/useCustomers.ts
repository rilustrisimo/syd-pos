'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getCustomers,
  getCustomer,
  searchCustomers,
  getAllActiveCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerStats,
  getCustomerPurchaseStats,
  getCustomerTopItems,
  CustomerFilters,
  CustomerInput
} from '@/lib/supabase/queries/customers'

// Query keys
export const customerKeys = {
  all: ['customers'] as const,
  lists: () => [...customerKeys.all, 'list'] as const,
  list: (filters: CustomerFilters) => [...customerKeys.lists(), filters] as const,
  details: () => [...customerKeys.all, 'detail'] as const,
  detail: (id: string) => [...customerKeys.details(), id] as const,
  search: (query: string) => [...customerKeys.all, 'search', query] as const,
  allActive: () => [...customerKeys.all, 'all-active'] as const,
  stats: () => [...customerKeys.all, 'stats'] as const,
  purchaseStats: (id: string) => [...customerKeys.all, 'purchase-stats', id] as const,
  topItems: (id: string) => [...customerKeys.all, 'top-items', id] as const,
}

// Hook to get customers with filters
export function useCustomers(filters: CustomerFilters = {}) {
  return useQuery({
    queryKey: customerKeys.list(filters),
    queryFn: () => getCustomers(filters),
    staleTime: 30000, // 30 seconds
  })
}

// Hook to get a single customer
export function useCustomer(id: string) {
  return useQuery({
    queryKey: customerKeys.detail(id),
    queryFn: () => getCustomer(id),
    enabled: !!id,
  })
}

// Hook to get all active customers (for POS)
export function useAllActiveCustomers() {
  return useQuery({
    queryKey: customerKeys.allActive(),
    queryFn: getAllActiveCustomers,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Hook to search customers (for autocomplete)
export function useSearchCustomers(query: string, limit = 10) {
  return useQuery({
    queryKey: customerKeys.search(query),
    queryFn: () => searchCustomers(query, limit),
    enabled: true, // Always enabled, will show recent customers when query is empty
    staleTime: 0, // Always fetch fresh results on search
    gcTime: 30000, // Keep results in cache for 30 seconds for back navigation
  })
}

// Hook to get customer stats
export function useCustomerStats() {
  return useQuery({
    queryKey: customerKeys.stats(),
    queryFn: getCustomerStats,
    staleTime: 60000, // 1 minute
  })
}

// Hook to get per-customer purchase stats
export function useCustomerPurchaseStats(id: string) {
  return useQuery({
    queryKey: customerKeys.purchaseStats(id),
    queryFn: () => getCustomerPurchaseStats(id),
    staleTime: 1000 * 60,
    enabled: !!id,
  })
}

// Hook to get per-customer top purchased items
export function useCustomerTopItems(id: string) {
  return useQuery({
    queryKey: customerKeys.topItems(id),
    queryFn: () => getCustomerTopItems(id),
    staleTime: 1000 * 60,
    enabled: !!id,
  })
}

// Hook to create a customer
export function useCreateCustomer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CustomerInput) => createCustomer(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.lists() })
      queryClient.invalidateQueries({ queryKey: customerKeys.stats() })
      queryClient.refetchQueries({ queryKey: customerKeys.lists(), type: 'active' })
    },
  })
}

// Hook to update a customer
export function useUpdateCustomer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CustomerInput> }) =>
      updateCustomer(id, input),
    onSuccess: (data, { id }) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.lists() })
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: customerKeys.stats() })
      queryClient.refetchQueries({ queryKey: customerKeys.lists(), type: 'active' })
      queryClient.refetchQueries({ queryKey: customerKeys.detail(id), type: 'active' })
    },
  })
}

// Hook to delete a customer
export function useDeleteCustomer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteCustomer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.lists() })
      queryClient.invalidateQueries({ queryKey: customerKeys.stats() })
      queryClient.refetchQueries({ queryKey: customerKeys.lists(), type: 'active' })
    },
  })
}
