'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getTransactions,
  getTransaction,
  createTransaction,
  addPaymentToTransaction,
  getTodaysSummary,
  searchProductsForPOS,
  createReturnTransaction,
  getReturnsForTransaction,
  getReturns,
  getARAgingByCustomer,
  getARTransactionsForCustomer,
  TransactionFilters,
  TransactionInput,
  TransactionLineInput,
  PaymentInput,
  ReturnInput,
  ReturnLineInput,
  RefundInput,
} from '@/lib/supabase/queries/transactions'

// Query keys
export const transactionKeys = {
  all: ['transactions'] as const,
  lists: () => [...transactionKeys.all, 'list'] as const,
  list: (filters: TransactionFilters) => [...transactionKeys.lists(), filters] as const,
  details: () => [...transactionKeys.all, 'detail'] as const,
  detail: (id: string) => [...transactionKeys.details(), id] as const,
  todaysSummary: (branchId?: string) => [...transactionKeys.all, 'today', branchId] as const,
  productSearch: (query: string, branchId: string) =>
    [...transactionKeys.all, 'product-search', query, branchId] as const,
}

// Hook to get transactions with filters
export function useTransactions(filters: TransactionFilters = {}) {
  return useQuery({
    queryKey: transactionKeys.list(filters),
    queryFn: () => getTransactions(filters),
    staleTime: 30000, // 30 seconds
  })
}

// Hook to get a single transaction
export function useTransaction(id: string) {
  return useQuery({
    queryKey: transactionKeys.detail(id),
    queryFn: () => getTransaction(id),
    enabled: !!id,
  })
}

// Hook to get today's summary
export function useTodaysSummary(branchId?: string) {
  return useQuery({
    queryKey: transactionKeys.todaysSummary(branchId),
    queryFn: () => getTodaysSummary(branchId),
    staleTime: 60000, // 1 minute
    refetchInterval: 60000, // Refetch every minute
  })
}

// Hook to search products for POS
export function usePOSProductSearch(query: string, branchId: string) {
  return useQuery({
    queryKey: transactionKeys.productSearch(query, branchId),
    queryFn: () => searchProductsForPOS(query, branchId),
    enabled: query.length >= 2 && !!branchId,
    staleTime: 10000, // 10 seconds
  })
}

// Hook to create a transaction
export function useCreateTransaction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      input,
      lines,
      payments,
      userId,
    }: {
      input: TransactionInput
      lines: TransactionLineInput[]
      payments: PaymentInput[]
      userId: string
    }) => createTransaction(input, lines, payments, userId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: transactionKeys.lists() })
      queryClient.invalidateQueries({ queryKey: transactionKeys.todaysSummary() })
      // Also invalidate inventory queries
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

// Hook to add payment to transaction
export function useAddPayment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      transactionId,
      payment,
      userId,
    }: {
      transactionId: string
      payment: PaymentInput
      userId: string
    }) => addPaymentToTransaction(transactionId, payment, userId),
    onSuccess: (data, { transactionId }) => {
      queryClient.invalidateQueries({ queryKey: transactionKeys.detail(transactionId) })
      queryClient.invalidateQueries({ queryKey: transactionKeys.lists() })
      queryClient.invalidateQueries({ queryKey: transactionKeys.todaysSummary() })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

// ============================================
// RETURNS & REFUNDS
// ============================================

// Hook to get returns
export function useReturns(filters: TransactionFilters = {}) {
  return useQuery({
    queryKey: [...transactionKeys.lists(), 'returns', filters],
    queryFn: () => getReturns(filters),
    staleTime: 30000,
  })
}

// Hook to get returns for a specific transaction
export function useReturnsForTransaction(transactionId: string) {
  return useQuery({
    queryKey: [...transactionKeys.detail(transactionId), 'returns'],
    queryFn: () => getReturnsForTransaction(transactionId),
    enabled: !!transactionId,
  })
}

// Hook to create a return transaction
export function useCreateReturn() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      input,
      lines,
      refund,
      userId,
    }: {
      input: ReturnInput
      lines: ReturnLineInput[]
      refund: RefundInput
      userId: string
    }) => createReturnTransaction(input, lines, refund, userId),
    onSuccess: (data, { input }) => {
      // Invalidate transaction queries
      queryClient.invalidateQueries({ queryKey: transactionKeys.lists() })
      queryClient.invalidateQueries({ queryKey: transactionKeys.todaysSummary() })
      queryClient.invalidateQueries({ queryKey: transactionKeys.detail(input.original_transaction_id) })
      // Invalidate inventory and customer queries
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

// ============================================
// AR AGING REPORT
// ============================================

// Hook to get AR aging by customer
export function useARAgingByCustomer() {
  return useQuery({
    queryKey: [...transactionKeys.all, 'ar-aging'],
    queryFn: () => getARAgingByCustomer(),
    staleTime: 60000, // 1 minute
  })
}

// Hook to get AR transactions for a specific customer
export function useARTransactionsForCustomer(customerId: string) {
  return useQuery({
    queryKey: [...transactionKeys.all, 'ar-transactions', customerId],
    queryFn: () => getARTransactionsForCustomer(customerId),
    enabled: !!customerId,
    staleTime: 30000,
  })
}

// Hook to record AR payment
export function useRecordARPayment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      input,
      userId,
    }: {
      input: import('@/lib/supabase/queries/transactions').ARPaymentInput
      userId: string
    }) => {
      const { recordARPayment } = require('@/lib/supabase/queries/transactions')
      return recordARPayment(input, userId)
    },
    onSuccess: () => {
      // Invalidate AR and customer queries
      queryClient.invalidateQueries({ queryKey: transactionKeys.all })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
