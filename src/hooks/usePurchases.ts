'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getPurchaseOrders,
  getPurchaseOrder,
  createPurchaseOrder,
  updatePurchaseOrder,
  updatePOStatus,
  addPurchaseOrderLine,
  updatePurchaseOrderLine,
  deletePurchaseOrderLine,
  deletePurchaseOrder,
  receivePOLineItems,
  receiveAllPOLines,
  cancelPurchaseOrder,
  getPOStats,
  getProductPurchaseHistory,
} from '@/lib/supabase/queries/purchases'
import type { InsertTables, UpdateTables, POStatus } from '@/types/database'

// Get all purchase orders
export function usePurchaseOrders(params?: {
  search?: string
  supplierId?: string
  branchId?: string
  status?: POStatus
  page?: number
  limit?: number
}) {
  return useQuery({
    queryKey: ['purchase-orders', params],
    queryFn: () => getPurchaseOrders(params),
  })
}

// Get single purchase order with lines
export function usePurchaseOrder(id: string) {
  return useQuery({
    queryKey: ['purchase-order', id],
    queryFn: () => getPurchaseOrder(id),
    enabled: !!id,
  })
}

// Get PO stats
export function usePOStats(params?: { branchId?: string }) {
  return useQuery({
    queryKey: ['po-stats', params],
    queryFn: () => getPOStats(params),
  })
}

// Create purchase order mutation
export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      po,
      lines,
    }: {
      po: Omit<InsertTables<'purchase_orders'>, 'po_number'>
      lines: Omit<InsertTables<'purchase_order_lines'>, 'po_id'>[]
    }) => createPurchaseOrder(po, lines),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['po-stats'] })
    },
  })
}

// Update purchase order mutation
export function useUpdatePurchaseOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateTables<'purchase_orders'> }) =>
      updatePurchaseOrder(id, updates),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.id] })
    },
  })
}

// Update PO status mutation
export function useUpdatePOStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: POStatus }) =>
      updatePOStatus(id, status),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['po-stats'] })
    },
  })
}

// Add line to PO mutation
export function useAddPurchaseOrderLine() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      poId,
      line,
    }: {
      poId: string
      line: Omit<InsertTables<'purchase_order_lines'>, 'po_id' | 'line_number'>
    }) => addPurchaseOrderLine(poId, line),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.poId] })
    },
  })
}

// Update PO line mutation
export function useUpdatePurchaseOrderLine() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      lineId,
      updates,
      poId,
    }: {
      lineId: string
      updates: UpdateTables<'purchase_order_lines'>
      poId: string
    }) => updatePurchaseOrderLine(lineId, updates),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.poId] })
    },
  })
}

// Delete PO line mutation
export function useDeletePurchaseOrderLine() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ lineId, poId }: { lineId: string; poId: string }) =>
      deletePurchaseOrderLine(lineId, poId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.poId] })
    },
  })
}

// Receive PO line items mutation
export function useReceivePOLineItems() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      lineId,
      quantityReceived,
      userId,
      poId,
    }: {
      lineId: string
      quantityReceived: number
      userId: string
      poId: string
    }) => receivePOLineItems(lineId, quantityReceived, userId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.poId] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['po-stats'] })
      queryClient.invalidateQueries({ queryKey: ['branch-inventory'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] })
      queryClient.invalidateQueries({ queryKey: ['products'] }) // COGS updated; pricing reviewed in UI
    },
  })
}

// Receive all PO lines mutation
export function useReceiveAllPOLines() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ poId, userId, receiveDate }: { poId: string; userId: string; receiveDate?: string }) =>
      receiveAllPOLines(poId, userId, receiveDate),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.poId] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['po-stats'] })
      queryClient.invalidateQueries({ queryKey: ['branch-inventory'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })
}

// Cancel PO mutation
export function useCancelPurchaseOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => cancelPurchaseOrder(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', id] })
      queryClient.invalidateQueries({ queryKey: ['po-stats'] })
    },
  })
}

// Get purchase history for a specific product
export function useProductPurchaseHistory(productId: string) {
  return useQuery({
    queryKey: ['product-purchase-history', productId],
    queryFn: () => getProductPurchaseHistory(productId),
    enabled: !!productId,
  })
}

// Delete PO mutation (soft delete)
export function useDeletePurchaseOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) => deletePurchaseOrder(id, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['po-stats'] })
    },
  })
}
