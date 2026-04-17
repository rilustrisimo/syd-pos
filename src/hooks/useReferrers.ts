'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getReferrers,
  getReferrer,
  getAllActiveReferrers,
  getReferrerStats,
  getReferrerCommissions,
  getReferrerPayouts,
  getAllReferrerStats,
  createReferrer,
  updateReferrer,
  deleteReferrer,
  createPayout,
  tagTransactionReferrer,
  type ReferrerFilters,
  type ReferrerInput,
  type PayoutInput,
} from '@/lib/supabase/queries/referrers'

// ── Query keys ────────────────────────────────────────────────────────────────

export const referrerKeys = {
  all: ['referrers'] as const,
  lists: () => [...referrerKeys.all, 'list'] as const,
  list: (filters: ReferrerFilters) => [...referrerKeys.lists(), filters] as const,
  allActive: () => [...referrerKeys.all, 'all-active'] as const,
  details: () => [...referrerKeys.all, 'detail'] as const,
  detail: (id: string) => [...referrerKeys.details(), id] as const,
  stats: (id: string) => [...referrerKeys.all, 'stats', id] as const,
  globalStats: () => [...referrerKeys.all, 'global-stats'] as const,
  commissions: (id: string) => [...referrerKeys.all, 'commissions', id] as const,
  payouts: (id: string) => [...referrerKeys.all, 'payouts', id] as const,
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useReferrers(filters: ReferrerFilters = {}) {
  return useQuery({
    queryKey: referrerKeys.list(filters),
    queryFn: () => getReferrers(filters),
    staleTime: 30000,
  })
}

export function useAllActiveReferrers() {
  return useQuery({
    queryKey: referrerKeys.allActive(),
    queryFn: getAllActiveReferrers,
    staleTime: 5 * 60 * 1000,
  })
}

export function useReferrer(id: string) {
  return useQuery({
    queryKey: referrerKeys.detail(id),
    queryFn: () => getReferrer(id),
    enabled: !!id,
  })
}

export function useReferrerStats(id: string) {
  return useQuery({
    queryKey: referrerKeys.stats(id),
    queryFn: () => getReferrerStats(id),
    staleTime: 30000,
    enabled: !!id,
  })
}

export function useAllReferrerStats() {
  return useQuery({
    queryKey: referrerKeys.globalStats(),
    queryFn: getAllReferrerStats,
    staleTime: 30000,
  })
}

export function useReferrerCommissions(id: string) {
  return useQuery({
    queryKey: referrerKeys.commissions(id),
    queryFn: () => getReferrerCommissions(id),
    staleTime: 30000,
    enabled: !!id,
  })
}

export function useReferrerPayouts(id: string) {
  return useQuery({
    queryKey: referrerKeys.payouts(id),
    queryFn: () => getReferrerPayouts(id),
    staleTime: 30000,
    enabled: !!id,
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useCreateReferrer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ReferrerInput) => createReferrer(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: referrerKeys.lists() })
      queryClient.invalidateQueries({ queryKey: referrerKeys.allActive() })
      queryClient.invalidateQueries({ queryKey: referrerKeys.globalStats() })
    },
  })
}

export function useUpdateReferrer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ReferrerInput> }) =>
      updateReferrer(id, input),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: referrerKeys.lists() })
      queryClient.invalidateQueries({ queryKey: referrerKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: referrerKeys.allActive() })
    },
  })
}

export function useDeleteReferrer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteReferrer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: referrerKeys.lists() })
      queryClient.invalidateQueries({ queryKey: referrerKeys.allActive() })
      queryClient.invalidateQueries({ queryKey: referrerKeys.globalStats() })
    },
  })
}

export function useCreatePayout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ referrerId, input, userId }: { referrerId: string; input: PayoutInput; userId: string }) =>
      createPayout(referrerId, input, userId),
    onSuccess: (_, { referrerId }) => {
      queryClient.invalidateQueries({ queryKey: referrerKeys.payouts(referrerId) })
      queryClient.invalidateQueries({ queryKey: referrerKeys.stats(referrerId) })
      queryClient.invalidateQueries({ queryKey: referrerKeys.globalStats() })
    },
  })
}

export function useTagTransactionReferrer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ transactionId, referrerId, commissionRate }: {
      transactionId: string
      referrerId: string
      commissionRate: number
    }) => tagTransactionReferrer(transactionId, referrerId, commissionRate),
    onSuccess: (_, { referrerId }) => {
      queryClient.invalidateQueries({ queryKey: referrerKeys.commissions(referrerId) })
      queryClient.invalidateQueries({ queryKey: referrerKeys.stats(referrerId) })
    },
  })
}
