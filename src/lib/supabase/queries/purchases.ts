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

// Receive items for a PO line
export async function receivePOLineItems(
  lineId: string,
  quantityReceived: number,
  userId: string
) {
  const supabase = getClient()

  // Get the line details first
  const { data: line, error: lineError } = await supabase
    .from('purchase_order_lines')
    .select(`
      *,
      product:products(id, code, name),
      purchase_order:purchase_orders(id, branch_id, status)
    `)
    .eq('id', lineId)
    .single()

  if (lineError) throw lineError

  const lineData = line as any
  const newQuantityReceived = Number(lineData.quantity_received) + quantityReceived

  // Validate we're not receiving more than ordered
  if (newQuantityReceived > Number(lineData.quantity_ordered)) {
    throw new Error('Cannot receive more than ordered quantity')
  }

  // Update the line's quantity_received
  // This will trigger the database function to update product pricing
  const { error: updateError } = await supabase
    .from('purchase_order_lines')
    .update({ quantity_received: newQuantityReceived } as any)
    .eq('id', lineId)

  if (updateError) throw updateError

  // Update branch inventory
  const po = lineData.purchase_order as any
  await updateBranchInventory(po.branch_id, lineData.product_id, quantityReceived, userId, lineData.po_id)

  // Check if all lines are fully received and update PO status
  await checkAndUpdatePOStatus(lineData.po_id)

  return { success: true }
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

// Helper to update branch inventory after receiving
async function updateBranchInventory(
  branchId: string,
  productId: string,
  quantity: number,
  userId: string,
  poId: string
) {
  const supabase = getClient()

  // Check if inventory record exists
  const { data: existing } = await supabase
    .from('branch_inventory')
    .select('*')
    .eq('branch_id', branchId)
    .eq('product_id', productId)
    .maybeSingle()

  const existingData = existing as any
  const currentQuantity = existingData ? Number(existingData.quantity_on_hand) : 0
  const newQuantity = currentQuantity + quantity

  if (existingData) {
    // Update existing
    await supabase
      .from('branch_inventory')
      .update({
        quantity_on_hand: newQuantity,
        last_movement_at: new Date().toISOString(),
      } as any)
      .eq('id', existingData.id)
  } else {
    // Create new
    await supabase
      .from('branch_inventory')
      .insert({
        branch_id: branchId,
        product_id: productId,
        quantity_on_hand: newQuantity,
        quantity_reserved: 0,
        last_movement_at: new Date().toISOString(),
      } as any)
  }

  // Record movement
  await supabase
    .from('inventory_movements')
    .insert({
      branch_id: branchId,
      product_id: productId,
      movement_type: 'purchase',
      quantity_change: quantity,
      quantity_before: currentQuantity,
      quantity_after: newQuantity,
      reference_id: poId,
      reference_type: 'purchase_order',
      created_by: userId,
    } as any)
}

// Helper to check and update PO status based on received quantities
async function checkAndUpdatePOStatus(poId: string) {
  const supabase = getClient()

  const { data: lines, error } = await supabase
    .from('purchase_order_lines')
    .select('quantity_ordered, quantity_received')
    .eq('po_id', poId)

  if (error) throw error

  const linesData = lines as any[] || []
  if (linesData.length === 0) return

  const allFullyReceived = linesData.every(
    (line: any) => Number(line.quantity_received) >= Number(line.quantity_ordered)
  )
  const someReceived = linesData.some((line: any) => Number(line.quantity_received) > 0)

  let newStatus: POStatus
  if (allFullyReceived) {
    newStatus = 'received'
  } else if (someReceived) {
    newStatus = 'partially_received'
  } else {
    return // No status change needed
  }

  await updatePOStatus(poId, newStatus)
}

// Receive all remaining items for a PO
export async function receiveAllPOLines(poId: string, userId: string, receiveDate?: string) {
  const supabase = getClient()

  // Get all lines with remaining quantities
  const { data: lines, error: linesError } = await supabase
    .from('purchase_order_lines')
    .select(`
      *,
      product:products(id, code, name),
      purchase_order:purchase_orders(id, branch_id, status)
    `)
    .eq('po_id', poId)

  if (linesError) throw linesError

  const linesData = (lines as any[]) || []

  for (const line of linesData) {
    const ordered = Number(line.quantity_ordered)
    const received = Number(line.quantity_received)
    const remaining = ordered - received

    if (remaining <= 0) continue

    // Update line quantity_received (triggers DB pricing update)
    const { error: updateError } = await supabase
      .from('purchase_order_lines')
      .update({ quantity_received: ordered } as any)
      .eq('id', line.id)

    if (updateError) throw updateError

    // Update branch inventory
    const po = line.purchase_order as any
    await updateBranchInventory(po.branch_id, line.product_id, remaining, userId, poId)
  }

  // Set PO status to received with custom date
  await updatePOStatus(poId, 'received', receiveDate)

  return { success: true }
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
