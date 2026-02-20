import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { CreateReturnPayload } from '../types'

const RETURNS_QUERY_KEY = ['returns']

/**
 * Hook to fetch paginated returns
 */
export const useReturns = (page: number = 1, limit: number = 20, options?: { enabled?: boolean }) => {
  const offset = (page - 1) * limit

  return useQuery({
    queryKey: [RETURNS_QUERY_KEY, 'list', page, limit],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('transaction_returns')
        .select(
          `
          *,
          transaction:transactions(
            *,
            customer:customers(*),
            lines:transaction_lines(*)
          ),
          return_lines:transaction_return_lines(*)
        `,
          { count: 'exact' }
        )
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) {
        throw new Error(`Failed to fetch returns: ${error.message}`)
      }

      return {
        data: data || [],
        total: count || 0,
        page,
        limit,
      }
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
    enabled: options?.enabled !== false,
    retry: 2,
  })
}

/**
 * Hook to search returns by transaction number
 */
export const useSearchReturns = (query: string, options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: [RETURNS_QUERY_KEY, 'search', query],
    queryFn: async () => {
      if (!query.trim()) {
        return []
      }

      const searchTerm = `%${query}%`

      const { data, error } = await supabase
        .from('transaction_returns')
        .select(
          `
          *,
          transaction:transactions(
            *,
            customer:customers(*),
            lines:transaction_lines(*)
          ),
          return_lines:transaction_return_lines(*)
        `
        )
        .eq('transaction.transaction_number', searchTerm)
        .limit(20)

      if (error) {
        throw new Error(`Failed to search returns: ${error.message}`)
      }

      return data || []
    },
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 5,
    enabled: options?.enabled !== false && query.trim().length > 0,
    retry: 1,
  })
}

/**
 * Hook to get a single return by ID
 */
export const useReturn = (id: string | undefined) => {
  return useQuery({
    queryKey: [RETURNS_QUERY_KEY, id],
    queryFn: async () => {
      if (!id) {
        return null
      }

      const { data, error } = await supabase
        .from('transaction_returns')
        .select(
          `
          *,
          transaction:transactions(
            *,
            customer:customers(*),
            lines:transaction_lines(*)
          ),
          return_lines:transaction_return_lines(*)
        `
        )
        .eq('id', id)
        .single()

      if (error) {
        throw new Error(`Failed to fetch return: ${error.message}`)
      }

      return data
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    enabled: !!id,
    retry: 2,
  })
}

/**
 * Hook to get returns for a specific transaction
 */
export const useTransactionReturns = (transactionId: string | undefined) => {
  return useQuery({
    queryKey: [RETURNS_QUERY_KEY, 'transaction', transactionId],
    queryFn: async () => {
      if (!transactionId) {
        return []
      }

      const { data, error } = await supabase
        .from('transaction_returns')
        .select(
          `
          *,
          transaction:transactions(
            *,
            customer:customers(*),
            lines:transaction_lines(*)
          ),
          return_lines:transaction_return_lines(*)
        `
        )
        .eq('transaction_id', transactionId)
        .order('created_at', { ascending: false })

      if (error) {
        throw new Error(`Failed to fetch transaction returns: ${error.message}`)
      }

      return data || []
    },
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 10,
    enabled: !!transactionId,
    retry: 2,
  })
}

/**
 * Hook to create a new return
 */
export const useCreateReturn = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: CreateReturnPayload) => {
      if (!payload.input.original_transaction_id) {
        throw new Error('Transaction ID is required for returns')
      }

      // Create return record
      const { data: returnRecord, error: returnError } = await supabase
        .from('transaction_returns')
        .insert([
          {
            transaction_id: payload.input.original_transaction_id,
            reason: payload.input.reason || 'Customer return',
            notes: payload.input.notes || null,
            user_id: payload.userId,
          },
        ])
        .select()
        .single()

      if (returnError) {
        throw new Error(`Failed to create return: ${returnError.message}`)
      }

      // Create return lines
      if (payload.lines && payload.lines.length > 0) {
        const returnLinesData = payload.lines.map((line) => ({
          return_id: returnRecord.id,
          product_id: line.product_id,
          original_quantity: line.quantity,
          return_quantity: line.quantity,
          refund_amount: line.unit_price * line.quantity,
          notes: null,
        }))

        const { error: linesError } = await supabase
          .from('transaction_return_lines')
          .insert(returnLinesData)

        if (linesError) {
          throw new Error(`Failed to create return lines: ${linesError.message}`)
        }
      }

      // Create refund payment if refund is being issued
      if (payload.refund && payload.refund.amount > 0) {
        const { error: refundError } = await supabase
          .from('transaction_payments')
          .insert([
            {
              transaction_id: payload.input.original_transaction_id,
              payment_method: payload.refund.refund_method,
              amount: -payload.refund.amount, // Negative for refund
              reference_number: payload.refund.reference_number || null,
              status: 'completed' as const,
              notes: `Refund for return: ${returnRecord.id}`,
            },
          ])

        if (refundError) {
          throw new Error(`Failed to create refund: ${refundError.message}`)
        }
      }

      return returnRecord
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RETURNS_QUERY_KEY })
    },
  })
}

/**
 * Hook to process a return and issue refund
 */
export const useProcessReturn = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: {
      returnId: string
      refundMethod: string
      refundAmount: number
      referenceNumber?: string
    }) => {
      // Get return details
      const { data: returnData, error: fetchError } = await supabase
        .from('transaction_returns')
        .select('*')
        .eq('id', payload.returnId)
        .single()

      if (fetchError || !returnData) {
        throw new Error('Failed to fetch return details')
      }

      // Create refund payment
      const { error: refundError } = await supabase
        .from('transaction_payments')
        .insert([
          {
            transaction_id: returnData.transaction_id,
            payment_method: payload.refundMethod,
            amount: -payload.refundAmount, // Negative for refund
            reference_number: payload.referenceNumber || null,
            status: 'completed' as const,
            notes: `Refund for return: ${payload.returnId}`,
          },
        ])

      if (refundError) {
        throw new Error(`Failed to process refund: ${refundError.message}`)
      }

      // Mark return as processed
      const { error: updateError } = await supabase
        .from('transaction_returns')
        .update({ refunded_at: new Date().toISOString() })
        .eq('id', payload.returnId)

      if (updateError) {
        throw new Error(`Failed to update return: ${updateError.message}`)
      }

      return returnData
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RETURNS_QUERY_KEY })
    },
  })
}

/**
 * Hook to delete a return
 */
export const useDeleteReturn = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      // Delete return lines first
      await supabase.from('transaction_return_lines').delete().eq('return_id', id)

      // Delete return
      const { error } = await supabase.from('transaction_returns').delete().eq('id', id)

      if (error) {
        throw new Error(`Failed to delete return: ${error.message}`)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RETURNS_QUERY_KEY })
    },
  })
}

export default useReturns
