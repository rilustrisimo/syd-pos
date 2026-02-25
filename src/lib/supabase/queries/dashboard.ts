import { createClient } from '../client'

// ============================================
// DASHBOARD QUERIES
// ============================================

export interface DashboardStats {
  todaySales: number
  todayTransactions: number
  monthSales: number
  monthTransactions: number
  unpaidTransactions: number
  lowStockCount: number
  totalProducts: number
  totalCustomers: number
  totalOutstanding: number
}

export interface SalesTrend {
  date: string
  sales: number
  transactions: number
}

export interface TopProduct {
  product_id: string
  product_name: string
  product_code: string
  quantity_sold: number
  total_revenue: number
}

export interface HourlySales {
  hour: number
  sales: number
  transactions: number
}

export interface LowStockItem {
  id: string
  code: string
  name: string
  quantity_on_hand: number
  reorder_point: number
  reorder_quantity: number
}

export interface RecentTransaction {
  id: string
  transaction_number: string
  customer_name: string
  total_amount: number
  payment_status: string
  created_at: string
}

// Get dashboard statistics
export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]

  // Get today's transactions
  const { data: todayTxns, error: todayError } = await supabase
    .from('transactions')
    .select('total_amount, payment_status')
    .eq('transaction_type', 'sale')
    .eq('is_deleted', false)
    .gte('transaction_date', `${today}T00:00:00`)
    .lte('transaction_date', `${today}T23:59:59`)

  if (todayError) throw todayError

  // Get this month's transactions
  const { data: monthTxns, error: monthError } = await supabase
    .from('transactions')
    .select('total_amount')
    .eq('transaction_type', 'sale')
    .eq('is_deleted', false)
    .gte('transaction_date', `${monthStart}T00:00:00`)

  if (monthError) throw monthError

  // Get low stock items count
  const { data: lowStock, error: lowStockError } = await supabase
    .from('branch_inventory')
    .select(`
      quantity_on_hand,
      product:products!product_id(reorder_point)
    `)

  if (lowStockError) throw lowStockError

  const lowStockCount = (lowStock as any[])?.filter(item => {
    const reorderPoint = item.product?.reorder_point || 10
    return item.quantity_on_hand <= reorderPoint
  }).length || 0

  // Get total products
  const { count: productCount } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)

  // Get total customers
  const { count: customerCount } = await supabase
    .from('customers')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)

  // Get total outstanding AR
  const { data: arData } = await supabase
    .from('customers')
    .select('outstanding_balance')
    .gt('outstanding_balance', 0)

  const totalOutstanding = (arData as any[])?.reduce((sum, c) => sum + (c.outstanding_balance || 0), 0) || 0

  const todayTransactions = todayTxns as any[] || []
  const monthTransactions = monthTxns as any[] || []

  return {
    todaySales: todayTransactions.reduce((sum, t) => sum + t.total_amount, 0),
    todayTransactions: todayTransactions.length,
    monthSales: monthTransactions.reduce((sum, t) => sum + t.total_amount, 0),
    monthTransactions: monthTransactions.length,
    unpaidTransactions: todayTransactions.filter(t => t.payment_status !== 'paid').length,
    lowStockCount,
    totalProducts: productCount || 0,
    totalCustomers: customerCount || 0,
    totalOutstanding
  }
}

// Get sales trend for the last N days
export async function getSalesTrend(days: number = 30): Promise<SalesTrend[]> {
  const supabase = createClient()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  const { data, error } = await supabase
    .from('transactions')
    .select('transaction_date, total_amount')
    .eq('transaction_type', 'sale')
    .eq('is_deleted', false)
    .gte('transaction_date', startDate.toISOString())
    .order('transaction_date', { ascending: true })

  if (error) throw error

  // Group by date
  const dateMap = new Map<string, { sales: number; transactions: number }>()

  // Initialize all dates with 0
  for (let i = 0; i <= days; i++) {
    const date = new Date()
    date.setDate(date.getDate() - (days - i))
    const dateStr = date.toISOString().split('T')[0]
    dateMap.set(dateStr, { sales: 0, transactions: 0 })
  }

  // Fill in actual data
  for (const txn of (data as any[]) || []) {
    const dateStr = txn.transaction_date.split('T')[0]
    const existing = dateMap.get(dateStr) || { sales: 0, transactions: 0 }
    dateMap.set(dateStr, {
      sales: existing.sales + txn.total_amount,
      transactions: existing.transactions + 1
    })
  }

  return Array.from(dateMap.entries()).map(([date, data]) => ({
    date,
    sales: data.sales,
    transactions: data.transactions
  }))
}

// Get top selling products for a date range
export async function getTopProducts(days: number = 7, limit: number = 10): Promise<TopProduct[]> {
  const supabase = createClient()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  const { data, error } = await supabase
    .from('transaction_lines')
    .select(`
      quantity,
      line_total,
      product:products!product_id(id, code, name),
      transaction:transactions!transaction_id(transaction_type, transaction_date, is_deleted)
    `)
    .gte('created_at', startDate.toISOString())

  if (error) throw error

  // Filter sales only and aggregate by product
  const productMap = new Map<string, TopProduct>()

  for (const line of (data as any[]) || []) {
    if (line.transaction?.transaction_type !== 'sale') continue
    if (line.transaction?.is_deleted) continue

    const productId = line.product?.id
    if (!productId) continue

    const existing = productMap.get(productId)
    if (existing) {
      existing.quantity_sold += line.quantity
      existing.total_revenue += line.line_total
    } else {
      productMap.set(productId, {
        product_id: productId,
        product_name: line.product.name,
        product_code: line.product.code,
        quantity_sold: line.quantity,
        total_revenue: line.line_total
      })
    }
  }

  return Array.from(productMap.values())
    .sort((a, b) => b.total_revenue - a.total_revenue)
    .slice(0, limit)
}

// Get hourly sales breakdown for today
export async function getHourlySales(): Promise<HourlySales[]> {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('transactions')
    .select('created_at, total_amount')
    .eq('transaction_type', 'sale')
    .eq('is_deleted', false)
    .gte('transaction_date', `${today}T00:00:00`)
    .lte('transaction_date', `${today}T23:59:59`)

  if (error) throw error

  // Initialize all hours
  const hourlyData: HourlySales[] = []
  for (let h = 0; h < 24; h++) {
    hourlyData.push({ hour: h, sales: 0, transactions: 0 })
  }

  // Fill in actual data
  for (const txn of (data as any[]) || []) {
    const hour = new Date(txn.created_at).getHours()
    hourlyData[hour].sales += txn.total_amount
    hourlyData[hour].transactions += 1
  }

  // Return only business hours (6am - 10pm)
  return hourlyData.filter(h => h.hour >= 6 && h.hour <= 22)
}

// Get low stock items
export async function getLowStockItems(limit: number = 10): Promise<LowStockItem[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('branch_inventory')
    .select(`
      quantity_on_hand,
      product:products!product_id(id, code, name, reorder_point, reorder_quantity)
    `)
    .order('quantity_on_hand', { ascending: true })
    .limit(50)

  if (error) throw error

  return (data as any[])
    .filter(item => {
      const reorderPoint = item.product?.reorder_point || 10
      return item.quantity_on_hand <= reorderPoint
    })
    .slice(0, limit)
    .map(item => ({
      id: item.product.id,
      code: item.product.code,
      name: item.product.name,
      quantity_on_hand: item.quantity_on_hand,
      reorder_point: item.product.reorder_point || 10,
      reorder_quantity: item.product.reorder_quantity || 50
    }))
}

// ============================================
// SALES REPORTS
// ============================================

export interface SalesByProduct {
  product_id: string
  product_code: string
  product_name: string
  category_name: string
  quantity_sold: number
  total_revenue: number
  total_cost: number
  gross_profit: number
  profit_margin: number
}

export interface SalesByCategory {
  category_id: string
  category_name: string
  product_count: number
  quantity_sold: number
  total_revenue: number
  total_cost: number
  gross_profit: number
  profit_margin: number
}

export interface SalesReportFilters {
  date_from?: string
  date_to?: string
  branch_id?: string
  category_id?: string
}

// Get sales by product report
export async function getSalesByProduct(filters: SalesReportFilters = {}): Promise<SalesByProduct[]> {
  const supabase = createClient()

  let query = supabase
    .from('transaction_lines')
    .select(`
      quantity,
      unit_price,
      cogs_per_unit,
      line_total,
      line_profit,
      product:products!product_id(
        id,
        code,
        name,
        category:product_categories!category_id(id, name)
      ),
      transaction:transactions!transaction_id(
        transaction_type,
        transaction_date,
        branch_id,
        is_deleted
      )
    `)

  const { data, error } = await query

  if (error) throw error

  // Filter and aggregate
  const productMap = new Map<string, SalesByProduct>()

  for (const line of (data as any[]) || []) {
    // Filter by transaction type
    if (line.transaction?.transaction_type !== 'sale') continue
    if (line.transaction?.is_deleted) continue

    // Filter by date range
    if (filters.date_from && line.transaction.transaction_date < filters.date_from) continue
    if (filters.date_to && line.transaction.transaction_date > filters.date_to + 'T23:59:59') continue

    // Filter by branch
    if (filters.branch_id && line.transaction.branch_id !== filters.branch_id) continue

    // Filter by category
    if (filters.category_id && line.product?.category?.id !== filters.category_id) continue

    const productId = line.product?.id
    if (!productId) continue

    const revenue = line.quantity * line.unit_price
    const cost = line.quantity * line.cogs_per_unit

    const existing = productMap.get(productId)
    if (existing) {
      existing.quantity_sold += line.quantity
      existing.total_revenue += revenue
      existing.total_cost += cost
      existing.gross_profit += revenue - cost
    } else {
      productMap.set(productId, {
        product_id: productId,
        product_code: line.product.code,
        product_name: line.product.name,
        category_name: line.product.category?.name || 'Uncategorized',
        quantity_sold: line.quantity,
        total_revenue: revenue,
        total_cost: cost,
        gross_profit: revenue - cost,
        profit_margin: 0
      })
    }
  }

  // Calculate profit margins
  const products = Array.from(productMap.values()).map(p => ({
    ...p,
    profit_margin: p.total_revenue > 0 ? (p.gross_profit / p.total_revenue) * 100 : 0
  }))

  return products.sort((a, b) => b.total_revenue - a.total_revenue)
}

// Get sales by category report
export async function getSalesByCategory(filters: SalesReportFilters = {}): Promise<SalesByCategory[]> {
  const products = await getSalesByProduct(filters)

  const categoryMap = new Map<string, SalesByCategory>()

  for (const product of products) {
    const categoryName = product.category_name
    const existing = categoryMap.get(categoryName)

    if (existing) {
      existing.product_count++
      existing.quantity_sold += product.quantity_sold
      existing.total_revenue += product.total_revenue
      existing.total_cost += product.total_cost
      existing.gross_profit += product.gross_profit
    } else {
      categoryMap.set(categoryName, {
        category_id: categoryName,
        category_name: categoryName,
        product_count: 1,
        quantity_sold: product.quantity_sold,
        total_revenue: product.total_revenue,
        total_cost: product.total_cost,
        gross_profit: product.gross_profit,
        profit_margin: 0
      })
    }
  }

  // Calculate profit margins
  const categories = Array.from(categoryMap.values()).map(c => ({
    ...c,
    profit_margin: c.total_revenue > 0 ? (c.gross_profit / c.total_revenue) * 100 : 0
  }))

  return categories.sort((a, b) => b.total_revenue - a.total_revenue)
}

// ============================================
// SUPPLIER PURCHASE HISTORY
// ============================================

export interface SupplierHistoryFilters {
  date_from?: string
  date_to?: string
  supplier_id?: string
}

export interface SupplierHistorySummary {
  supplier_id: string
  supplier_name: string
  supplier_code: string
  total_orders: number
  total_spent: number
  avg_order_value: number
  last_order_date: string | null
  on_time_delivery_pct: number
}

export interface SupplierProductPurchase {
  supplier_id: string
  supplier_name: string
  product_id: string
  product_code: string
  product_name: string
  category_name: string
  total_quantity: number
  total_cost: number
  avg_unit_cost: number
  order_count: number
}

export async function getSupplierPurchaseHistory(filters: SupplierHistoryFilters = {}): Promise<{
  bySupplier: SupplierHistorySummary[]
  byProduct: SupplierProductPurchase[]
}> {
  const supabase = createClient()

  const { data: poData, error: poError } = await supabase
    .from('purchase_orders')
    .select(`
      id,
      po_date,
      total_amount,
      status,
      expected_delivery_date,
      actual_delivery_date,
      supplier:suppliers!supplier_id(id, code, name),
      lines:purchase_order_lines(
        quantity,
        unit_cost,
        total_cost,
        product:products!product_id(
          id,
          code,
          name,
          category:product_categories!category_id(name)
        )
      )
    `)
    .in('status', ['confirmed', 'partially_received', 'received'])
    .eq('is_deleted', false)

  if (poError) throw poError

  const orders = (poData as any[]) || []

  // Filter by date range
  const filtered = orders.filter(po => {
    if (filters.date_from && po.po_date < filters.date_from) return false
    if (filters.date_to && po.po_date > filters.date_to + 'T23:59:59') return false
    if (filters.supplier_id && po.supplier?.id !== filters.supplier_id) return false
    return true
  })

  // Aggregate by supplier
  const supplierMap = new Map<string, SupplierHistorySummary>()
  for (const po of filtered) {
    const supplierId = po.supplier?.id
    if (!supplierId) continue

    const existing = supplierMap.get(supplierId)
    const isOnTime = po.actual_delivery_date && po.expected_delivery_date
      ? po.actual_delivery_date <= po.expected_delivery_date
      : null

    if (existing) {
      existing.total_orders++
      existing.total_spent += po.total_amount || 0
      if (po.po_date > (existing.last_order_date || '')) {
        existing.last_order_date = po.po_date
      }
      if (isOnTime !== null) {
        // Track on-time as a running count (we'll convert to % after)
        ;(existing as any)._on_time_count += isOnTime ? 1 : 0
        ;(existing as any)._delivery_count += 1
      }
    } else {
      supplierMap.set(supplierId, {
        supplier_id: supplierId,
        supplier_name: po.supplier.name,
        supplier_code: po.supplier.code,
        total_orders: 1,
        total_spent: po.total_amount || 0,
        avg_order_value: 0,
        last_order_date: po.po_date,
        on_time_delivery_pct: 0,
        _on_time_count: isOnTime ? 1 : 0,
        _delivery_count: isOnTime !== null ? 1 : 0,
      } as any)
    }
  }

  const bySupplier = Array.from(supplierMap.values()).map(s => {
    const onTimeCount = (s as any)._on_time_count || 0
    const deliveryCount = (s as any)._delivery_count || 0
    delete (s as any)._on_time_count
    delete (s as any)._delivery_count
    return {
      ...s,
      avg_order_value: s.total_orders > 0 ? s.total_spent / s.total_orders : 0,
      on_time_delivery_pct: deliveryCount > 0 ? (onTimeCount / deliveryCount) * 100 : 0,
    }
  }).sort((a, b) => b.total_spent - a.total_spent)

  // Aggregate by product across suppliers
  const productKey = (supplierId: string, productId: string) => `${supplierId}__${productId}`
  const productMap = new Map<string, SupplierProductPurchase>()

  for (const po of filtered) {
    const supplierId = po.supplier?.id
    if (!supplierId) continue

    for (const line of po.lines || []) {
      const productId = line.product?.id
      if (!productId) continue

      const key = productKey(supplierId, productId)
      const existing = productMap.get(key)

      if (existing) {
        existing.total_quantity += line.quantity || 0
        existing.total_cost += line.total_cost || 0
        existing.order_count++
      } else {
        productMap.set(key, {
          supplier_id: supplierId,
          supplier_name: po.supplier.name,
          product_id: productId,
          product_code: line.product.code,
          product_name: line.product.name,
          category_name: line.product.category?.name || 'Uncategorized',
          total_quantity: line.quantity || 0,
          total_cost: line.total_cost || 0,
          avg_unit_cost: 0,
          order_count: 1,
        })
      }
    }
  }

  const byProduct = Array.from(productMap.values())
    .map(p => ({
      ...p,
      avg_unit_cost: p.total_quantity > 0 ? p.total_cost / p.total_quantity : 0,
    }))
    .sort((a, b) => b.total_cost - a.total_cost)

  return { bySupplier, byProduct }
}

// ============================================
// DEMAND FORECAST & REORDER SUGGESTIONS
// ============================================

export interface DemandForecastFilters {
  analysis_days?: number
  category_id?: string
  branch_id?: string
}

export interface DemandForecastItem {
  product_id: string
  product_code: string
  product_name: string
  category_name: string
  current_stock: number
  reorder_point: number
  reorder_quantity: number
  avg_daily_sales_7d: number
  avg_daily_sales_30d: number
  avg_daily_sales_90d: number
  trend: 'up' | 'down' | 'flat'
  days_to_stockout: number
  suggested_reorder_qty: number
  estimated_reorder_cost: number
  urgency: 'critical' | 'soon' | 'ok'
  latest_cogs: number
}

export async function getDemandForecast(filters: DemandForecastFilters = {}): Promise<DemandForecastItem[]> {
  const supabase = createClient()

  // Get all active products with current inventory
  const { data: products, error: prodError } = await supabase
    .from('products')
    .select(`
      id,
      code,
      name,
      reorder_point,
      reorder_quantity,
      latest_cogs,
      category:product_categories!category_id(id, name)
    `)
    .eq('is_active', true)

  if (prodError) throw prodError

  // Get inventory levels
  const { data: inventory, error: invError } = await supabase
    .from('branch_inventory')
    .select('product_id, quantity_on_hand, branch_id')

  if (invError) throw invError

  // Get sales data for the last 90 days
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const { data: salesData, error: salesError } = await supabase
    .from('transaction_lines')
    .select(`
      product_id,
      quantity,
      created_at,
      transaction:transactions!transaction_id(
        transaction_type,
        transaction_date,
        branch_id,
        is_deleted
      )
    `)
    .gte('created_at', ninetyDaysAgo.toISOString())

  if (salesError) throw salesError

  // Build inventory map (sum across branches or filter by branch)
  const inventoryMap = new Map<string, number>()
  for (const inv of (inventory as any[]) || []) {
    if (filters.branch_id && inv.branch_id !== filters.branch_id) continue
    const current = inventoryMap.get(inv.product_id) || 0
    inventoryMap.set(inv.product_id, current + inv.quantity_on_hand)
  }

  // Build sales velocity per product
  const now = new Date()
  const salesMap = new Map<string, { last7: number; last30: number; last90: number }>()

  for (const line of (salesData as any[]) || []) {
    if (line.transaction?.transaction_type !== 'sale') continue
    if (line.transaction?.is_deleted) continue
    if (filters.branch_id && line.transaction.branch_id !== filters.branch_id) continue

    const productId = line.product_id
    const saleDate = new Date(line.transaction.transaction_date)
    const daysAgo = Math.floor((now.getTime() - saleDate.getTime()) / (1000 * 60 * 60 * 24))

    const existing = salesMap.get(productId) || { last7: 0, last30: 0, last90: 0 }
    if (daysAgo <= 7) existing.last7 += line.quantity
    if (daysAgo <= 30) existing.last30 += line.quantity
    existing.last90 += line.quantity
    salesMap.set(productId, existing)
  }

  // Build forecast items
  const items: DemandForecastItem[] = []

  for (const product of (products as any[]) || []) {
    if (filters.category_id && product.category?.id !== filters.category_id) continue

    const currentStock = inventoryMap.get(product.id) || 0
    const sales = salesMap.get(product.id) || { last7: 0, last30: 0, last90: 0 }

    const avgDaily7 = sales.last7 / 7
    const avgDaily30 = sales.last30 / 30
    const avgDaily90 = sales.last90 / 90

    // Determine trend by comparing 7-day vs 30-day average
    let trend: 'up' | 'down' | 'flat' = 'flat'
    if (avgDaily30 > 0) {
      const ratio = avgDaily7 / avgDaily30
      if (ratio > 1.15) trend = 'up'
      else if (ratio < 0.85) trend = 'down'
    }

    // Use 30-day average for stockout projection (most balanced)
    const projectionRate = avgDaily30 > 0 ? avgDaily30 : avgDaily90
    const daysToStockout = projectionRate > 0 ? currentStock / projectionRate : 999

    // Suggested reorder: cover 30 days of demand, minimum the product's reorder_quantity
    const suggestedQty = Math.max(
      Math.ceil(projectionRate * 30),
      product.reorder_quantity || 0
    )

    const estimatedCost = suggestedQty * (product.latest_cogs || 0)

    // Urgency classification
    let urgency: 'critical' | 'soon' | 'ok' = 'ok'
    if (currentStock <= 0 || daysToStockout <= 7) urgency = 'critical'
    else if (daysToStockout <= 14 || currentStock <= (product.reorder_point || 0)) urgency = 'soon'

    items.push({
      product_id: product.id,
      product_code: product.code,
      product_name: product.name,
      category_name: product.category?.name || 'Uncategorized',
      current_stock: currentStock,
      reorder_point: product.reorder_point || 0,
      reorder_quantity: product.reorder_quantity || 0,
      avg_daily_sales_7d: avgDaily7,
      avg_daily_sales_30d: avgDaily30,
      avg_daily_sales_90d: avgDaily90,
      trend,
      days_to_stockout: Math.min(daysToStockout, 999),
      suggested_reorder_qty: suggestedQty,
      estimated_reorder_cost: estimatedCost,
      urgency,
      latest_cogs: product.latest_cogs || 0,
    })
  }

  return items.sort((a, b) => a.days_to_stockout - b.days_to_stockout)
}

// Get recent transactions
export async function getRecentTransactions(limit: number = 5): Promise<RecentTransaction[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('transactions')
    .select(`
      id,
      transaction_number,
      total_amount,
      payment_status,
      created_at,
      customer:customers!customer_id(name)
    `)
    .eq('transaction_type', 'sale')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  return (data as any[]).map(txn => ({
    id: txn.id,
    transaction_number: txn.transaction_number,
    customer_name: txn.customer?.name || 'Unknown',
    total_amount: txn.total_amount,
    payment_status: txn.payment_status,
    created_at: txn.created_at
  }))
}
