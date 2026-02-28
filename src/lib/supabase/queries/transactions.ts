import { createClient } from '../client'

export interface Transaction {
  id: string
  transaction_number: string
  branch_id: string
  customer_id: string
  transaction_date: string
  transaction_type: 'sale' | 'return'
  delivery_type: 'pickup' | 'delivery'
  delivery_address: string | null
  delivery_phone: string | null
  subtotal: number
  discount_amount: number
  discount_percentage: number
  tax_amount: number
  total_amount: number
  payment_status: 'unpaid' | 'partial' | 'paid'
  amount_paid: number
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
  // Joined fields
  customer?: {
    id: string
    name: string
    phone: string | null
    customer_type: string
  }
  branch?: {
    id: string
    name: string
  }
  lines?: TransactionLine[]
  payments?: TransactionPayment[]
}

export interface TransactionLine {
  id: string
  transaction_id: string
  line_number: number
  product_id: string
  variant_id: string | null
  quantity: number
  uom_id: string
  unit_price: number
  cogs_per_unit: number
  discount_amount: number
  line_total: number
  line_profit: number
  notes: string | null
  // Joined fields
  product?: {
    id: string
    code: string
    name: string
  }
  variant?: {
    id: string
    name: string
  } | null
  uom?: {
    id: string
    name: string
    code: string
  }
}

export interface TransactionPayment {
  id: string
  transaction_id: string
  payment_method: 'cash' | 'gcash' | 'maya' | 'bank_transfer' | 'credit'
  amount: number
  reference_number: string | null
  payment_date: string
  notes: string | null
  created_by: string
}

export interface CartItem {
  product_id: string
  product_code: string
  product_name: string
  variant_id: string | null
  variant_name: string | null
  quantity: number
  uom_id: string
  uom_name: string
  unit_price: number
  cogs_per_unit: number
  discount_amount: number
  line_total: number
  available_stock: number
}

export interface TransactionInput {
  branch_id: string
  customer_id: string
  transaction_type?: 'sale' | 'return'
  delivery_type: 'pickup' | 'delivery'
  delivery_address?: string | null
  delivery_phone?: string | null
  discount_amount?: number
  discount_percentage?: number
  tax_amount?: number
  notes?: string | null
  transaction_date?: string | null
}

export interface TransactionLineInput {
  product_id: string
  variant_id?: string | null
  quantity: number
  uom_id: string
  unit_price: number
  cogs_per_unit: number
  discount_amount?: number
  notes?: string | null
}

export interface PaymentInput {
  payment_method: 'cash' | 'gcash' | 'maya' | 'bank_transfer' | 'credit'
  amount: number
  reference_number?: string | null
  notes?: string | null
}

export interface TransactionFilters {
  branch_id?: string
  customer_id?: string
  payment_status?: string
  transaction_type?: string
  date_from?: string
  date_to?: string
  search?: string
  page?: number
  limit?: number
}

// Generate transaction number
export async function generateTransactionNumber(): Promise<string> {
  const supabase = createClient()

  const { data, error } = await supabase.rpc('generate_transaction_number')

  if (error) {
    // Fallback: generate locally if RPC fails
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    return `TXN-${today}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
  }

  return data as string
}

// Get transactions with filters
export async function getTransactions(filters: TransactionFilters = {}) {
  const supabase = createClient()
  const { page = 1, limit = 20, ...rest } = filters
  const offset = (page - 1) * limit

  let query = supabase
    .from('transactions')
    .select(`
      *,
      customer:customers!customer_id(id, name, phone, customer_type),
      branch:branches!branch_id(id, name)
    `, { count: 'exact' })
    .eq('is_deleted', false)  // Explicitly filter out deleted transactions

  // Apply filters
  if (rest.branch_id) {
    query = query.eq('branch_id', rest.branch_id)
  }

  if (rest.customer_id) {
    query = query.eq('customer_id', rest.customer_id)
  }

  if (rest.payment_status) {
    query = query.eq('payment_status', rest.payment_status)
  }

  if (rest.transaction_type) {
    query = query.eq('transaction_type', rest.transaction_type)
  }

  if (rest.date_from) {
    query = query.gte('transaction_date', rest.date_from)
  }

  if (rest.date_to) {
    query = query.lte('transaction_date', rest.date_to)
  }

  if (rest.search) {
    query = query.or(`transaction_number.ilike.%${rest.search}%`)
  }

  // Pagination
  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) throw error

  return {
    transactions: data as Transaction[],
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit)
  }
}

// Get a single transaction with full details
export async function getTransaction(id: string) {
  const supabase = createClient()

  const { data: transaction, error: txnError } = await supabase
    .from('transactions')
    .select(`
      *,
      customer:customers!customer_id(id, name, phone, email, address, customer_type),
      branch:branches!branch_id(id, name)
    `)
    .eq('id', id)
    .eq('is_deleted', false)
    .single()

  if (txnError) throw txnError

  // Get lines
  const { data: lines, error: linesError } = await supabase
    .from('transaction_lines')
    .select(`
      *,
      product:products!product_id(id, code, name),
      variant:product_variants!variant_id(id, name),
      uom:units_of_measure!uom_id(id, name, code)
    `)
    .eq('transaction_id', id)
    .order('line_number')

  if (linesError) throw linesError

  // Get payments
  const { data: payments, error: paymentsError } = await supabase
    .from('transaction_payments')
    .select('*')
    .eq('transaction_id', id)
    .order('payment_date')

  if (paymentsError) throw paymentsError

  return {
    ...transaction,
    lines: lines || [],
    payments: payments || []
  } as Transaction
}

// Create a new transaction with lines
export async function createTransaction(
  input: TransactionInput,
  lines: TransactionLineInput[],
  payments: PaymentInput[],
  userId: string
) {
  const supabase = createClient()

  // Calculate totals
  const subtotal = lines.reduce((sum, line) => {
    const lineTotal = line.quantity * line.unit_price - (line.discount_amount || 0)
    return sum + lineTotal
  }, 0)

  const discountAmount = input.discount_amount || 0
  const taxAmount = input.tax_amount || 0
  const totalAmount = subtotal - discountAmount + taxAmount
  const amountPaid = payments.reduce((sum, p) => sum + p.amount, 0)

  // Determine payment status
  let paymentStatus: 'unpaid' | 'partial' | 'paid' = 'unpaid'
  if (amountPaid >= totalAmount) {
    paymentStatus = 'paid'
  } else if (amountPaid > 0) {
    paymentStatus = 'partial'
  }

  // Generate transaction number
  const transactionNumber = await generateTransactionNumber()

  // Create transaction
  const { data: transaction, error: txnError } = await supabase
    .from('transactions')
    .insert({
      transaction_number: transactionNumber,
      branch_id: input.branch_id,
      customer_id: input.customer_id,
      transaction_type: input.transaction_type || 'sale',
      delivery_type: input.delivery_type,
      delivery_address: input.delivery_address || null,
      delivery_phone: input.delivery_phone || null,
      subtotal: subtotal,
      discount_amount: discountAmount,
      discount_percentage: input.discount_percentage || 0,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      payment_status: paymentStatus,
      amount_paid: amountPaid,
      notes: input.notes || null,
      created_by: userId,
      ...(input.transaction_date ? { transaction_date: input.transaction_date } : {}),
    } as any)
    .select()
    .single()

  if (txnError) throw txnError

  const txn = transaction as any

  // Create transaction lines
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const { error: lineError } = await supabase
      .from('transaction_lines')
      .insert({
        transaction_id: txn.id,
        line_number: i + 1,
        product_id: line.product_id,
        variant_id: line.variant_id || null,
        quantity: line.quantity,
        uom_id: line.uom_id,
        unit_price: line.unit_price,
        cogs_per_unit: line.cogs_per_unit,
        discount_amount: line.discount_amount || 0,
        notes: line.notes || null
      } as any)

    if (lineError) throw lineError
  }

  // Create payments
  for (const payment of payments) {
    const { error: paymentError } = await supabase
      .from('transaction_payments')
      .insert({
        transaction_id: txn.id,
        payment_method: payment.payment_method,
        amount: payment.amount,
        reference_number: payment.reference_number || null,
        notes: payment.notes || null,
        created_by: userId
      } as any)

    if (paymentError) throw paymentError
  }

  // Update inventory (the trigger should handle this, but let's do it manually for safety)
  for (const line of lines) {
    await updateInventoryForSale(
      input.branch_id,
      line.product_id,
      line.variant_id || null,
      line.quantity,
      txn.id,
      userId,
      line.uom_id
    )
  }

  // Update customer balance if credit payment
  const creditPayment = payments.find(p => p.payment_method === 'credit')
  if (creditPayment) {
    await updateCustomerBalance(input.customer_id, creditPayment.amount)
  }

  return getTransaction(txn.id)
}

// Add payment to existing transaction
export async function addPaymentToTransaction(
  transactionId: string,
  payment: PaymentInput,
  userId: string
) {
  const supabase = createClient()

  // Get current transaction
  const { data: transaction, error: txnError } = await supabase
    .from('transactions')
    .select('total_amount, amount_paid, customer_id')
    .eq('id', transactionId)
    .eq('is_deleted', false)
    .single()

  if (txnError) throw txnError

  const txn = transaction as any
  const newAmountPaid = txn.amount_paid + payment.amount

  // Create payment record
  const { error: paymentError } = await supabase
    .from('transaction_payments')
    .insert({
      transaction_id: transactionId,
      payment_method: payment.payment_method,
      amount: payment.amount,
      reference_number: payment.reference_number || null,
      notes: payment.notes || null,
      created_by: userId
    } as any)

  if (paymentError) throw paymentError

  // Update transaction payment status
  let paymentStatus: 'unpaid' | 'partial' | 'paid' = 'partial'
  if (newAmountPaid >= txn.total_amount) {
    paymentStatus = 'paid'
  }

  const { error: updateError } = await supabase
    .from('transactions')
    .update({
      amount_paid: newAmountPaid,
      payment_status: paymentStatus
    } as any)
    .eq('id', transactionId)

  if (updateError) throw updateError

  // Update customer balance if credit payment
  if (payment.payment_method === 'credit') {
    await updateCustomerBalance(txn.customer_id, payment.amount)
  }

  return getTransaction(transactionId)
}

// Helper: Update inventory after sale
async function updateInventoryForSale(
  branchId: string,
  productId: string,
  variantId: string | null,
  quantity: number,
  transactionId: string,
  userId: string,
  uomId: string
) {
  const supabase = createClient()

  // Get product's unit information for conversion
  const { data: product, error: prodError } = await supabase
    .from('products')
    .select('base_uom_id, selling_uom_id, conversion_factor')
    .eq('id', productId)
    .single()

  if (prodError) throw prodError

  const productData = product as any
  let baseUnitQty = quantity
  let conversionFactor = 1

  // If the UOM used is not the base unit, we need to convert
  if (uomId !== productData.base_uom_id) {
    // First check if it's a selling unit with its own conversion factor
    const { data: sellingUnit, error: suError } = await supabase
      .from('product_selling_units')
      .select('conversion_factor')
      .eq('product_id', productId)
      .eq('uom_id', uomId)
      .eq('is_active', true)
      .single()

    if (suError && suError.code !== 'PGRST116') throw suError

    if (sellingUnit) {
      // Use the selling unit's conversion factor
      conversionFactor = sellingUnit.conversion_factor
    } else if (uomId === productData.selling_uom_id && productData.conversion_factor > 0) {
      // Fall back to product's default conversion factor
      conversionFactor = productData.conversion_factor
    }

    // Convert to base units: quantity sold ÷ conversion factor
    // Example: Selling 20 sacks, where 20 sacks = 1 m³ → deduct 20 ÷ 20 = 1 m³
    baseUnitQty = quantity / conversionFactor
  }

  // Get current inventory
  let invQuery = supabase
    .from('branch_inventory')
    .select('id, quantity_on_hand')
    .eq('branch_id', branchId)
    .eq('product_id', productId)

  if (variantId) {
    invQuery = invQuery.eq('variant_id', variantId)
  } else {
    invQuery = invQuery.is('variant_id', null)
  }

  const { data: inventory, error: invError } = await invQuery.single()

  if (invError && invError.code !== 'PGRST116') throw invError

  const currentQty = (inventory as any)?.quantity_on_hand || 0
  const newQty = currentQty - baseUnitQty

  if (inventory) {
    // Update existing inventory (in base units)
    await supabase
      .from('branch_inventory')
      .update({
        quantity_on_hand: newQty,
        last_movement_at: new Date().toISOString()
      } as any)
      .eq('id', (inventory as any).id)
  } else {
    // Create inventory record with negative (shouldn't happen but handle it)
    await supabase
      .from('branch_inventory')
      .insert({
        branch_id: branchId,
        product_id: productId,
        variant_id: variantId,
        quantity_on_hand: -baseUnitQty,
        last_movement_at: new Date().toISOString()
      } as any)
  }

  // Record movement (in base units, with note if conversion happened)
  const notes =
    conversionFactor !== 1
      ? `Sold ${quantity} selling units (conversion: ${conversionFactor}), deducted ${baseUnitQty.toFixed(4)} base units`
      : null

  await supabase
    .from('inventory_movements')
    .insert({
      branch_id: branchId,
      product_id: productId,
      variant_id: variantId,
      movement_type: 'sale',
      quantity_change: -baseUnitQty,
      quantity_before: currentQty,
      quantity_after: newQty,
      reference_id: transactionId,
      reference_type: 'transaction',
      created_by: userId,
      notes: notes
    } as any)
}

// Helper: Update customer balance
async function updateCustomerBalance(customerId: string, amount: number) {
  const supabase = createClient()

  const { data: customer, error: custError } = await supabase
    .from('customers')
    .select('outstanding_balance')
    .eq('id', customerId)
    .single()

  if (custError) throw custError

  const currentBalance = (customer as any).outstanding_balance || 0
  const newBalance = currentBalance + amount

  await supabase
    .from('customers')
    .update({ outstanding_balance: newBalance } as any)
    .eq('id', customerId)
}

// Get today's transactions summary
export async function getTodaysSummary(branchId?: string) {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]

  let query = supabase
    .from('transactions')
    .select('total_amount, payment_status, transaction_type')
    .eq('is_deleted', false)  // Explicitly filter out deleted transactions
    .gte('transaction_date', `${today}T00:00:00`)
    .lte('transaction_date', `${today}T23:59:59`)

  if (branchId) {
    query = query.eq('branch_id', branchId)
  }

  const { data, error } = await query

  if (error) throw error

  const transactions = data as any[] || []
  const sales = transactions.filter(t => t.transaction_type === 'sale')
  const returns = transactions.filter(t => t.transaction_type === 'return')

  return {
    totalTransactions: transactions.length,
    totalSales: sales.reduce((sum, t) => sum + t.total_amount, 0),
    totalReturns: returns.reduce((sum, t) => sum + t.total_amount, 0),
    netSales: sales.reduce((sum, t) => sum + t.total_amount, 0) -
              returns.reduce((sum, t) => sum + t.total_amount, 0),
    paidTransactions: transactions.filter(t => t.payment_status === 'paid').length,
    unpaidTransactions: transactions.filter(t => t.payment_status === 'unpaid').length,
    partialTransactions: transactions.filter(t => t.payment_status === 'partial').length
  }
}

// Search products for POS
export async function searchProductsForPOS(query: string, branchId: string, limit = 20) {
  const supabase = createClient()

  // Get all products with their images
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select(`
      id,
      code,
      name,
      current_selling_price,
      latest_cogs,
      markup_percentage,
      base_uom_id,
      images:product_images(url, is_primary, sort_order)
    `)
    .eq('is_active', true)
    .or(`code.ilike.%${query}%,name.ilike.%${query}%`)
    .order('name')
    .limit(limit)

  if (productsError) throw productsError
  
  const uniqueProducts = products || []

  if (!uniqueProducts || uniqueProducts.length === 0) return []

  // Get UOM details for the products
  const uomIds = [...new Set(uniqueProducts.map(p => p.base_uom_id))]
  const { data: uoms, error: uomsError } = await supabase
    .from('units_of_measure')
    .select('id, name, code')
    .in('id', uomIds)

  if (uomsError) throw uomsError

  const uomMap = new Map((uoms || []).map(u => [u.id, u]))

  // Get inventory for these products
  const productIds = uniqueProducts.map(p => p.id)
  const { data: inventory, error: invError } = await supabase
    .from('branch_inventory')
    .select('product_id, variant_id, quantity_on_hand')
    .eq('branch_id', branchId)
    .in('product_id', productIds)

  if (invError) throw invError

  const inventoryMap = new Map(
    (inventory || []).map(inv => [
      `${inv.product_id}-${inv.variant_id || 'null'}`,
      inv.quantity_on_hand
    ])
  )

  return uniqueProducts.map(product => {
    const uom = uomMap.get(product.base_uom_id)
    // Get primary image or first image
    const images = (product as any).images || []
    const primaryImage = images.find((img: any) => img.is_primary)?.url || images[0]?.url || null
    
    return {
      id: product.id,
      code: product.code,
      name: product.name,
      unit_price: product.current_selling_price,
      cogs: product.latest_cogs,
      markup_percentage: product.markup_percentage ||
        (product.latest_cogs > 0
          ? ((product.current_selling_price / product.latest_cogs - 1) * 100)
          : 0),
      uom_id: product.base_uom_id,
      uom_name: uom?.name || '',
      uom_abbreviation: uom?.code || '', // Using 'code' from DB but naming as 'abbreviation' for backward compatibility
      available_stock: inventoryMap.get(`${product.id}-null`) || 0,
      image_url: primaryImage
    }
  })
}

// ============================================
// RETURNS & REFUNDS
// ============================================

export interface ReturnInput {
  original_transaction_id: string
  branch_id: string
  customer_id: string
  reason: string
  notes?: string | null
}

export interface ReturnLineInput {
  original_line_id: string
  product_id: string
  variant_id?: string | null
  quantity: number
  uom_id: string
  unit_price: number
  cogs_per_unit: number
  restock: boolean  // Whether to add back to inventory
  reason_code: 'defective' | 'wrong_item' | 'customer_changed_mind' | 'damaged' | 'other'
}

export interface RefundInput {
  refund_method: 'cash' | 'gcash' | 'maya' | 'bank_transfer' | 'store_credit'
  amount: number
  reference_number?: string | null
  notes?: string | null
}

export const RETURN_REASON_CODES = {
  defective: 'Defective Product',
  wrong_item: 'Wrong Item Delivered',
  customer_changed_mind: 'Customer Changed Mind',
  damaged: 'Product Damaged',
  other: 'Other'
} as const

// Create return transaction linked to original sale
export async function createReturnTransaction(
  input: ReturnInput,
  lines: ReturnLineInput[],
  refund: RefundInput,
  userId: string
) {
  const supabase = createClient()

  // Get original transaction
  const { data: originalTxn, error: origError } = await supabase
    .from('transactions')
    .select('id, transaction_number, customer_id')
    .eq('id', input.original_transaction_id)
    .eq('is_deleted', false)
    .single()

  if (origError) throw origError

  // Calculate totals
  const subtotal = lines.reduce((sum, line) => {
    return sum + (line.quantity * line.unit_price)
  }, 0)

  const totalAmount = subtotal

  // Generate return transaction number
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const returnNumber = `RTN-${today}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`

  // Create return transaction
  const { data: returnTxn, error: txnError } = await supabase
    .from('transactions')
    .insert({
      transaction_number: returnNumber,
      branch_id: input.branch_id,
      customer_id: input.customer_id,
      transaction_type: 'return',
      delivery_type: 'pickup',
      subtotal: subtotal,
      discount_amount: 0,
      discount_percentage: 0,
      tax_amount: 0,
      total_amount: totalAmount,
      payment_status: 'paid',
      amount_paid: refund.amount,
      notes: `Return for ${(originalTxn as any).transaction_number}. Reason: ${input.reason}${input.notes ? `. ${input.notes}` : ''}`,
      created_by: userId
    } as any)
    .select()
    .single()

  if (txnError) throw txnError

  const returnTransaction = returnTxn as any

  // Create return lines
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const { error: lineError } = await supabase
      .from('transaction_lines')
      .insert({
        transaction_id: returnTransaction.id,
        line_number: i + 1,
        product_id: line.product_id,
        variant_id: line.variant_id || null,
        quantity: line.quantity,
        uom_id: line.uom_id,
        unit_price: line.unit_price,
        cogs_per_unit: line.cogs_per_unit,
        discount_amount: 0,
        notes: `Reason: ${RETURN_REASON_CODES[line.reason_code]}`
      } as any)

    if (lineError) throw lineError

    // Restock inventory if applicable
    if (line.restock) {
      await updateInventoryForReturn(
        input.branch_id,
        line.product_id,
        line.variant_id || null,
        line.quantity,
        returnTransaction.id,
        userId
      )
    }
  }

  // Record refund
  const { error: refundError } = await supabase
    .from('transaction_payments')
    .insert({
      transaction_id: returnTransaction.id,
      payment_method: refund.refund_method === 'store_credit' ? 'credit' : refund.refund_method,
      amount: -refund.amount, // Negative to indicate refund
      reference_number: refund.reference_number || null,
      notes: refund.notes || 'Refund',
      created_by: userId
    } as any)

  if (refundError) throw refundError

  // If original sale was on credit, reduce customer's outstanding balance
  const { data: originalPayments } = await supabase
    .from('transaction_payments')
    .select('payment_method, amount')
    .eq('transaction_id', input.original_transaction_id)

  const hadCreditPayment = (originalPayments as any[])?.some(p => p.payment_method === 'credit')

  if (hadCreditPayment) {
    // Reduce customer balance by refund amount
    await reduceCustomerBalance(input.customer_id, refund.amount)
  }

  return getTransaction(returnTransaction.id)
}

// Helper: Update inventory after return (restock)
async function updateInventoryForReturn(
  branchId: string,
  productId: string,
  variantId: string | null,
  quantity: number,
  transactionId: string,
  userId: string
) {
  const supabase = createClient()

  // Get current inventory
  let invQuery = supabase
    .from('branch_inventory')
    .select('id, quantity_on_hand')
    .eq('branch_id', branchId)
    .eq('product_id', productId)

  if (variantId) {
    invQuery = invQuery.eq('variant_id', variantId)
  } else {
    invQuery = invQuery.is('variant_id', null)
  }

  const { data: inventory, error: invError } = await invQuery.single()

  if (invError && invError.code !== 'PGRST116') throw invError

  const currentQty = (inventory as any)?.quantity_on_hand || 0
  const newQty = currentQty + quantity // Add back to inventory

  if (inventory) {
    // Update existing inventory
    await supabase
      .from('branch_inventory')
      .update({
        quantity_on_hand: newQty,
        last_movement_at: new Date().toISOString()
      } as any)
      .eq('id', (inventory as any).id)
  } else {
    // Create inventory record
    await supabase
      .from('branch_inventory')
      .insert({
        branch_id: branchId,
        product_id: productId,
        variant_id: variantId,
        quantity_on_hand: quantity,
        last_movement_at: new Date().toISOString()
      } as any)
  }

  // Record movement
  await supabase
    .from('inventory_movements')
    .insert({
      branch_id: branchId,
      product_id: productId,
      variant_id: variantId,
      movement_type: 'return',
      quantity_change: quantity, // Positive for return
      quantity_before: currentQty,
      quantity_after: newQty,
      reference_id: transactionId,
      reference_type: 'transaction',
      created_by: userId
    } as any)
}

// Helper: Reduce customer balance (for credit refunds)
async function reduceCustomerBalance(customerId: string, amount: number) {
  const supabase = createClient()

  const { data: customer, error: custError } = await supabase
    .from('customers')
    .select('outstanding_balance')
    .eq('id', customerId)
    .single()

  if (custError) throw custError

  const currentBalance = (customer as any).outstanding_balance || 0
  const newBalance = Math.max(0, currentBalance - amount) // Don't go negative

  await supabase
    .from('customers')
    .update({ outstanding_balance: newBalance } as any)
    .eq('id', customerId)
}

// Get returns for a specific transaction
export async function getReturnsForTransaction(originalTransactionId: string) {
  const supabase = createClient()

  const { data: originalTxn, error: origError } = await supabase
    .from('transactions')
    .select('transaction_number')
    .eq('id', originalTransactionId)
    .eq('is_deleted', false)
    .single()

  if (origError) throw origError

  const { data, error } = await supabase
    .from('transactions')
    .select(`
      *,
      customer:customers!customer_id(id, name, phone),
      lines:transaction_lines(
        *,
        product:products!product_id(id, code, name),
        uom:units_of_measure!uom_id(id, name, code)
      ),
      payments:transaction_payments(*)
    `)
    .eq('transaction_type', 'return')
    .eq('is_deleted', false)
    .ilike('notes', `%${(originalTxn as any).transaction_number}%`)
    .order('created_at', { ascending: false })

  if (error) throw error

  return data as Transaction[]
}

// Get all returns with filters
export async function getReturns(filters: TransactionFilters = {}) {
  return getTransactions({
    ...filters,
    transaction_type: 'return'
  })
}

// ============================================
// SOFT DELETE TRANSACTION
// ============================================

export async function softDeleteTransaction(transactionId: string, userId: string) {
  const supabase = createClient()

  // Update transaction to mark as deleted
  const { error } = await supabase
    .from('transactions')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: userId
    } as any)
    .eq('id', transactionId)

  if (error) throw error

  return { success: true }
}

// ============================================
// AR AGING REPORT
// ============================================

export interface ARAgingCustomer {
  customer_id: string
  customer_name: string
  customer_phone: string | null
  customer_type: string
  credit_limit: number
  total_outstanding: number
  current: number      // 0-30 days
  days_31_60: number   // 31-60 days
  days_61_90: number   // 61-90 days
  over_90: number      // 90+ days
  oldest_invoice_date: string | null
  transaction_count: number
}

export interface ARAgingSummary {
  total_outstanding: number
  current: number
  days_31_60: number
  days_61_90: number
  over_90: number
  customer_count: number
}

export interface ARTransaction {
  id: string
  transaction_number: string
  transaction_date: string
  total_amount: number
  amount_paid: number
  balance_due: number
  days_overdue: number
  customer: {
    id: string
    name: string
    phone: string | null
  }
}

// Get AR aging report by customer
export async function getARAgingByCustomer(): Promise<{
  customers: ARAgingCustomer[]
  summary: ARAgingSummary
}> {
  const supabase = createClient()

  // Get all transactions with unpaid/partial credit payments
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select(`
      id,
      transaction_number,
      transaction_date,
      total_amount,
      amount_paid,
      payment_status,
      customer_id,
      customer:customers!customer_id(id, name, phone, customer_type, credit_limit, outstanding_balance),
      payments:transaction_payments(payment_method, amount)
    `)
    .eq('transaction_type', 'sale')
    .eq('is_deleted', false)
    .in('payment_status', ['unpaid', 'partial'])
    .order('transaction_date', { ascending: true })

  if (error) throw error

  // Filter to only transactions that have credit payments
  const creditTransactions = (transactions as any[]).filter(txn => {
    const hasCreditPayment = txn.payments?.some((p: any) => p.payment_method === 'credit')
    const hasBalance = txn.total_amount > txn.amount_paid
    return hasCreditPayment || hasBalance
  })

  const today = new Date()
  const customerMap = new Map<string, ARAgingCustomer>()

  for (const txn of creditTransactions) {
    const txnDate = new Date(txn.transaction_date)
    const daysDiff = Math.floor((today.getTime() - txnDate.getTime()) / (1000 * 60 * 60 * 24))
    const balanceDue = txn.total_amount - txn.amount_paid

    if (balanceDue <= 0) continue

    const customerId = txn.customer_id
    const customer = txn.customer

    if (!customerMap.has(customerId)) {
      customerMap.set(customerId, {
        customer_id: customerId,
        customer_name: customer?.name || 'Unknown',
        customer_phone: customer?.phone || null,
        customer_type: customer?.customer_type || 'cash',
        credit_limit: customer?.credit_limit || 0,
        total_outstanding: 0,
        current: 0,
        days_31_60: 0,
        days_61_90: 0,
        over_90: 0,
        oldest_invoice_date: txn.transaction_date,
        transaction_count: 0
      })
    }

    const entry = customerMap.get(customerId)!
    entry.total_outstanding += balanceDue
    entry.transaction_count++

    // Update oldest invoice date
    if (txn.transaction_date < entry.oldest_invoice_date!) {
      entry.oldest_invoice_date = txn.transaction_date
    }

    // Categorize by age
    if (daysDiff <= 30) {
      entry.current += balanceDue
    } else if (daysDiff <= 60) {
      entry.days_31_60 += balanceDue
    } else if (daysDiff <= 90) {
      entry.days_61_90 += balanceDue
    } else {
      entry.over_90 += balanceDue
    }
  }

  const customers = Array.from(customerMap.values())
    .sort((a, b) => b.total_outstanding - a.total_outstanding)

  const summary: ARAgingSummary = {
    total_outstanding: customers.reduce((sum, c) => sum + c.total_outstanding, 0),
    current: customers.reduce((sum, c) => sum + c.current, 0),
    days_31_60: customers.reduce((sum, c) => sum + c.days_31_60, 0),
    days_61_90: customers.reduce((sum, c) => sum + c.days_61_90, 0),
    over_90: customers.reduce((sum, c) => sum + c.over_90, 0),
    customer_count: customers.length
  }

  return { customers, summary }
}

// Get AR transactions for a specific customer
export async function getARTransactionsForCustomer(customerId: string): Promise<ARTransaction[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('transactions')
    .select(`
      id,
      transaction_number,
      transaction_date,
      total_amount,
      amount_paid,
      customer:customers!customer_id(id, name, phone)
    `)
    .eq('customer_id', customerId)
    .eq('transaction_type', 'sale')
    .eq('is_deleted', false)
    .in('payment_status', ['unpaid', 'partial'])
    .order('transaction_date', { ascending: true })

  if (error) throw error

  const today = new Date()

  return (data as any[]).map(txn => {
    const txnDate = new Date(txn.transaction_date)
    const daysDiff = Math.floor((today.getTime() - txnDate.getTime()) / (1000 * 60 * 60 * 24))

    return {
      id: txn.id,
      transaction_number: txn.transaction_number,
      transaction_date: txn.transaction_date,
      total_amount: txn.total_amount,
      amount_paid: txn.amount_paid,
      balance_due: txn.total_amount - txn.amount_paid,
      days_overdue: daysDiff,
      customer: txn.customer
    }
  }).filter(txn => txn.balance_due > 0)
}

// ============================================
// AR PAYMENT COLLECTION
// ============================================

export interface ARPaymentInput {
  transaction_id: string
  customer_id: string
  payment_method: 'cash' | 'gcash' | 'maya' | 'bank_transfer'
  amount: number
  reference_number?: string | null
  notes?: string | null
}

export async function recordARPayment(input: ARPaymentInput, userId: string) {
  const supabase = createClient()

  // Get current transaction
  const { data: transaction, error: txnError } = await supabase
    .from('transactions')
    .select('id, total_amount, amount_paid, customer_id')
    .eq('id', input.transaction_id)
    .eq('is_deleted', false)
    .single()

  if (txnError) throw txnError

  const txn = transaction as any
  const newAmountPaid = txn.amount_paid + input.amount

  // Determine new payment status
  let paymentStatus: 'unpaid' | 'partial' | 'paid' = 'partial'
  if (newAmountPaid >= txn.total_amount) {
    paymentStatus = 'paid'
  }

  // Create payment record
  const { error: paymentError } = await supabase
    .from('transaction_payments')
    .insert({
      transaction_id: input.transaction_id,
      payment_method: input.payment_method,
      amount: input.amount,
      reference_number: input.reference_number || null,
      notes: input.notes || 'AR Payment',
      created_by: userId
    } as any)

  if (paymentError) throw paymentError

  // Update transaction
  const { error: updateError } = await supabase
    .from('transactions')
    .update({
      amount_paid: newAmountPaid,
      payment_status: paymentStatus
    } as any)
    .eq('id', input.transaction_id)

  if (updateError) throw updateError

  // Reduce customer outstanding balance
  const { data: customer, error: custError } = await supabase
    .from('customers')
    .select('outstanding_balance')
    .eq('id', input.customer_id)
    .single()

  if (custError) throw custError

  const currentBalance = (customer as any).outstanding_balance || 0
  const newBalance = Math.max(0, currentBalance - input.amount)

  await supabase
    .from('customers')
    .update({ outstanding_balance: newBalance } as any)
    .eq('id', input.customer_id)

  return { success: true, newPaymentStatus: paymentStatus }
}
