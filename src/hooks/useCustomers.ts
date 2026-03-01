'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getCustomers,
  getCustomer,
  searchCustomers,
  getWalkInCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerStats,
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
  walkIn: () => [...customerKeys.all, 'walk-in'] as const,
  stats: () => [...customerKeys.all, 'stats'] as const,
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

// Hook to search customers (for autocomplete)
export function useSearchCustomers(query: string, limit = 10) {
  return useQuery({
    queryKey: customerKeys.search(query),
    queryFn: () => searchCustomers(query, limit),
    enabled: true, // Always enabled, will show recent customers when query is empty
    staleTime: 0, // Always fetch fresh results on search
    gcTime: 30000, // Keep results in cache for 30 seconds for back navigation
    placeholderData: undefined, // Don't show stale data from previous queries while fetching
  })
}

// Hook to get walk-in customer
export function useWalkInCustomer() {
  return useQuery({
    queryKey: customerKeys.walkIn(),
    queryFn: getWalkInCustomer,
    staleTime: 300000, // 5 minutes - this rarely changes
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
