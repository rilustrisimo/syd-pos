'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getLiabilityPayables,
  getLiabilityPayableById,
  createLiabilityPayable,
  recordPayablePayment,
  softDeletePayable,
  getLiabilityLoans,
  getLiabilityLoanById,
  createLiabilityLoan,
  recordLoanPayment,
  softDeleteLoan,
  getAPAgingData,
  getUpcomingPayments,
  getCashFlowProjection,
  getLiabilitySummary,
  type PayableFilters,
  type LoanFilters,
  type CreatePayableInput,
  type RecordPayablePaymentInput,
  type CreateLoanInput,
  type RecordLoanPaymentInput,
} from '@/lib/supabase/queries/liabilities'

export * from '@/lib/supabase/queries/liabilities'

// ── Query keys ────────────────────────────────────────────────────────────────

export const liabilityKeys = {
  all: ['liabilities'] as const,
  payables: () => [...liabilityKeys.all, 'payables'] as const,
  payableList: (filters: PayableFilters) => [...liabilityKeys.payables(), 'list', filters] as const,
  payableDetail: (id: string) => [...liabilityKeys.payables(), 'detail', id] as const,
  loans: () => [...liabilityKeys.all, 'loans'] as const,
  loanList: (filters: LoanFilters) => [...liabilityKeys.loans(), 'list', filters] as const,
  loanDetail: (id: string) => [...liabilityKeys.loans(), 'detail', id] as const,
  apAging: () => [...liabilityKeys.all, 'ap-aging'] as const,
  upcoming: (days: number) => [...liabilityKeys.all, 'upcoming', days] as const,
  cashflow: (months: number) => [...liabilityKeys.all, 'cashflow', months] as const,
  summary: () => [...liabilityKeys.all, 'summary'] as const,
}

// ── Payable hooks ─────────────────────────────────────────────────────────────

export function usePayables(filters: PayableFilters = {}) {
  return useQuery({
    queryKey: liabilityKeys.payableList(filters),
    queryFn: () => getLiabilityPayables(filters),
    staleTime: 1000 * 60,
  })
}

export function usePayableById(id: string) {
  return useQuery({
    queryKey: liabilityKeys.payableDetail(id),
    queryFn: () => getLiabilityPayableById(id),
    staleTime: 1000 * 60,
    enabled: !!id,
  })
}

export function useCreatePayable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreatePayableInput) => createLiabilityPayable(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: liabilityKeys.payables() })
      queryClient.invalidateQueries({ queryKey: liabilityKeys.summary() })
      queryClient.invalidateQueries({ queryKey: liabilityKeys.upcoming(7) })
      queryClient.invalidateQueries({ queryKey: liabilityKeys.upcoming(30) })
    },
  })
}

export function useRecordPayablePayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RecordPayablePaymentInput) => recordPayablePayment(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: liabilityKeys.payables() })
      queryClient.invalidateQueries({ queryKey: liabilityKeys.payableDetail(variables.payable_id) })
      queryClient.invalidateQueries({ queryKey: liabilityKeys.summary() })
      queryClient.invalidateQueries({ queryKey: liabilityKeys.upcoming(7) })
      queryClient.invalidateQueries({ queryKey: liabilityKeys.upcoming(30) })
      queryClient.invalidateQueries({ queryKey: liabilityKeys.apAging() })
    },
  })
}

export function useDeletePayable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => softDeletePayable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: liabilityKeys.payables() })
      queryClient.invalidateQueries({ queryKey: liabilityKeys.summary() })
    },
  })
}

// ── Loan hooks ────────────────────────────────────────────────────────────────

export function useLoans(filters: LoanFilters = {}) {
  return useQuery({
    queryKey: liabilityKeys.loanList(filters),
    queryFn: () => getLiabilityLoans(filters),
    staleTime: 1000 * 60,
  })
}

export function useLoanById(id: string) {
  return useQuery({
    queryKey: liabilityKeys.loanDetail(id),
    queryFn: () => getLiabilityLoanById(id),
    staleTime: 1000 * 60,
    enabled: !!id,
  })
}

export function useCreateLoan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateLoanInput) => createLiabilityLoan(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: liabilityKeys.loans() })
      queryClient.invalidateQueries({ queryKey: liabilityKeys.summary() })
      queryClient.invalidateQueries({ queryKey: liabilityKeys.upcoming(7) })
      queryClient.invalidateQueries({ queryKey: liabilityKeys.upcoming(30) })
    },
  })
}

export function useRecordLoanPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RecordLoanPaymentInput) => recordLoanPayment(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: liabilityKeys.loans() })
      queryClient.invalidateQueries({ queryKey: liabilityKeys.loanDetail(variables.loan_id) })
      queryClient.invalidateQueries({ queryKey: liabilityKeys.summary() })
      queryClient.invalidateQueries({ queryKey: liabilityKeys.upcoming(7) })
      queryClient.invalidateQueries({ queryKey: liabilityKeys.upcoming(30) })
    },
  })
}

export function useDeleteLoan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => softDeleteLoan(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: liabilityKeys.loans() })
      queryClient.invalidateQueries({ queryKey: liabilityKeys.summary() })
    },
  })
}

// ── Reporting hooks ───────────────────────────────────────────────────────────

export function useAPAging() {
  return useQuery({
    queryKey: liabilityKeys.apAging(),
    queryFn: () => getAPAgingData(),
    staleTime: 1000 * 60 * 5,
  })
}

export function useUpcomingPayments(days: number = 30) {
  return useQuery({
    queryKey: liabilityKeys.upcoming(days),
    queryFn: () => getUpcomingPayments(days),
    staleTime: 1000 * 60 * 5,
  })
}

export function useCashFlowProjection(months: number = 6) {
  return useQuery({
    queryKey: liabilityKeys.cashflow(months),
    queryFn: () => getCashFlowProjection(months),
    staleTime: 1000 * 60 * 5,
  })
}

export function useLiabilitySummary() {
  return useQuery({
    queryKey: liabilityKeys.summary(),
    queryFn: () => getLiabilitySummary(),
    staleTime: 1000 * 60 * 2,
  })
}
