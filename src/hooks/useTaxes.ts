'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getTaxSettings,
  upsertTaxSettings,
  getTaxPayments,
  createTaxPayment,
  deleteTaxPayment,
  getQuarterlyTaxData,
  getAnnualTaxData,
  type TaxPaymentInput,
} from '@/lib/supabase/queries/taxes'
import { useAuthStore } from '@/lib/stores/auth'

export function useTaxSettings(branchId: string | null) {
  return useQuery({
    queryKey: ['tax-settings', branchId],
    queryFn:  () => getTaxSettings(branchId!),
    enabled:  !!branchId,
  })
}

export function useUpsertTaxSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ branchId, updates }: { branchId: string; updates: Parameters<typeof upsertTaxSettings>[1] }) =>
      upsertTaxSettings(branchId, updates),
    onSuccess: (_data, { branchId }) => {
      qc.invalidateQueries({ queryKey: ['tax-settings', branchId] })
    },
  })
}

export function useTaxPayments(branchId: string | null, year?: number) {
  return useQuery({
    queryKey: ['tax-payments', branchId, year],
    queryFn:  () => getTaxPayments(branchId!, year),
    enabled:  !!branchId,
  })
}

export function useCreateTaxPayment() {
  const qc     = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: (input: TaxPaymentInput) => createTaxPayment(input, user!.id),
    onSuccess:  (_data, input) => {
      qc.invalidateQueries({ queryKey: ['tax-payments', input.branch_id] })
    },
  })
}

export function useDeleteTaxPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string; branchId: string }) => deleteTaxPayment(id),
    onSuccess:  (_data, { branchId }) => {
      qc.invalidateQueries({ queryKey: ['tax-payments', branchId] })
    },
  })
}

export function useQuarterlyTaxData(branchId: string | null, year: number, quarter: number) {
  return useQuery({
    queryKey: ['tax-quarterly', branchId, year, quarter],
    queryFn:  () => getQuarterlyTaxData(branchId!, year, quarter),
    enabled:  !!branchId,
  })
}

export function useAnnualTaxData(branchId: string | null, year: number) {
  return useQuery({
    queryKey: ['tax-annual', branchId, year],
    queryFn:  () => getAnnualTaxData(branchId!, year),
    enabled:  !!branchId,
    staleTime: 5 * 60 * 1000,
  })
}
