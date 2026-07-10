'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getClient } from '@/lib/supabase/client'

export type OnlineOrderStatus = 'pending' | 'confirmed' | 'preparing' | 'out_for_delivery' | 'delivered' | 'cancelled'
export type OnlineOrderFulfillment = 'delivery' | 'pickup'
export type OnlineOrderPaymentMethod = 'cod' | 'gcash' | 'bank_transfer' | 'qr'
export type OnlineOrderPaymentStatus = 'unpaid' | 'submitted' | 'verified' | 'refunded'

export interface OnlineOrderLine {
  id: string
  order_id: string
  product_id: string | null
  product_code: string
  product_name: string
  unit_label: string
  unit_price: number
  quantity: number
  line_total: number
}

export interface OnlineOrder {
  id: string
  order_number: string
  status: OnlineOrderStatus
  fulfillment: OnlineOrderFulfillment
  customer_name: string
  customer_phone: string
  address: string | null
  barangay: string | null
  municipality: string | null
  province: string | null
  latitude: number | null
  longitude: number | null
  distance_km: number | null
  payment_method: OnlineOrderPaymentMethod
  payment_status: OnlineOrderPaymentStatus
  payment_proof_url: string | null
  payment_reference_no: string | null
  subtotal: number
  delivery_fee: number
  total_amount: number
  notes: string | null
  customer_id: string | null
  transaction_id: string | null
  created_at: string
  updated_at: string
  lines?: OnlineOrderLine[]
  // joined
  customer?: { id: string; name: string; created_at: string } | null
}

const keys = {
  all: ['online_orders'] as const,
  list: (status?: string) => [...keys.all, 'list', status ?? 'all'] as const,
  detail: (id: string) => [...keys.all, 'detail', id] as const,
}

export function useOnlineOrders(statusFilter?: OnlineOrderStatus) {
  return useQuery({
    queryKey: keys.list(statusFilter),
    queryFn: async () => {
      const supabase = getClient()
      let q = supabase
        .from('online_orders')
        .select('*, customer:customers(id, name, created_at)')
        .order('created_at', { ascending: false })
        .limit(100)

      if (statusFilter) q = q.eq('status', statusFilter)

      const { data, error } = await q
      if (error) throw new Error(error.message)
      return (data ?? []) as OnlineOrder[]
    },
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 60,
  })
}

export function useOnlineOrder(id: string) {
  return useQuery({
    queryKey: keys.detail(id),
    queryFn: async () => {
      const supabase = getClient()
      const { data, error } = await supabase
        .from('online_orders')
        .select('*, lines:online_order_lines(*), customer:customers(id, name, created_at)')
        .eq('id', id)
        .single()
      if (error) throw new Error(error.message)
      return data as OnlineOrder
    },
    staleTime: 1000 * 30,
  })
}

export function useUpdateOnlineOrderStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OnlineOrderStatus }) => {
      const supabase = getClient()
      const { error } = await supabase
        .from('online_orders')
        .update({ status })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  })
}

export function useUpdateOnlineOrderPaymentStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payment_status }: { id: string; payment_status: OnlineOrderPaymentStatus }) => {
      const supabase = getClient()
      const { error } = await supabase
        .from('online_orders')
        .update({ payment_status })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  })
}

export function useUpdateOnlineOrderLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, quantity }: { id: string; quantity: number }) => {
      const supabase = getClient()
      const { data: line, error: fetchErr } = await supabase
        .from('online_order_lines')
        .select('unit_price, order_id')
        .eq('id', id)
        .single()
      if (fetchErr) throw new Error(fetchErr.message)

      const line_total = Number(line.unit_price) * quantity
      const { error } = await supabase
        .from('online_order_lines')
        .update({ quantity, line_total })
        .eq('id', id)
      if (error) throw new Error(error.message)

      // Recalculate order totals
      const { data: lines } = await supabase
        .from('online_order_lines')
        .select('line_total')
        .eq('order_id', line.order_id)

      const subtotal = (lines ?? []).reduce((s: number, l: any) => s + Number(l.line_total), 0)
      await supabase
        .from('online_orders')
        .update({ subtotal, total_amount: subtotal })
        .eq('id', line.order_id)

      return line.order_id
    },
    onSuccess: (orderId) => {
      qc.invalidateQueries({ queryKey: keys.detail(orderId) })
      qc.invalidateQueries({ queryKey: keys.list() })
    },
  })
}

export function useDeleteOnlineOrderLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (lineId: string) => {
      const supabase = getClient()
      const { data: line, error: fetchErr } = await supabase
        .from('online_order_lines')
        .select('order_id')
        .eq('id', lineId)
        .single()
      if (fetchErr) throw new Error(fetchErr.message)

      const { error } = await supabase
        .from('online_order_lines')
        .delete()
        .eq('id', lineId)
      if (error) throw new Error(error.message)

      // Recalculate totals
      const { data: lines } = await supabase
        .from('online_order_lines')
        .select('line_total')
        .eq('order_id', line.order_id)

      const subtotal = (lines ?? []).reduce((s: number, l: any) => s + Number(l.line_total), 0)
      await supabase
        .from('online_orders')
        .update({ subtotal, total_amount: subtotal })
        .eq('id', line.order_id)

      return line.order_id
    },
    onSuccess: (orderId) => {
      qc.invalidateQueries({ queryKey: keys.detail(orderId) })
      qc.invalidateQueries({ queryKey: keys.list() })
    },
  })
}
