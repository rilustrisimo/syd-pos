'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getClient } from '@/lib/supabase/client'

export type OnlineOrderStatus = 'pending' | 'confirmed' | 'preparing' | 'out_for_delivery' | 'delivered' | 'picked_up' | 'cancelled'
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
  discount_amount: number
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
  payment_qr_label: string | null
  subtotal: number
  delivery_fee: number
  discount_amount: number
  discount_percentage: number
  total_amount: number
  notes: string | null
  staff_log: string | null
  customer_id: string | null
  transaction_id: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  lines?: OnlineOrderLine[]
  // joined
  customer?: { id: string; name: string; created_at: string } | null
}

const keys = {
  all: ['online_orders'] as const,
  list: (status?: string) => [...keys.all, 'list', status ?? 'all'] as const,
  detail: (id: string) => [...keys.all, 'detail', id] as const,
  pendingBanner: () => [...keys.all, 'pending-banner'] as const,
}

export interface PendingOnlineOrderSummary {
  id: string
  order_number: string
  customer_name: string
  total_amount: number
  fulfillment: OnlineOrderFulfillment
}

export function useOnlineOrders(statusFilter?: OnlineOrderStatus) {
  return useQuery({
    queryKey: keys.list(statusFilter),
    queryFn: async () => {
      const supabase = getClient()
      let q = supabase
        .from('online_orders')
        .select('*, customer:customers(id, name, created_at)')
        .is('deleted_at', null)
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

// Powers the persistent "pending orders" banner (src/components/notifications/
// pending-orders-banner.tsx) and the nav badge — kept fresh primarily by the
// realtime subscription in order-notification-listener.tsx, but also polled
// every 30s as a safety net. The desktop (Electron) app's WebSocket has been
// observed to connect at launch but not reliably survive/reconnect over a
// long-running session, silently going stale with no client-side error —
// the poll means a dead connection self-heals within ~30s instead of
// requiring a full app restart. refetchIntervalInBackground is needed
// because a kiosk-style Electron window may never fire the "visible again"
// event React Query normally relies on to resume polling.
export function usePendingOnlineOrdersBanner() {
  return useQuery({
    queryKey: keys.pendingBanner(),
    queryFn: async () => {
      const supabase = getClient()
      const { data, error } = await supabase
        .from('online_orders')
        .select('id, order_number, customer_name, total_amount, fulfillment')
        .eq('status', 'pending')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as PendingOnlineOrderSummary[]
    },
    refetchInterval: 1000 * 30,
    refetchIntervalInBackground: true,
    staleTime: 1000 * 60,
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

// Live stock lookup for an order's line items, keyed by product_id.
// Used to warn staff and block "Convert to Sale" when the customer
// ordered more than what's currently on hand.
export function useOnlineOrderStock(productIds: string[]) {
  return useQuery({
    queryKey: ['online_order_stock', ...[...productIds].sort()],
    queryFn: async () => {
      const supabase = getClient()
      const { data: settings } = await supabase
        .from('shop_settings')
        .select('branch_id')
        .limit(1)
        .single()

      if (!settings?.branch_id) return {} as Record<string, number>

      const { data: inventory, error } = await supabase
        .from('branch_inventory')
        .select('product_id, quantity_on_hand')
        .eq('branch_id', settings.branch_id)
        .in('product_id', productIds)
      if (error) throw new Error(error.message)

      const stock: Record<string, number> = {}
      for (const row of inventory ?? []) {
        stock[row.product_id] = Number(row.quantity_on_hand ?? 0)
      }
      return stock
    },
    enabled: productIds.length > 0,
    staleTime: 1000 * 30,
  })
}

// payment-proofs is a private bucket — payment_proof_url stores the object
// path, not a public URL. Resolve it to a short-lived signed URL for viewing.
export function useSignedPaymentProofUrl(path: string | null) {
  return useQuery({
    queryKey: ['payment_proof_signed_url', path],
    queryFn: async () => {
      const supabase = getClient()
      const { data, error } = await supabase.storage
        .from('payment-proofs')
        .createSignedUrl(path!, 300)
      if (error) throw new Error(error.message)
      return data.signedUrl
    },
    enabled: !!path,
    staleTime: 1000 * 60 * 4,
  })
}

// Soft delete — sets deleted_at instead of removing the row, so the order
// (and its lines, staff log, payment references) stay in the database and
// can be restored. The list, pending banner, and nav badge all filter on
// deleted_at IS NULL, so a soft-deleted order just disappears from normal
// view.
export function useSoftDeleteOnlineOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (orderId: string) => {
      const supabase = getClient()
      const { error } = await supabase
        .from('online_orders')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', orderId)
      if (error) throw new Error(error.message)
      return orderId
    },
    onSuccess: (orderId) => {
      qc.invalidateQueries({ queryKey: keys.detail(orderId) })
      qc.invalidateQueries({ queryKey: keys.list() })
      qc.invalidateQueries({ queryKey: keys.pendingBanner() })
    },
  })
}

export function useRestoreOnlineOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (orderId: string) => {
      const supabase = getClient()
      const { error } = await supabase
        .from('online_orders')
        .update({ deleted_at: null })
        .eq('id', orderId)
      if (error) throw new Error(error.message)
      return orderId
    },
    onSuccess: (orderId) => {
      qc.invalidateQueries({ queryKey: keys.detail(orderId) })
      qc.invalidateQueries({ queryKey: keys.list() })
      qc.invalidateQueries({ queryKey: keys.pendingBanner() })
    },
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

function logTimestamp() {
  return new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
}

function appendLog(existing: string | null, entry: string) {
  const line = `[${logTimestamp()}] ${entry}`
  return existing ? `${existing}\n${line}` : line
}

async function recalcOrderTotals(
  supabase: ReturnType<typeof getClient>,
  orderId: string,
  logEntry: string
) {
  const { data: lines } = await supabase
    .from('online_order_lines')
    .select('line_total, discount_amount')
    .eq('order_id', orderId)

  const grossTotal = (lines ?? []).reduce((s: number, l: any) => s + Number(l.line_total), 0)
  const lineDiscounts = (lines ?? []).reduce((s: number, l: any) => s + Number(l.discount_amount ?? 0), 0)
  const subtotal = grossTotal - lineDiscounts

  const { data: order } = await supabase
    .from('online_orders')
    .select('delivery_fee, staff_log, discount_amount, discount_percentage')
    .eq('id', orderId)
    .single()

  const delivery_fee = Number(order?.delivery_fee ?? 0)
  const orderDiscountAmount = Number(order?.discount_amount ?? 0)
  const orderDiscountPercentage = Number(order?.discount_percentage ?? 0)
  const orderDiscount = orderDiscountAmount > 0
    ? orderDiscountAmount
    : (subtotal * orderDiscountPercentage) / 100
  const staff_log = appendLog(order?.staff_log ?? null, logEntry)

  await supabase
    .from('online_orders')
    .update({ subtotal, total_amount: subtotal - orderDiscount + delivery_fee, staff_log })
    .eq('id', orderId)
}

export function useUpdateOnlineOrderLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, quantity }: { id: string; quantity: number }) => {
      const supabase = getClient()
      const { data: line, error: fetchErr } = await supabase
        .from('online_order_lines')
        .select('unit_price, order_id, product_name, quantity, unit_label')
        .eq('id', id)
        .single()
      if (fetchErr) throw new Error(fetchErr.message)

      const line_total = Number(line.unit_price) * quantity
      const { error } = await supabase
        .from('online_order_lines')
        .update({ quantity, line_total })
        .eq('id', id)
      if (error) throw new Error(error.message)

      const logEntry = `Staff adjusted: Qty of ${line.product_name} changed from ${line.quantity} to ${quantity} ${line.unit_label}`
      await recalcOrderTotals(supabase, line.order_id, logEntry)

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
        .select('order_id, product_name, quantity, unit_label')
        .eq('id', lineId)
        .single()
      if (fetchErr) throw new Error(fetchErr.message)

      const { error } = await supabase
        .from('online_order_lines')
        .delete()
        .eq('id', lineId)
      if (error) throw new Error(error.message)

      const logEntry = `Staff removed: ${line.product_name} (was ${line.quantity} ${line.unit_label})`
      await recalcOrderTotals(supabase, line.order_id, logEntry)

      return line.order_id
    },
    onSuccess: (orderId) => {
      qc.invalidateQueries({ queryKey: keys.detail(orderId) })
      qc.invalidateQueries({ queryKey: keys.list() })
    },
  })
}

export interface NewOnlineOrderLineInput {
  order_id: string
  product_id: string
  product_code: string
  product_name: string
  unit_label: string
  unit_price: number
  quantity: number
}

export function useAddOnlineOrderLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewOnlineOrderLineInput) => {
      const supabase = getClient()
      const line_total = input.unit_price * input.quantity
      const { error } = await supabase
        .from('online_order_lines')
        .insert({ ...input, line_total })
      if (error) throw new Error(error.message)

      const logEntry = `Staff added: ${input.product_name} × ${input.quantity} ${input.unit_label}`
      await recalcOrderTotals(supabase, input.order_id, logEntry)

      return input.order_id
    },
    onSuccess: (orderId) => {
      qc.invalidateQueries({ queryKey: keys.detail(orderId) })
      qc.invalidateQueries({ queryKey: keys.list() })
    },
  })
}

export function useUpdateOnlineOrderLineDiscount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, discount_amount }: { id: string; discount_amount: number }) => {
      const supabase = getClient()
      const { data: line, error: fetchErr } = await supabase
        .from('online_order_lines')
        .select('order_id, product_name')
        .eq('id', id)
        .single()
      if (fetchErr) throw new Error(fetchErr.message)

      const { error } = await supabase
        .from('online_order_lines')
        .update({ discount_amount })
        .eq('id', id)
      if (error) throw new Error(error.message)

      const logEntry = `Staff applied discount of ${discount_amount.toFixed(2)} to ${line.product_name}`
      await recalcOrderTotals(supabase, line.order_id, logEntry)

      return line.order_id
    },
    onSuccess: (orderId) => {
      qc.invalidateQueries({ queryKey: keys.detail(orderId) })
      qc.invalidateQueries({ queryKey: keys.list() })
    },
  })
}

export function useUpdateOnlineOrderDiscount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      order_id,
      discount_amount,
      discount_percentage,
    }: {
      order_id: string
      discount_amount: number
      discount_percentage: number
    }) => {
      const supabase = getClient()
      const { error } = await supabase
        .from('online_orders')
        .update({ discount_amount, discount_percentage })
        .eq('id', order_id)
      if (error) throw new Error(error.message)

      const logEntry = discount_percentage > 0
        ? `Staff applied an order-level discount of ${discount_percentage}%`
        : `Staff applied an order-level discount of ${discount_amount.toFixed(2)}`
      await recalcOrderTotals(supabase, order_id, logEntry)

      return order_id
    },
    onSuccess: (orderId) => {
      qc.invalidateQueries({ queryKey: keys.detail(orderId) })
      qc.invalidateQueries({ queryKey: keys.list() })
    },
  })
}

export function useUpdateOnlineOrderDeliveryLocation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      latitude,
      longitude,
      distance_km,
      delivery_fee,
    }: {
      id: string
      latitude: number
      longitude: number
      distance_km: number
      delivery_fee: number
    }) => {
      const supabase = getClient()
      const { error } = await supabase
        .from('online_orders')
        .update({ latitude, longitude, distance_km, delivery_fee })
        .eq('id', id)
      if (error) throw new Error(error.message)

      // recalcOrderTotals re-reads delivery_fee fresh from the row, so
      // writing it above first means the total_amount it computes here
      // already reflects the corrected fee.
      const logEntry = `Staff repinned delivery location: ${distance_km} km, delivery fee updated to ${delivery_fee.toFixed(2)}`
      await recalcOrderTotals(supabase, id, logEntry)

      return id
    },
    onSuccess: (orderId) => {
      qc.invalidateQueries({ queryKey: keys.detail(orderId) })
      qc.invalidateQueries({ queryKey: keys.list() })
    },
  })
}

// Converts an order between pickup and delivery. Switching to delivery
// carries a picked location + fee (from the same DeliveryMapPicker flow
// used to edit an already-delivery order's pin); switching to pickup just
// zeroes the delivery fee. Either way, recalcOrderTotals picks up the new
// delivery_fee and recomputes total_amount, same as every other in-place
// edit on this page.
export function useUpdateOnlineOrderFulfillment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      fulfillment,
      latitude,
      longitude,
      distance_km,
      delivery_fee,
    }: {
      id: string
      fulfillment: 'pickup' | 'delivery'
      latitude?: number | null
      longitude?: number | null
      distance_km?: number | null
      delivery_fee: number
    }) => {
      const supabase = getClient()
      const updates: Record<string, unknown> = { fulfillment, delivery_fee }
      if (fulfillment === 'delivery') {
        updates.latitude = latitude
        updates.longitude = longitude
        updates.distance_km = distance_km
      }

      const { error } = await supabase
        .from('online_orders')
        .update(updates)
        .eq('id', id)
      if (error) throw new Error(error.message)

      const logEntry = fulfillment === 'delivery'
        ? `Staff converted order to Delivery: ${distance_km} km, delivery fee ${delivery_fee.toFixed(2)}`
        : `Staff converted order to Pickup (delivery fee removed)`
      await recalcOrderTotals(supabase, id, logEntry)

      return id
    },
    onSuccess: (orderId) => {
      qc.invalidateQueries({ queryKey: keys.detail(orderId) })
      qc.invalidateQueries({ queryKey: keys.list() })
    },
  })
}
