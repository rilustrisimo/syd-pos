'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getInvestments,
  getInvestment,
  createInvestment,
  updateInvestment,
  getLedger,
  addLedgerEntry,
  getInvestmentShares,
  getInvestmentSales,
  getTaggableLots,
  tagInvestment,
  untagInvestment,
  type InvestmentInput,
  type Investment,
  type LedgerEntryType,
} from '@/lib/supabase/queries/investments'

const KEY = 'investments'

export function useInvestments() {
  return useQuery({ queryKey: [KEY], queryFn: getInvestments })
}

export function useInvestment(id: string) {
  return useQuery({ queryKey: [KEY, id], queryFn: () => getInvestment(id), enabled: !!id })
}

export function useInvestmentLedger(id: string) {
  return useQuery({ queryKey: [KEY, id, 'ledger'], queryFn: () => getLedger(id), enabled: !!id })
}

export function useInvestmentShares(id: string) {
  return useQuery({ queryKey: [KEY, id, 'shares'], queryFn: () => getInvestmentShares(id), enabled: !!id })
}

export function useInvestmentSales(id: string) {
  return useQuery({ queryKey: [KEY, id, 'sales'], queryFn: () => getInvestmentSales(id), enabled: !!id })
}

export function useTaggableLots(poId: string, enabled = true) {
  return useQuery({ queryKey: [KEY, 'taggable', poId], queryFn: () => getTaggableLots(poId), enabled: !!poId && enabled })
}

/** Anything that changes tags or money changes every investment's figures. */
function useInvalidateAll() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: [KEY] })
}

export function useCreateInvestment() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ input, userId }: { input: InvestmentInput; userId: string }) => createInvestment(input, userId),
    onSuccess: invalidate,
  })
}

export function useUpdateInvestment() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ id, updates }: {
      id: string
      updates: Partial<Pick<Investment, 'investor_name' | 'contact' | 'notes' | 'status'>>
    }) => updateInvestment(id, updates),
    onSuccess: invalidate,
  })
}

export function useAddLedgerEntry() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ entry, userId }: {
      entry: { investment_id: string; entry_type: LedgerEntryType; amount: number; entry_date: string; notes?: string | null }
      userId: string
    }) => addLedgerEntry(entry, userId),
    onSuccess: invalidate,
  })
}

export function useTagInvestment() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ investmentId, lotId, qty, notes }: { investmentId: string; lotId: string; qty: number; notes?: string }) =>
      tagInvestment(investmentId, lotId, qty, notes),
    onSuccess: invalidate,
  })
}

export function useUntagInvestment() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ shareId, qty }: { shareId: string; qty: number }) => untagInvestment(shareId, qty),
    onSuccess: invalidate,
  })
}
