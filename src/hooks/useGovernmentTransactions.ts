'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  createTransaction,
  deliverGovernmentSale,
  recordGovernmentPayment,
  softDeleteTransaction,
  updateGovernmentSale,
  type TransactionInput,
  type GovSaleLineInput,
} from '@/lib/supabase/queries/transactions'

// ── Query keys ────────────────────────────────────────────────────────────────
export const govTxnKeys = {
  all: ['government-transactions'] as const,
  lists: () => [...govTxnKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...govTxnKeys.lists(), filters] as const,
  detail: (id: string) => [...govTxnKeys.all, 'detail', id] as const,
}

const GOV_TXN_SELECT = `
  *,
  customer:customers(id, name, phone),
  branch:branches(id, name),
  canvas:canvases(id, canvas_number, total_amount),
  lines:transaction_lines(
    *,
    product:products(id, code, name),
    uom:units_of_measure(id, name, code)
  ),
  payments:transaction_payments(*)
`

export interface GovTransactionFilters {
  page?: number
  limit?: number
  payment_status?: 'unpaid' | 'partial' | 'paid'
  dateFrom?: string
  dateTo?: string
  search?: string
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useGovernmentTransactions(filters: GovTransactionFilters = {}) {
  const { page = 1, limit = 20, payment_status, dateFrom, dateTo, search } = filters
  const offset = (page - 1) * limit

  return useQuery({
    queryKey: govTxnKeys.list({ page, limit, payment_status, dateFrom, dateTo, search }),
    queryFn: async () => {
      const supabase = createClient()
      let query = supabase
        .from('transactions')
        .select(GOV_TXN_SELECT, { count: 'exact' })
        .eq('is_government_sale', true)
        .eq('is_deleted', false)
        .eq('transaction_type', 'sale')

      if (payment_status) query = query.eq('payment_status', payment_status)
      if (dateFrom) query = query.gte('transaction_date', dateFrom)
      if (dateTo) query = query.lte('transaction_date', dateTo)
      if (search) {
        query = query.or(`po_number.ilike.%${search}%,government_agency.ilike.%${search}%`)
      }

      query = query.order('transaction_date', { ascending: false }).range(offset, offset + limit - 1)

      const { data, error, count } = await query
      if (error) throw new Error(`Failed to fetch government transactions: ${error.message}`)

      return { data: data || [], total: count || 0, page, limit }
    },
    staleTime: 1000 * 30,
  })
}

export function useGovernmentTransaction(id: string | undefined) {
  return useQuery({
    queryKey: govTxnKeys.detail(id || ''),
    queryFn: async () => {
      if (!id) return null
      const supabase = createClient()
      const { data, error } = await supabase
        .from('transactions')
        .select(GOV_TXN_SELECT)
        .eq('id', id)
        .eq('is_government_sale', true)
        .single()
      if (error) throw new Error(`Failed to fetch government transaction: ${error.message}`)
      return data
    },
    enabled: !!id,
    staleTime: 1000 * 60,
  })
}

export function useCreateGovernmentTransaction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ input, lines, payments, userId }: { input: TransactionInput; lines: any[]; payments: any[]; userId: string }) =>
      createTransaction(input, lines, payments, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: govTxnKeys.all })
    },
  })
}

export function useRecordGovernmentPayment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      transactionId,
      netChequeAmount,
      chequeMethod,
      referenceNumber,
      userId,
    }: {
      transactionId: string
      netChequeAmount: number
      chequeMethod: 'bank_transfer' | 'cash'
      referenceNumber?: string | null
      userId: string
    }) => recordGovernmentPayment(transactionId, netChequeAmount, chequeMethod, referenceNumber ?? null, userId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: govTxnKeys.detail(variables.transactionId) })
      queryClient.invalidateQueries({ queryKey: govTxnKeys.lists() })
    },
  })
}

export function useUpdateGovernmentSale() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      transactionId,
      header,
      lines,
    }: {
      transactionId: string
      header: Parameters<typeof updateGovernmentSale>[1]
      lines: GovSaleLineInput[]
    }) => updateGovernmentSale(transactionId, header, lines),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: govTxnKeys.detail(variables.transactionId) })
      queryClient.invalidateQueries({ queryKey: govTxnKeys.lists() })
    },
  })
}

export function useDeliverGovernmentSale() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ transactionId, userId }: { transactionId: string; userId: string }) =>
      deliverGovernmentSale(transactionId, userId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: govTxnKeys.detail(variables.transactionId) })
      queryClient.invalidateQueries({ queryKey: govTxnKeys.lists() })
    },
  })
}

export function useDeleteGovernmentSale() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ transactionId, userId }: { transactionId: string; userId: string }) =>
      softDeleteTransaction(transactionId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: govTxnKeys.all })
    },
  })
}

// ── Government summary stats ───────────────────────────────────────────────────

export function useGovernmentStats() {
  return useQuery({
    queryKey: [...govTxnKeys.all, 'stats'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('transactions')
        .select('payment_status, total_amount, withholding_amount, amount_paid')
        .eq('is_government_sale', true)
        .eq('is_deleted', false)
        .eq('transaction_type', 'sale')

      if (error) throw new Error(error.message)

      const rows = (data || []) as any[]
      const unpaid = rows.filter(r => r.payment_status === 'unpaid')
      const partial = rows.filter(r => r.payment_status === 'partial')

      return {
        totalTransactions: rows.length,
        pendingCount: unpaid.length + partial.length,
        totalOutstanding: rows.reduce(
          (s, r) => s + (Number(r.total_amount) - Number(r.amount_paid)),
          0
        ),
        totalWithholding: rows.reduce((s, r) => s + Number(r.withholding_amount || 0), 0),
      }
    },
    staleTime: 1000 * 60,
  })
}
