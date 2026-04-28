import { getClient } from '../client'
import type { Tables, InsertTables, UpdateTables, POStatus } from '@/types/database'

export type PurchaseOrder = Tables<'purchase_orders'> & {
  supplier?: Tables<'suppliers'>
  branch?: Tables<'branches'>
  created_by_user?: Tables<'users'>
  lines?: PurchaseOrderLine[]
}

export type PurchaseOrderLine = Tables<'purchase_order_lines'> & {
  product?: Tables<'products'> & {
    base_uom?: Tables<'units_of_measure'>
    category?: Tables<'product_categories'>
  }
  uom?: Tables<'units_of_measure'>
}

// Fetch all purchase orders
export async function getPurchaseOrders(params?: {
  search?: string
  supplierId?: string
  branchId?: string
  status?: POStatus
  page?: number
  limit?: number
}) {
  const supabase = getClient()
  const { search, supplierId, branchId, status, page = 1, limit = 20 } = params || {}
  const offset = (page - 1) * limit

  let query = supabase
    .from('purchase_orders')
    .select(`
      *,
      supplier:suppliers(id, code, name),
      branch:branches(id, code, name),
      created_by_user:users!purchase_orders_created_by_fkey(id, full_name)
    `, { count: 'exact' })
    .eq('is_deleted', false)
    .order('po_date', { ascending: false })
    .range(offset, offset + limit - 1)

  if (search) {
    query = query.ilike('po_number', `%${search}%`)
  }

  if (supplierId) {
    query = query.eq('supplier_id', supplierId)
  }

  if (branchId) {
    query = query.eq('branch_id', branchId)
  }

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error, count } = await query

  if (error) throw error

  return {
    data: data as PurchaseOrder[],
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  }
}

// Fetch single purchase order with lines
export async function getPurchaseOrder(id: string) {
  const supabase = getClient()

  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      supplier:suppliers(*),
      branch:branches(*),
      created_by_user:users!purchase_orders_created_by_fkey(id, full_name, email)
    `)
    .eq('id', id)
    .single()

  if (poError) throw poError

  const { data: lines, error: linesError } = await supabase
    .from('purchase_order_lines')
    .select(`
      *,
      product:products(
        id, code, name, latest_cogs, markup_percentage, current_selling_price,
        base_uom_id, selling_uom_id, conversion_factor,
        base_uom:units_of_measure!products_base_uom_id_fkey(id, code, name),
        category:product_categories(id, name)
      ),
      uom:units_of_measure(id, code, name)
    `)
    .eq('po_id', id)
    .order('line_number')

  if (linesError) throw linesError

  return {
    ...(po as any),
    lines: lines || [],
  } as PurchaseOrder
}

// Generate PO number via database function
export async function generatePONumber() {
  const supabase = getClient()

  const { data, error } = await supabase.rpc('generate_po_number')

  if (error) throw error
  return data as string
}

// Create a new purchase order
export async function createPurchaseOrder(
  po: Omit<InsertTables<'purchase_orders'>, 'po_number'>,
  lines: Omit<InsertTables<'purchase_order_lines'>, 'po_id'>[]
) {
  const supabase = getClient()

  // Generate PO number
  const poNumber = await generatePONumber()

  // Create PO
  const merchandiseTotal = lines.reduce((sum, line) => sum + (line.quantity_ordered * line.unit_cost), 0)
  const deliveryCharge = Number((po as any).delivery_charge || 0)

  const { data: createdPO, error: poError } = await supabase
    .from('purchase_orders')
    .insert({
      ...po,
      po_number: poNumber,
      total_amount: merchandiseTotal + deliveryCharge,
    } as any)
    .select()
    .single()

  if (poError) throw poError

  // Create lines
  if (lines.length > 0) {
    const linesWithPoId = lines.map((line, index) => ({
      ...line,
      po_id: (createdPO as any).id,
      line_number: index + 1,
    }))

    const { error: linesError } = await supabase
      .from('purchase_order_lines')
      .insert(linesWithPoId as any)

    if (linesError) throw linesError
  }

  return createdPO
}

// Update purchase order
export async function updatePurchaseOrder(id: string, updates: UpdateTables<'purchase_orders'>) {
  const supabase = getClient()

  const { data, error } = await supabase
    .from('purchase_orders')
    .update(updates as any)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// Update PO status
export async function updatePOStatus(id: string, status: POStatus, actualDeliveryDate?: string) {
  const supabase = getClient()

  const updateData: any = { status }

  // Set actual delivery date when received
  if (status === 'received') {
    updateData.actual_delivery_date = actualDeliveryDate || new Date().toISOString().split('T')[0]
  }

  const { data, error } = await supabase
    .from('purchase_orders')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// Add line to purchase order
export async function addPurchaseOrderLine(
  poId: string,
  line: Omit<InsertTables<'purchase_order_lines'>, 'po_id' | 'line_number'>
) {
  const supabase = getClient()

  // Get next line number
  const { data: existingLines, error: countError } = await supabase
    .from('purchase_order_lines')
    .select('line_number')
    .eq('po_id', poId)
    .order('line_number', { ascending: false })
    .limit(1)

  if (countError) throw countError

  const nextLineNumber = existingLines && existingLines.length > 0
    ? (existingLines[0] as any).line_number + 1
    : 1

  const { data, error } = await supabase
    .from('purchase_order_lines')
    .insert({
      ...line,
      po_id: poId,
      line_number: nextLineNumber,
    } as any)
    .select()
    .single()

  if (error) throw error

  // Update PO total
  await updatePOTotal(poId)

  return data
}

// Update line in purchase order
export async function updatePurchaseOrderLine(
  lineId: string,
  updates: UpdateTables<'purchase_order_lines'>
) {
  const supabase = getClient()

  const { data, error } = await supabase
    .from('purchase_order_lines')
    .update(updates as any)
    .eq('id', lineId)
    .select('*, po_id')
    .single()

  if (error) throw error

  // Update PO total
  if ((data as any).po_id) {
    await updatePOTotal((data as any).po_id)
  }

  return data
}

// Delete line from purchase order
export async function deletePurchaseOrderLine(lineId: string, poId: string) {
  const supabase = getClient()

  const { error } = await supabase
    .from('purchase_order_lines')
    .delete()
    .eq('id', lineId)

  if (error) throw error

  // Update PO total
  await updatePOTotal(poId)
}

/**
 * Receive items for a PO line using atomic RPC
 * This prevents race conditions and ensures consistency
 */
export async function receivePOLineItems(
  lineId: string,
  quantityReceived: number,
  userId: string
) {
  const supabase = getClient()

  // Validate quantity
  if (quantityReceived <= 0) {
    throw new Error('Quantity received must be greater than zero')
  }

  // Get the line details first to get PO ID
  const { data: line, error: lineError } = await supabase
    .from('purchase_order_lines')
    .select('po_id, quantity_ordered, quantity_received')
    .eq('id', lineId)
    .single()

  if (lineError) throw lineError

  const lineData = line as any

  // Call atomic RPC — pass today as receive date (used only if this completes the PO)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
  const { data, error } = await supabase.rpc('receive_purchase_order_atomic', {
    p_po_id: lineData.po_id,
    p_received_lines: [
      {
        po_line_id: lineId,
        quantity_received: quantityReceived
      }
    ],
    p_user_id: userId,
    p_receive_date: today,
  })

  if (error) {
    // Check for specific error types
    if (error.message.includes('Cannot receive more than ordered')) {
      throw new Error(error.message)
    }
    throw error
  }

  return data
}

// Helper to update PO total amount (merchandise subtotal + delivery charge)
async function updatePOTotal(poId: string) {
  const supabase = getClient()

  const [{ data: lines, error: linesError }, { data: poData, error: poError }] = await Promise.all([
    supabase.from('purchase_order_lines').select('quantity_ordered, unit_cost').eq('po_id', poId),
    supabase.from('purchase_orders').select('delivery_charge').eq('id', poId).single(),
  ])

  if (linesError) throw linesError
  if (poError) throw poError

  const linesData = lines as any[] || []
  const deliveryCharge = Number((poData as any)?.delivery_charge || 0)
  const merchandiseTotal = linesData.reduce((sum: number, line: any) =>
    sum + (Number(line.quantity_ordered) * Number(line.unit_cost)), 0
  )

  await supabase
    .from('purchase_orders')
    .update({ total_amount: merchandiseTotal + deliveryCharge } as any)
    .eq('id', poId)
}

// Receive all remaining items for a PO using atomic RPC
export async function receiveAllPOLines(poId: string, userId: string, receiveDate?: string) {
  const supabase = getClient()

  // Get all lines with remaining quantities
  const { data: lines, error: linesError } = await supabase
    .from('purchase_order_lines')
    .select('id, quantity_ordered, quantity_received')
    .eq('po_id', poId)

  if (linesError) throw linesError

  const linesData = (lines as any[]) || []

  // Build array of lines to receive
  const linesToReceive = linesData
    .map(line => {
      const ordered = Number(line.quantity_ordered)
      const received = Number(line.quantity_received || 0)
      const remaining = ordered - received

      if (remaining <= 0) return null

      return {
        po_line_id: line.id,
        quantity_received: remaining
      }
    })
    .filter(line => line !== null)

  if (linesToReceive.length === 0) {
    throw new Error('No items remaining to receive')
  }

  // Call atomic RPC — pass the receive date so actual_delivery_date is stamped correctly
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
  const { data, error } = await supabase.rpc('receive_purchase_order_atomic', {
    p_po_id: poId,
    p_received_lines: linesToReceive,
    p_user_id: userId,
    p_receive_date: receiveDate || today,
  })

  if (error) throw error

  return data
}

// Cancel a purchase order
export async function cancelPurchaseOrder(id: string) {
  const supabase = getClient()

  // Check if PO has any received items
  const { data: lines } = await supabase
    .from('purchase_order_lines')
    .select('quantity_received')
    .eq('po_id', id)

  const hasReceivedItems = lines?.some(line => Number(line.quantity_received) > 0)
  if (hasReceivedItems) {
    throw new Error('Cannot cancel PO with received items')
  }

  const { data, error } = await supabase
    .from('purchase_orders')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// Soft-delete a purchase order (only if nothing was received)
export async function deletePurchaseOrder(id: string, userId: string) {
  const supabase = getClient()

  const { data: lines, error: linesError } = await supabase
    .from('purchase_order_lines')
    .select('quantity_received')
    .eq('po_id', id)

  if (linesError) throw linesError

  const hasReceivedItems = lines?.some(line => Number(line.quantity_received) > 0)
  if (hasReceivedItems) {
    throw new Error('Cannot delete a purchase order that has received items. Cancel it instead.')
  }

  const { error } = await supabase
    .from('purchase_orders')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: userId,
    } as any)
    .eq('id', id)

  if (error) throw error

  return { success: true }
}

// Get purchase history for a specific product
export async function getProductPurchaseHistory(productId: string) {
  const supabase = getClient()

  const { data, error } = await supabase
    .from('purchase_order_lines')
    .select(`
      id, quantity_ordered, quantity_received, unit_cost,
      uom:units_of_measure(id, code, name),
      purchase_order:purchase_orders!purchase_order_lines_po_id_fkey(
        id, po_number, po_date, status, delivery_charge, is_deleted,
        supplier:suppliers(id, code, name),
        branch:branches(id, code, name)
      )
    `)
    .eq('product_id', productId)

  if (error) throw error

  // Filter out soft-deleted POs and sort by PO date descending
  return (data || [])
    .filter((line: any) => !line.purchase_order?.is_deleted)
    .sort((a: any, b: any) => {
      const dateA = a.purchase_order?.po_date ?? ''
      const dateB = b.purchase_order?.po_date ?? ''
      return dateB.localeCompare(dateA)
    })
}

// ── Auto-Reorder: combine low stock alerts with historical supplier pricing ───

export interface SupplierPriceOption {
  supplier_id: string
  supplier_name: string
  best_unit_cost: number
  last_po_date: string
  is_cheapest: boolean
}

export interface ReorderSuggestion {
  product_id: string
  product_code: string
  product_name: string
  category: string
  branch_id: string
  branch_name: string
  quantity_on_hand: number
  reorder_point: number
  suggested_quantity: number
  base_uom: { id: string; code: string; name: string }
  suppliers: SupplierPriceOption[]
  selected_supplier_id: string
  no_history: boolean
}

export async function getAutoReorderSuggestions(branchId?: string): Promise<ReorderSuggestion[]> {
  const supabase = getClient()

  // Step 1: get low stock items (quantity_on_hand <= reorder_point)
  let inventoryQuery = supabase
    .from('branch_inventory')
    .select(`
      quantity_on_hand,
      branch_id,
      product_id,
      product:products(
        id, code, name, reorder_point, reorder_quantity, is_active,
        category:product_categories(name),
        base_uom:units_of_measure!products_base_uom_id_fkey(id, code, name)
      ),
      branch:branches(id, name)
    `)

  if (branchId) inventoryQuery = inventoryQuery.eq('branch_id', branchId)

  const { data: inventoryData, error: invError } = await inventoryQuery
  if (invError) throw invError

  const lowStockItems = (inventoryData || []).filter((item: any) =>
    item.product && Number(item.quantity_on_hand) <= Number(item.product.reorder_point ?? 0)
  )

  if (lowStockItems.length === 0) return []

  const productIds = [...new Set(lowStockItems.map((i: any) => i.product_id))]

  // Step 2: get all received PO lines for those products
  const { data: poLines, error: poError } = await supabase
    .from('purchase_order_lines')
    .select(`
      product_id,
      unit_cost,
      uom:units_of_measure(id, code, name),
      purchase_order:purchase_orders!purchase_order_lines_po_id_fkey(
        po_date, status, is_deleted,
        supplier:suppliers(id, name)
      )
    `)
    .in('product_id', productIds)

  if (poError) throw poError

  // Filter to only received/partially_received, non-deleted POs
  const validLines = (poLines || []).filter((line: any) =>
    !line.purchase_order?.is_deleted &&
    ['received', 'partially_received'].includes(line.purchase_order?.status)
  )

  // Step 3: build per-product supplier price map
  const supplierMap: Record<string, Record<string, { best_unit_cost: number; last_po_date: string; supplier_name: string }>> = {}

  for (const line of validLines) {
    const pid = (line as any).product_id
    const po = (line as any).purchase_order
    // Supabase may return supplier as object or array depending on join type
    const supplierRaw = po?.supplier
    const supplier = Array.isArray(supplierRaw) ? supplierRaw[0] : supplierRaw
    if (!supplier || !pid) continue

    const sid = supplier.id
    const cost = Number((line as any).unit_cost)
    const date = po?.po_date ?? ''

    if (!supplierMap[pid]) supplierMap[pid] = {}

    const existing = supplierMap[pid][sid]
    if (!existing || cost < existing.best_unit_cost || (cost === existing.best_unit_cost && date > existing.last_po_date)) {
      supplierMap[pid][sid] = { best_unit_cost: cost, last_po_date: date, supplier_name: supplier.name }
    }
  }

  // Step 4: assemble suggestions
  return lowStockItems.map((item: any) => {
    const product = item.product
    const branch = item.branch
    const pid = item.product_id
    const priceOptions = supplierMap[pid] ?? {}

    const supplierList: SupplierPriceOption[] = Object.entries(priceOptions)
      .map(([sid, info]) => ({ supplier_id: sid, supplier_name: info.supplier_name, best_unit_cost: info.best_unit_cost, last_po_date: info.last_po_date, is_cheapest: false }))
      .sort((a, b) => a.best_unit_cost - b.best_unit_cost)

    if (supplierList.length > 0) supplierList[0].is_cheapest = true

    return {
      product_id: pid,
      product_code: product?.code ?? '',
      product_name: product?.name ?? '',
      category: product?.category?.name ?? 'Uncategorized',
      branch_id: item.branch_id,
      branch_name: branch?.name ?? '',
      quantity_on_hand: Number(item.quantity_on_hand),
      reorder_point: Number(product?.reorder_point ?? 0),
      suggested_quantity: Number(product?.reorder_quantity ?? 1),
      base_uom: product?.base_uom ?? { id: '', code: 'pc', name: 'Piece' },
      suppliers: supplierList,
      selected_supplier_id: supplierList[0]?.supplier_id ?? '',
      no_history: supplierList.length === 0,
    } as ReorderSuggestion
  })
}

// Get PO summary stats
export async function getPOStats(params?: { branchId?: string }) {
  const supabase = getClient()
  const { branchId } = params || {}

  let query = supabase.from('purchase_orders').select('status, total_amount').eq('is_deleted', false)

  if (branchId) {
    query = query.eq('branch_id', branchId)
  }

  const { data, error } = await query

  if (error) throw error

  const stats = {
    draft: 0,
    sent: 0,
    confirmed: 0,
    partiallyReceived: 0,
    received: 0,
    cancelled: 0,
    totalDraftValue: 0,
    totalPendingValue: 0,
  }

  data?.forEach(po => {
    switch (po.status) {
      case 'draft':
        stats.draft++
        stats.totalDraftValue += Number(po.total_amount)
        break
      case 'sent':
        stats.sent++
        stats.totalPendingValue += Number(po.total_amount)
        break
      case 'confirmed':
        stats.confirmed++
        stats.totalPendingValue += Number(po.total_amount)
        break
      case 'partially_received':
        stats.partiallyReceived++
        break
      case 'received':
        stats.received++
        break
      case 'cancelled':
        stats.cancelled++
        break
    }
  })

  return stats
}
