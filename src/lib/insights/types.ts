// Row shapes returned by the insights_* SQL functions (migration 00114).
// Numerics come back from PostgREST as numbers or strings; the loader
// normalises them to numbers.

export interface DailyRow {
  ph_date: string; branch_id: string
  revenue: number; cogs: number; discounts: number
  sales_count: number; return_amount: number
  delivery_count: number; delivery_fees: number
  gov_revenue: number; credit_sales: number
  customers: number; new_customers: number; units_lines: number
}
export interface HourlyRow { dow: number; hour: number; revenue: number; sales_count: number }
export interface PaymentMixRow { method: string; amount: number; cnt: number }
/** Per-product totals for the selected period. */
export interface ProductRangeRow {
  product_id: string; qty_base: number; revenue: number; cogs: number; discounts: number
  orders: number; below_cost_lines: number; below_cost_loss: number
}
/** Weekly series per product, aligned to RawInsights.weeks (≤104 weeks). rev/cogs: last 16 weeks only. */
export interface SeriesRow { product_id: string; qty: number[]; out: number[]; rev: number[]; cogs: number[] }
export interface CategoryMonthRow { category: string; month: string; revenue: number }
export interface CustomerRow {
  customer_id: string; name: string; customer_type: string | null; phone: string | null
  credit_limit: number; is_walkin: boolean
  first_date: string | null; last_date: string | null
  orders: number; buy_days: number; revenue: number; profit: number
  rev_90: number; rev_prev_90: number
  median_gap_days: number | null; open_ar: number; oldest_unpaid: string | null
}
export interface CustomerMonthRow { customer_id: string; month: string; revenue: number; orders: number }
export interface InventoryRow {
  product_id: string; code: string; name: string; category: string; base_uom: string
  is_active: boolean; qty_on_hand: number; stock_value: number; investor_qty: number
  unit_cost: number; selling_price: number; sell_conv: number
  reorder_point: number; last_sale: string | null; last_received: string | null
  lead_days: number | null; lead_samples: number
}
export interface LeadTimeRow {
  po_id: string; po_number: string; supplier: string; po_date: string
  expected: string | null; actual: string; lead_days: number; late_days: number | null; total: number
}
export interface BasketPairRow { product_a: string; product_b: string; together: number }
export interface AdjustmentRow { month: string; product_id: string; qty_lost: number; qty_found: number; value_lost: number }
export interface QuotationRow { month: string; quotes: number; quoted_amount: number; converted: number; converted_amount: number }
export interface DeliveryRow { place: string; distance_km: number | null; revenue: number; delivery_fee: number }
export interface ExpenseRow { ph_date: string; category_name: string; total_amount: number }
export interface PurchaseRow { ph_date: string; total_purchases: number }
export interface WeatherDay { day: string; rain_mm: number; tmax: number | null; is_forecast: boolean }

export interface RawInsights {
  from: string; to: string; today: string; branchId: string | null
  branches: { id: string; name: string }[]
  /** Whole history for trends/forecasts, regardless of the selected range. */
  dailyAll: DailyRow[]
  hourly: HourlyRow[]
  paymentMix: PaymentMixRow[]
  productRange: ProductRangeRow[]
  /** Week starts (Mondays) of the product series, oldest first; the last is the last full week. */
  weeks: string[]
  series: SeriesRow[]
  categoryMonths: CategoryMonthRow[]
  customers: CustomerRow[]
  customerMonths: CustomerMonthRow[]
  inventory: InventoryRow[]
  leadTimes: LeadTimeRow[]
  basketPairs: BasketPairRow[]
  adjustments: AdjustmentRow[]
  quotations: QuotationRow[]
  deliveries: DeliveryRow[]
  expensesAll: ExpenseRow[]
  purchasesAll: PurchaseRow[]
  apOpen: { open_ap: number; due_30: number }
  weather: WeatherDay[]
  refreshedAt: string | null
}
