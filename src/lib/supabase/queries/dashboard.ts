import { createClient } from '../client'
import { getTodayPH } from '@/lib/utils/datetime'

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
  const today = getTodayPH()
  // Month start: first day of current PH month
  const [y, m] = today.split('-').map(Number)
  const monthStart = `${y}-${String(m).padStart(2, '0')}-01`

  // Get today's transactions (sales + returns for net revenue)
  // Convert Philippine timezone dates to ISO UTC timestamps for proper filtering
  const todayStart = new Date(`${today}T00:00:00+08:00`).toISOString()
  const todayEnd = new Date(`${today}T23:59:59.999+08:00`).toISOString()
  
  const { data: todayTxns, error: todayError } = await supabase
    .from('transactions')
    .select('total_amount, payment_status, transaction_type')
    .in('transaction_type', ['sale', 'return'])
    .eq('is_deleted', false)
    .gte('transaction_date', todayStart)
    .lte('transaction_date', todayEnd)

  if (todayError) throw todayError

  // Get this month's transactions (sales + returns for net revenue)
  const monthStartTime = new Date(`${monthStart}T00:00:00+08:00`).toISOString()
  
  const { data: monthTxns, error: monthError } = await supabase
    .from('transactions')
    .select('total_amount, transaction_type')
    .in('transaction_type', ['sale', 'return'])
    .eq('is_deleted', false)
    .gte('transaction_date', monthStartTime)

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

  const netAmount = (txns: any[]) =>
    txns.reduce((sum, t) => sum + (t.transaction_type === 'return' ? -t.total_amount : t.total_amount), 0)

  return {
    todaySales: netAmount(todayTransactions),
    todayTransactions: todayTransactions.filter(t => t.transaction_type === 'sale').length,
    monthSales: netAmount(monthTransactions),
    monthTransactions: monthTransactions.filter(t => t.transaction_type === 'sale').length,
    unpaidTransactions: todayTransactions.filter(t => t.transaction_type === 'sale' && t.payment_status !== 'paid').length,
    lowStockCount,
    totalProducts: productCount || 0,
    totalCustomers: customerCount || 0,
    totalOutstanding
  }
}

// Get sales trend for the last N days
export async function getSalesTrend(days: number = 30): Promise<SalesTrend[]> {
  const supabase = createClient()
  const today = getTodayPH()
  const startDate = new Date(`${today}T00:00:00+08:00`)
  startDate.setDate(startDate.getDate() - days)

  const { data, error } = await supabase
    .from('transactions')
    .select('transaction_date, total_amount, transaction_type')
    .in('transaction_type', ['sale', 'return'])
    .eq('is_deleted', false)
    .gte('transaction_date', startDate.toISOString())
    .order('transaction_date', { ascending: true })

  if (error) throw error

  // Group by Philippine date (UTC+8)
  const dateMap = new Map<string, { sales: number; transactions: number }>()

  // Initialize all dates with 0 using PH timezone
  for (let i = 0; i <= days; i++) {
    const d = new Date(`${today}T00:00:00+08:00`)
    d.setDate(d.getDate() - (days - i))
    const dateStr = new Date(d.getTime() + (8 * 60 * 60 * 1000)).toISOString().split('T')[0]
    dateMap.set(dateStr, { sales: 0, transactions: 0 })
  }

  // Fill in actual data — deduct returns from their date bucket
  for (const txn of (data as any[]) || []) {
    const phDateStr = new Date(new Date(txn.transaction_date).getTime() + (8 * 60 * 60 * 1000)).toISOString().split('T')[0]
    const existing = dateMap.get(phDateStr) || { sales: 0, transactions: 0 }
    const amount = txn.transaction_type === 'return' ? -txn.total_amount : txn.total_amount
    dateMap.set(phDateStr, {
      sales: existing.sales + amount,
      transactions: existing.transactions + (txn.transaction_type === 'sale' ? 1 : 0)
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

  if (error) throw error

  // Filter sales only, by date range, and aggregate by product
  const productMap = new Map<string, TopProduct>()

  for (const line of (data as any[]) || []) {
    if (line.transaction?.transaction_type !== 'sale') continue
    if (line.transaction?.is_deleted) continue
    
    // Filter by transaction date
    const transactionDate = new Date(line.transaction.transaction_date)
    if (transactionDate < startDate) continue

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
  const today = getTodayPH()
  const todayStart = new Date(`${today}T00:00:00+08:00`).toISOString()
  const todayEnd = new Date(`${today}T23:59:59.999+08:00`).toISOString()

  const { data, error } = await supabase
    .from('transactions')
    .select('transaction_date, total_amount, transaction_type')
    .in('transaction_type', ['sale', 'return'])
    .eq('is_deleted', false)
    .gte('transaction_date', todayStart)
    .lte('transaction_date', todayEnd)

  if (error) throw error

  // Initialize all hours
  const hourlyData: HourlySales[] = []
  for (let h = 0; h < 24; h++) {
    hourlyData.push({ hour: h, sales: 0, transactions: 0 })
  }

  // Fill in actual data — use PH local hour, deduct returns
  for (const txn of (data as any[]) || []) {
    const phHour = new Date(new Date(txn.transaction_date).getTime() + (8 * 60 * 60 * 1000)).getUTCHours()
    const amount = txn.transaction_type === 'return' ? -txn.total_amount : txn.total_amount
    hourlyData[phHour].sales += amount
    if (txn.transaction_type === 'sale') hourlyData[phHour].transactions += 1
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

  const { data, error } = await supabase.rpc('get_sales_by_product_report', {
    p_date_from:   filters.date_from   ?? null,
    p_date_to:     filters.date_to     ?? null,
    p_category_id: filters.category_id ?? null,
  })

  if (error) throw error

  return ((data as any[]) || []).map(row => {
    const revenue = Number(row.total_revenue) || 0
    const cost    = Number(row.total_cost)    || 0
    const profit  = revenue - cost
    return {
      product_id:    row.product_id,
      product_code:  row.product_code,
      product_name:  row.product_name,
      category_name: row.category_name,
      quantity_sold: Number(row.quantity_sold) || 0,
      total_revenue: revenue,
      total_cost:    cost,
      gross_profit:  profit,
      profit_margin: revenue > 0 ? (profit / revenue) * 100 : 0,
    }
  })
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

// Get daily sales trend for an arbitrary date range (revenue + cost + profit per day)
export interface SalesTrendPoint {
  date: string
  revenue: number
  cost: number
  profit: number
  discounts: number
  transactions: number
}

export async function getSalesTrendByDateRange(
  dateFrom: string,
  dateTo: string
): Promise<SalesTrendPoint[]> {
  const supabase = createClient()

  const { data, error } = await supabase.rpc('get_sales_trend_daily', {
    p_date_from: dateFrom,
    p_date_to:   dateTo,
  })

  if (error) throw error

  // Pre-fill every day in range with zeros so the chart has continuous data
  const dateMap = new Map<string, SalesTrendPoint>()
  let current = dateFrom
  while (current <= dateTo) {
    dateMap.set(current, { date: current, revenue: 0, cost: 0, profit: 0, discounts: 0, transactions: 0 })
    const d = new Date(current + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + 1)
    current = d.toISOString().split('T')[0]
  }

  // Merge RPC results (only days that have activity)
  for (const row of (data as any[]) || []) {
    const phDate  = typeof row.ph_date === 'string' ? row.ph_date : String(row.ph_date)
    const revenue = Number(row.revenue)      || 0
    const cost    = Number(row.cost)         || 0
    dateMap.set(phDate, {
      date:         phDate,
      revenue,
      cost,
      profit:       revenue - cost,
      discounts:    Number(row.discounts)    || 0,
      transactions: Number(row.transactions) || 0,
    })
  }

  return Array.from(dateMap.values())
}

// Get fee summary for sales report
export interface SalesFeeSummary {
  total_delivery_fees: number
  total_other_fees: number
  total_fees: number
  total_discounts: number
  transactions_with_delivery_fee: number
  transactions_with_other_fees: number
  items_with_discount: number
}

export async function getSalesFeeSummary(filters: SalesReportFilters = {}): Promise<SalesFeeSummary> {
  const supabase = createClient()

  const { data, error } = await supabase.rpc('get_sales_fee_summary_report', {
    p_date_from:   filters.date_from   ?? null,
    p_date_to:     filters.date_to     ?? null,
    p_category_id: filters.category_id ?? null,
  })

  if (error) throw error

  const row = (data as any[])?.[0] ?? {}
  const deliveryFees = Number(row.total_delivery_fees) || 0
  const otherFees    = Number(row.total_other_fees)    || 0

  return {
    total_delivery_fees:            deliveryFees,
    total_other_fees:               otherFees,
    total_fees:                     deliveryFees + otherFees,
    total_discounts:                Number(row.total_discounts)                || 0,
    transactions_with_delivery_fee: Number(row.transactions_with_delivery_fee) || 0,
    transactions_with_other_fees:   Number(row.transactions_with_other_fees)   || 0,
    items_with_discount:            Number(row.items_with_discount)            || 0,
  }
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

// ============================================
// PROFIT & LOSS REPORT
// ============================================

export interface ExpenseByCategory {
  category_id: string | null
  category_name: string
  category_color: string
  total_amount: number
  count: number
}

export interface DailyPLPoint {
  date: string           // YYYY-MM-DD (PH date)
  revenue: number
  gross_profit: number
  expenses: number
  net_profit: number
  purchases: number
}

export interface PLReport {
  // Revenue / COGS from transactions
  revenue: number
  cogs: number
  gross_profit: number
  gross_margin: number   // %

  // Operating expenses
  total_expenses: number
  expenses_by_category: ExpenseByCategory[]

  // Net
  net_profit: number
  net_margin: number     // %

  // Cash flow additions
  total_purchases: number     // inventory cost from received POs in period
  total_collections: number   // cash actually collected from customers

  // Daily trend (for chart)
  daily_trend: DailyPLPoint[]
}

export async function getPLReport(dateFrom: string, dateTo: string): Promise<PLReport> {
  const supabase = createClient()

  // ── 1–4. Revenue/COGS, Expenses, Purchases, Collections via RPC ─────────────
  const [revResult, expResult, purchResult, collResult] = await Promise.all([
    supabase.rpc('get_pl_revenue_cogs_daily', { p_date_from: dateFrom, p_date_to: dateTo }),
    supabase.rpc('get_pl_expenses',           { p_date_from: dateFrom, p_date_to: dateTo }),
    supabase.rpc('get_pl_purchases_daily',    { p_date_from: dateFrom, p_date_to: dateTo }),
    supabase.rpc('get_pl_collections',        { p_date_from: dateFrom, p_date_to: dateTo }),
  ])
  if (revResult.error)  throw revResult.error
  if (expResult.error)  throw expResult.error
  if (purchResult.error) throw purchResult.error
  if (collResult.error)  throw collResult.error

  // Build daily revenue/COGS map from aggregated RPC rows
  const dailyRevenueMap = new Map<string, { revenue: number; gross_profit: number }>()
  let totalRevenue = 0
  let totalCogs = 0

  for (const row of (revResult.data as any[]) || []) {
    const rev  = Number(row.revenue) || 0
    const cogs = Number(row.cogs)    || 0
    const phDate = typeof row.ph_date === 'string' ? row.ph_date : String(row.ph_date)
    dailyRevenueMap.set(phDate, { revenue: rev, gross_profit: rev - cogs })
    totalRevenue += rev
    totalCogs    += cogs
  }

  // Build expense category map and daily expense map from aggregated RPC rows
  const categoryMap    = new Map<string, ExpenseByCategory>()
  const dailyExpenseMap = new Map<string, number>()
  let totalExpenses = 0

  for (const row of (expResult.data as any[]) || []) {
    const amount  = Number(row.total_amount) || 0
    const cnt     = Number(row.cnt)          || 0
    const phDate  = typeof row.ph_date === 'string' ? row.ph_date : String(row.ph_date)

    totalExpenses += amount
    dailyExpenseMap.set(phDate, (dailyExpenseMap.get(phDate) || 0) + amount)

    const catKey = row.category_id || '__none__'
    const existing = categoryMap.get(catKey)
    if (existing) {
      existing.total_amount += amount
      existing.count        += cnt
    } else {
      categoryMap.set(catKey, {
        category_id:    row.category_id,
        category_name:  row.category_name  || 'Uncategorized',
        category_color: row.category_color || '#6b7280',
        total_amount:   amount,
        count:          cnt,
      })
    }
  }

  const expensesByCategory = Array.from(categoryMap.values())
    .sort((a, b) => b.total_amount - a.total_amount)

  // ── 2b. Purchases map ──────────────────────────────────────────────────────
  const dailyPurchaseMap = new Map<string, number>()
  let totalPurchases = 0

  for (const row of (purchResult.data as any[]) || []) {
    const amount  = Number(row.total_purchases) || 0
    const phDate  = typeof row.ph_date === 'string' ? row.ph_date : String(row.ph_date)
    dailyPurchaseMap.set(phDate, (dailyPurchaseMap.get(phDate) || 0) + amount)
    totalPurchases += amount
  }

  const totalCollections = Number((collResult.data as any[])?.[0]?.total_collections) || 0

  // ── 2c. Loan interest expense ───────────────────────────────────────────────
  const { data: interestData } = await supabase
    .from('liability_loan_payments')
    .select('amount, liability_loan_schedule(interest_portion, scheduled_amount)')
    .gte('payment_date', dateFrom)
    .lte('payment_date', dateTo)

  const totalInterest = (interestData || []).reduce((sum, payment) => {
    const schedule = payment.liability_loan_schedule as unknown as { interest_portion: number; scheduled_amount: number } | null
    if (!schedule || !schedule.scheduled_amount) return sum
    return sum + (payment.amount / schedule.scheduled_amount) * schedule.interest_portion
  }, 0)

  if (totalInterest > 0) {
    totalExpenses += totalInterest
    expensesByCategory.push({
      category_id:    null,
      category_name:  'Interest Expense',
      category_color: '#8b5cf6',
      total_amount:   totalInterest,
      count:          (interestData || []).length,
    })
    expensesByCategory.sort((a, b) => b.total_amount - a.total_amount)
  }

  // ── 3. Daily trend ─────────────────────────────────────────────────────────

  const dailyTrend: DailyPLPoint[] = []
  let current = dateFrom
  while (current <= dateTo) {
    const rev  = dailyRevenueMap.get(current)  || { revenue: 0, gross_profit: 0 }
    const exp  = dailyExpenseMap.get(current)  || 0
    const purch = dailyPurchaseMap.get(current) || 0
    dailyTrend.push({
      date:         current,
      revenue:      rev.revenue,
      gross_profit: rev.gross_profit,
      expenses:     exp,
      net_profit:   rev.gross_profit - exp,
      purchases:    purch,
    })
    const d = new Date(current + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + 1)
    current = d.toISOString().split('T')[0]
  }

  // ── 4. Summary ─────────────────────────────────────────────────────────────

  const grossProfit = totalRevenue - totalCogs
  const netProfit   = grossProfit - totalExpenses

  return {
    revenue:               totalRevenue,
    cogs:                  totalCogs,
    gross_profit:          grossProfit,
    gross_margin:          totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0,
    total_expenses:        totalExpenses,
    expenses_by_category:  expensesByCategory,
    net_profit:            netProfit,
    net_margin:            totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0,
    total_purchases:       totalPurchases,
    total_collections:     totalCollections,
    daily_trend:           dailyTrend,
  }
}

// ============================================
// EXPORT QUERIES
// ============================================

export interface TransactionExportRow {
  transaction_number: string
  date: string
  type: string
  customer: string
  subtotal: number
  discount: number
  delivery_fee: number
  other_fees: number
  total: number
  payment_status: string
}

// Fetch all transactions in a date range for CSV export (per-transaction detail)
export async function getTransactionsList(dateFrom: string, dateTo: string): Promise<TransactionExportRow[]> {
  const supabase = createClient()
  const start = new Date(`${dateFrom}T00:00:00+08:00`).toISOString()
  const end = new Date(`${dateTo}T23:59:59.999+08:00`).toISOString()

  const { data, error } = await supabase
    .from('transactions')
    .select(`
      transaction_number,
      transaction_date,
      transaction_type,
      subtotal,
      discount_amount,
      delivery_fee,
      other_fees,
      total_amount,
      payment_status,
      customer:customers(name)
    `)
    .in('transaction_type', ['sale', 'return'])
    .eq('is_deleted', false)
    .gte('transaction_date', start)
    .lte('transaction_date', end)
    .order('transaction_date', { ascending: true })
    .limit(50000)

  if (error) throw error

  return ((data as any[]) || []).map(t => {
    const phDate = new Date(new Date(t.transaction_date).getTime() + 8 * 60 * 60 * 1000)
    const customerRaw = t.customer
    const customerName = Array.isArray(customerRaw) ? customerRaw[0]?.name : customerRaw?.name
    return {
      transaction_number: t.transaction_number,
      date: phDate.toISOString().split('T')[0],
      type: t.transaction_type,
      customer: customerName || 'Walk-in',
      subtotal: Number(t.subtotal ?? 0),
      discount: Number(t.discount_amount ?? 0),
      delivery_fee: Number(t.delivery_fee ?? 0),
      other_fees: Number(t.other_fees ?? 0),
      total: Number(t.total_amount ?? 0),
      payment_status: t.payment_status,
    }
  })
}
