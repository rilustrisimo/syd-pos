'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  RefreshCw,
  Search,
  ArrowUpDown,
  ShoppingCart,
  Info,
  PackageX,
  CheckCircle,
  Package,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils/formatting'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ForecastRaw {
  product_id: string
  product_code: string
  product_name: string
  category_name: string
  uom_code: string
  latest_cogs: number
  current_stock: number
  total_units_sold: number
  avg_daily_demand: number
  demand_stddev_daily: number
  cv: number
  days_since_first_sale: number
  last_sale_date: string | null
  sold_last_30d: number
  sold_prior_30d: number
  sold_last_90d?: number  // Optional for backward compatibility
  sold_same_month_last_year?: number  // YoY data
  sold_same_quarter_last_year?: number  // YoY data
  yoy_growth_pct?: number  // YoY growth percentage
  has_seasonal_pattern?: boolean  // Auto-detected seasonality
  abc_class: 'A' | 'B' | 'C'
}

interface ForecastItem extends ForecastRaw {
  xyz_class: 'X' | 'Y' | 'Z'
  safety_stock: number
  reorder_point: number
  days_to_stockout: number
  suggested_order_qty: number
  trend_pct: number
  trend_dir: 'up' | 'down' | 'flat'
  status: 'critical' | 'warning' | 'ok' | 'excess' | 'no_movement'
  reorder_value: number
  // expose lead time for column color reference
  leadTimeDays: number
  // Enhanced forecasting metadata
  forecast_daily_demand: number
  weighted_avg_daily: number
  ema_daily: number
  seasonality_factor: number
  forecast_accuracy: number
  // Year-over-year metadata
  yoy_seasonality_factor: number  // YoY-based seasonality (preferred if available)
  using_yoy_data: boolean  // True if YoY data was used for forecasting
}

// ── Data ──────────────────────────────────────────────────────────────────────

async function fetchForecastData(): Promise<ForecastRaw[]> {
  const supabase = getClient()
  
  // Try v2 function first (with YoY data), fall back to v1 if not available
  let { data, error } = await supabase.rpc('get_demand_forecast_v2')
  
  if (error) {
    console.warn('YoY forecast v2 not available, falling back to v1:', error.message)
    const v1Result = await supabase.rpc('get_demand_forecast')
    data = v1Result.data
    error = v1Result.error
  }
  
  if (error) throw error
  
  return ((data as any[]) || []).map(r => ({
    product_id:           r.product_id,
    product_code:         r.product_code  || '—',
    product_name:         r.product_name,
    category_name:        r.category_name || 'Uncategorized',
    uom_code:             r.uom_code      || 'pc',
    latest_cogs:          Number(r.latest_cogs           || 0),
    current_stock:        Number(r.current_stock         || 0),
    total_units_sold:     Number(r.total_units_sold      || 0),
    avg_daily_demand:     Number(r.avg_daily_demand      || 0),
    demand_stddev_daily:  Number(r.demand_stddev_daily   || 0),
    cv:                   Number(r.cv                    || 0),
    days_since_first_sale:Number(r.days_since_first_sale || 0),
    last_sale_date:       r.last_sale_date || null,
    sold_last_30d:        Number(r.sold_last_30d         || 0),
    sold_prior_30d:       Number(r.sold_prior_30d        || 0),
    sold_last_90d:        r.sold_last_90d !== undefined ? Number(r.sold_last_90d || 0) : undefined,
    sold_same_month_last_year: r.sold_same_month_last_year !== undefined ? Number(r.sold_same_month_last_year || 0) : undefined,
    sold_same_quarter_last_year: r.sold_same_quarter_last_year !== undefined ? Number(r.sold_same_quarter_last_year || 0) : undefined,
    yoy_growth_pct:       r.yoy_growth_pct !== undefined ? Number(r.yoy_growth_pct || 0) : undefined,
    has_seasonal_pattern: r.has_seasonal_pattern !== undefined ? Boolean(r.has_seasonal_pattern) : undefined,
    abc_class:            (r.abc_class || 'C') as 'A' | 'B' | 'C',
  }))
}

// ── Advanced Forecasting Math ─────────────────────────────────────────────────

/**
 * Calculate Exponential Moving Average (EMA) weighted forecast
 * More recent sales are weighted higher than older sales
 * Alpha = smoothing factor (0.3 = 30% weight to latest data)
 */
function calculateEMA(recentDemand: number, historicalAvg: number, alpha = 0.3): number {
  return alpha * recentDemand + (1 - alpha) * historicalAvg
}

/**
 * Detect seasonality by comparing current period to same period last year (YoY)
 * More accurate than short-term trending, requires 365+ days of history
 * Returns adjustment factor (1.0 = no change, 1.2 = 20% higher demand expected)
 */
function detectYoYSeasonality(
  sold_last_30d: number,
  sold_same_month_last_year: number | undefined,
  sold_last_90d: number | undefined,
  sold_same_quarter_last_year: number | undefined,
  days_since_first: number
): number {
  // Need at least 1 year of history for YoY comparison
  if (days_since_first < 365) return 1.0
  
  // Prefer monthly comparison (±15 days window around same date last year)
  if (sold_same_month_last_year !== undefined && sold_same_month_last_year > 0) {
    const ratio = sold_last_30d / sold_same_month_last_year
    // Clamp to reasonable range (0.5x to 2.5x) - allow wider range for YoY
    return Math.max(0.5, Math.min(2.5, ratio))
  }
  
  // Fall back to quarterly comparison (±45 days window)
  if (sold_last_90d !== undefined && sold_same_quarter_last_year !== undefined && sold_same_quarter_last_year > 0) {
    const ratio = sold_last_90d / sold_same_quarter_last_year
    return Math.max(0.5, Math.min(2.5, ratio))
  }
  
  return 1.0
}

/**
 * Detect short-term seasonality by comparing last 30d to prior 30d
 * Used when YoY data is not available (less than 1 year of history)
 * Returns adjustment factor (1.0 = no change, 1.2 = 20% higher demand expected)
 */
function detectSeasonalityFactor(sold_last_30d: number, sold_prior_30d: number, total_sold: number, days_since_first: number): number {
  // Need at least 60 days of history for meaningful seasonality
  if (days_since_first < 60) return 1.0
  
  // If no prior period data, can't detect seasonality
  if (sold_prior_30d === 0) return sold_last_30d > 0 ? 1.2 : 1.0
  
  // Calculate ratio: recent vs prior period
  const ratio = sold_last_30d / sold_prior_30d
  
  // Clamp to reasonable range (0.5x to 2.0x) to avoid extreme adjustments
  return Math.max(0.5, Math.min(2.0, ratio))
}

/**
 * Calculate forecast accuracy using Mean Absolute Percentage Error (MAPE)
 * Lower is better: <10% = excellent, 10-20% = good, 20-50% = acceptable, >50% = poor
 */
function calculateMAPE(actual: number, forecast: number): number {
  if (actual === 0) return forecast === 0 ? 0 : 100
  return Math.abs((actual - forecast) / actual) * 100
}

/**
 * Calculate weighted moving average giving 60% weight to last 30d, 40% to prior 30d
 */
function calculateWeightedAverage(recent: number, prior: number): number {
  return (recent * 0.6 + prior * 0.4) / 30 // Daily average
}

function deriveItem(
  raw: ForecastRaw,
  leadTimeDays: number,
  Z: number,
  forecastDays: number,
): ForecastItem {
  const { avg_daily_demand: add, demand_stddev_daily: sigma, current_stock, cv } = raw

  // XYZ classification based on coefficient of variation
  const xyz_class: 'X' | 'Y' | 'Z' = cv < 0.5 ? 'X' : cv < 1.0 ? 'Y' : 'Z'

  // === ENHANCED FORECASTING ===
  
  // 0. Detect YoY seasonality (preferred if we have 365+ days of data)
  const yoy_seasonality_factor = detectYoYSeasonality(
    raw.sold_last_30d,
    raw.sold_same_month_last_year,
    raw.sold_last_90d,
    raw.sold_same_quarter_last_year,
    raw.days_since_first_sale
  )
  
  const using_yoy_data = yoy_seasonality_factor !== 1.0 && raw.days_since_first_sale >= 365
  
  // 1. Weighted Moving Average (recent data weighted higher)
  const weighted_avg_daily = raw.sold_last_30d > 0 || raw.sold_prior_30d > 0
    ? calculateWeightedAverage(raw.sold_last_30d, raw.sold_prior_30d)
    : add

  // 2. Exponential smoothing (blend recent trend with historical average)
  const recent_avg_daily = raw.sold_last_30d / 30
  const ema_daily = calculateEMA(recent_avg_daily, add, 0.3)

  // 3. Seasonality adjustment factor (prefer YoY if available, otherwise use short-term)
  const seasonality_factor = using_yoy_data 
    ? yoy_seasonality_factor
    : detectSeasonalityFactor(
        raw.sold_last_30d,
        raw.sold_prior_30d,
        raw.total_units_sold,
        raw.days_since_first_sale
      )

  // 4. Choose best forecast method based on data availability and variability
  let forecast_daily_demand: number
  if (xyz_class === 'X') {
    // Predictable demand: use historical average (most stable)
    forecast_daily_demand = add
  } else if (xyz_class === 'Y') {
    // Moderate variability: use EMA with seasonality adjustment
    forecast_daily_demand = ema_daily * seasonality_factor
  } else {
    // High variability: use weighted average with seasonality
    forecast_daily_demand = weighted_avg_daily * seasonality_factor
  }

  // Ensure we don't forecast negative demand
  forecast_daily_demand = Math.max(0, forecast_daily_demand)

  // 5. Calculate forecast accuracy (MAPE) for transparency
  const forecast_accuracy = calculateMAPE(recent_avg_daily, add)

  // Safety stock = Z × σ × √(lead_time) + seasonality buffer
  const base_safety_stock = Z * sigma * Math.sqrt(leadTimeDays)
  const seasonality_buffer = xyz_class === 'Z' ? base_safety_stock * 0.3 : 0
  const safety_stock = base_safety_stock + seasonality_buffer

  // Reorder Point = forecasted demand over lead time + safety buffer
  const reorder_point = forecast_daily_demand * leadTimeDays + safety_stock

  // Days until stockout (using forecasted demand)
  const days_to_stockout = forecast_daily_demand > 0 ? current_stock / forecast_daily_demand : 99999

  // Suggested order = cover forecastDays of demand + safety stock − current on hand
  const suggested_order_qty = forecast_daily_demand > 0
    ? Math.max(0, forecast_daily_demand * forecastDays + safety_stock - current_stock)
    : 0

  // 30-day demand trend
  const trend_pct = raw.sold_prior_30d > 0
    ? (raw.sold_last_30d - raw.sold_prior_30d) / raw.sold_prior_30d * 100
    : raw.sold_last_30d > 0 ? 100 : 0
  const trend_dir: 'up' | 'down' | 'flat' =
    trend_pct > 5 ? 'up' : trend_pct < -5 ? 'down' : 'flat'

  // Status determination (using forecasted demand)
  let status: ForecastItem['status']
  if (forecast_daily_demand === 0 && raw.total_units_sold === 0) {
    status = 'no_movement'
  } else if (current_stock <= 0 || current_stock < reorder_point) {
    status = 'critical'
  } else if (days_to_stockout <= leadTimeDays * 2) {
    status = 'warning'
  } else if (current_stock > reorder_point * 3) {
    status = 'excess'
  } else {
    status = 'ok'
  }

  return {
    ...raw,
    xyz_class,
    safety_stock,
    reorder_point,
    days_to_stockout,
    suggested_order_qty,
    trend_pct,
    trend_dir,
    status,
    reorder_value: suggested_order_qty * raw.latest_cogs,
    leadTimeDays,
    // Store additional forecast metadata (not in type, but useful for debugging)
    forecast_daily_demand,
    weighted_avg_daily,
    ema_daily,
    seasonality_factor,
    forecast_accuracy,
    yoy_seasonality_factor,
    using_yoy_data,
  } as ForecastItem
}

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  critical:    { label: 'Reorder Now',  color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-300'   },
  warning:     { label: 'Order Soon',   color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-300' },
  ok:          { label: 'OK',           color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-300' },
  excess:      { label: 'Excess Stock', color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-300'  },
  no_movement: { label: 'No Movement',  color: 'text-gray-500',   bg: 'bg-gray-50',   border: 'border-gray-200'  },
}

const ABC_CONFIG = {
  A: { bg: 'bg-purple-100', text: 'text-purple-700', title: 'Class A — top 70% of revenue · highest reorder priority' },
  B: { bg: 'bg-blue-100',   text: 'text-blue-700',   title: 'Class B — next 20% of revenue · medium priority' },
  C: { bg: 'bg-gray-100',   text: 'text-gray-600',   title: 'Class C — bottom 10% of revenue · low priority' },
}

const XYZ_CONFIG = {
  X: { bg: 'bg-green-100',  text: 'text-green-700',  title: 'Class X — predictable demand (CV < 0.5) · safe to automate reorders' },
  Y: { bg: 'bg-yellow-100', text: 'text-yellow-700', title: 'Class Y — moderate variability (CV 0.5–1.0) · review weekly' },
  Z: { bg: 'bg-red-100',    text: 'text-red-700',    title: 'Class Z — lumpy/irregular demand (CV > 1.0) · order manually in larger batches' },
}

type SortKey = 'days_to_stockout' | 'avg_daily_demand' | 'reorder_point' | 'suggested_order_qty' | 'current_stock' | 'reorder_value'

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DemandForecastPage() {
  // Configurable settings — all math is re-derived client-side when changed
  const [leadTime,     setLeadTime]     = useState(7)
  const [serviceLevel, setServiceLevel] = useState<95 | 99>(95)
  const [forecastDays, setForecastDays] = useState(30)

  // Filters
  const [search,         setSearch]         = useState('')
  const [statusFilter,   setStatusFilter]   = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [abcFilter,      setAbcFilter]      = useState<string>('all')

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('days_to_stockout')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const Z = serviceLevel === 95 ? 1.65 : 2.33

  const { data: rawItems = [], isLoading, error, refetch } = useQuery({
    queryKey: ['demand-forecast'],
    queryFn:  fetchForecastData,
    staleTime: 10 * 60 * 1000,
  })

  // Derive all computed fields whenever settings change (no extra network call)
  const items = useMemo<ForecastItem[]>(
    () => rawItems.map(r => deriveItem(r, leadTime, Z, forecastDays)),
    [rawItems, leadTime, Z, forecastDays],
  )

  const categories = useMemo(() => {
    const set = new Set(items.map(i => i.category_name))
    return Array.from(set).sort()
  }, [items])

  const summary = useMemo(() => ({
    critical:  items.filter(i => i.status === 'critical').length,
    warning:   items.filter(i => i.status === 'warning').length,
    ok:        items.filter(i => i.status === 'ok').length,
    excess:    items.filter(i => i.status === 'excess').length,
    total_reorder_value: items
      .filter(i => i.status === 'critical' || i.status === 'warning')
      .reduce((s, i) => s + i.reorder_value, 0),
  }), [items])

  // Filter + sort
  const filtered = useMemo(() => {
    let result = items

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(i =>
        i.product_name.toLowerCase().includes(q) ||
        i.product_code.toLowerCase().includes(q) ||
        i.category_name.toLowerCase().includes(q)
      )
    }
    if (statusFilter   !== 'all') result = result.filter(i => i.status      === statusFilter)
    if (categoryFilter !== 'all') result = result.filter(i => i.category_name === categoryFilter)
    if (abcFilter      !== 'all') result = result.filter(i => i.abc_class    === abcFilter)

    return [...result].sort((a, b) =>
      sortDir === 'asc' ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]
    )
  }, [items, search, statusFilter, categoryFilter, abcFilter, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const SortIcon = ({ k }: { k: SortKey }) => (
    <ArrowUpDown className={`h-3 w-3 ml-1 inline ${sortKey === k ? 'text-primary' : 'opacity-30'}`} />
  )

  const fmtDays = (d: number) => d >= 9999 ? '—' : `${Math.round(d)}d`

  // Export function for reorder list
  const exportReorderList = () => {
    const reorderItems = items.filter(i => i.status === 'critical' || i.status === 'warning')
    if (reorderItems.length === 0) {
      alert('No items need reordering at this time.')
      return
    }

    // Create CSV content
    const headers = [
      'Product Code',
      'Product Name',
      'Category',
      'ABC Class',
      'XYZ Class', 
      'Current Stock',
      'Reorder Point',
      'Suggested Order Qty',
      'Est. Cost',
      'UOM',
      'Status',
      'Days to Stockout',
      'Trend',
      'Forecast Method'
    ]

    const rows = reorderItems.map(item => [
      item.product_code,
      item.product_name,
      item.category_name,
      item.abc_class,
      item.xyz_class,
      item.current_stock.toFixed(2),
      item.reorder_point.toFixed(2),
      Math.ceil(item.suggested_order_qty),
      item.reorder_value.toFixed(2),
      item.uom_code,
      STATUS_CONFIG[item.status].label,
      fmtDays(item.days_to_stockout),
      item.trend_dir === 'up' ? `+${Math.round(item.trend_pct)}%` : item.trend_dir === 'down' ? `${Math.round(item.trend_pct)}%` : 'Flat',
      item.xyz_class === 'X' ? 'Historical Avg' : item.xyz_class === 'Y' ? 'EMA' : 'Weighted + Seasonality'
    ])

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')

    // Download
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reorder-list-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Smart Demand Forecast</h1>
            <p className="text-muted-foreground">
              AI-powered reordering with seasonality detection, trend analysis, and predictive analytics
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={exportReorderList} variant="outline" size="sm" disabled={isLoading || summary.critical + summary.warning === 0}>
              <ShoppingCart className="mr-2 h-4 w-4" />
              Export Reorder List ({summary.critical + summary.warning})
            </Button>
            <Button onClick={() => refetch()} variant="outline" size="sm" disabled={isLoading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Settings */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex flex-wrap gap-6 items-end">

              {/* Lead Time */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Supplier Lead Time
                  </Label>
                  <Tooltip>
                    <TooltipTrigger><Info className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Days from placing a purchase order to receiving stock. Drives the Reorder Point. Adjust per supplier.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {[3, 5, 7, 14, 21, 30].map(d => (
                    <Button key={d} size="sm" variant={leadTime === d ? 'default' : 'outline'} onClick={() => setLeadTime(d)}>
                      {d}d
                    </Button>
                  ))}
                  <Input
                    type="number"
                    className="w-16 h-8 text-sm"
                    value={leadTime}
                    min={1}
                    onChange={e => setLeadTime(Math.max(1, Number(e.target.value)))}
                  />
                </div>
              </div>

              {/* Order Coverage */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Order Coverage
                  </Label>
                  <Tooltip>
                    <TooltipTrigger><Info className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      How many days of demand to cover per order. Suggested qty = (Avg/Day × this period) + Safety Stock − current stock.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex gap-1">
                  {[14, 30, 45, 60, 90].map(d => (
                    <Button key={d} size="sm" variant={forecastDays === d ? 'default' : 'outline'} onClick={() => setForecastDays(d)}>
                      {d}d
                    </Button>
                  ))}
                </div>
              </div>

              {/* Service Level */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Service Level
                  </Label>
                  <Tooltip>
                    <TooltipTrigger><Info className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Probability of not stocking out before the next order arrives. 95% is standard retail; 99% adds more safety stock.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant={serviceLevel === 95 ? 'default' : 'outline'} onClick={() => setServiceLevel(95)}>95%</Button>
                  <Button size="sm" variant={serviceLevel === 99 ? 'default' : 'outline'} onClick={() => setServiceLevel(99)}>99%</Button>
                </div>
              </div>

            </div>
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-6 text-destructive text-sm">
              Failed to load forecast data: {(error as any).message}
            </CardContent>
          </Card>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-muted-foreground">Analysing full sales history…</span>
          </div>
        )}

        {!isLoading && !error && items.length > 0 && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">

              <Card
                className="border-red-200 bg-red-50 cursor-pointer hover:border-red-400 transition-colors"
                onClick={() => setStatusFilter(statusFilter === 'critical' ? 'all' : 'critical')}
              >
                <CardContent className="pt-5">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <span className="text-xs font-medium text-red-700 uppercase tracking-wide">Reorder Now</span>
                  </div>
                  <div className="text-3xl font-bold text-red-700">{summary.critical}</div>
                  <div className="text-xs text-red-600 mt-0.5">below reorder point</div>
                </CardContent>
              </Card>

              <Card
                className="border-amber-200 bg-amber-50 cursor-pointer hover:border-amber-400 transition-colors"
                onClick={() => setStatusFilter(statusFilter === 'warning' ? 'all' : 'warning')}
              >
                <CardContent className="pt-5">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span className="text-xs font-medium text-amber-700 uppercase tracking-wide">Order Soon</span>
                  </div>
                  <div className="text-3xl font-bold text-amber-700">{summary.warning}</div>
                  <div className="text-xs text-amber-600 mt-0.5">running low</div>
                </CardContent>
              </Card>

              <Card className="border-green-200 bg-green-50">
                <CardContent className="pt-5">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-xs font-medium text-green-700 uppercase tracking-wide">Well Stocked</span>
                  </div>
                  <div className="text-3xl font-bold text-green-700">{summary.ok}</div>
                  <div className="text-xs text-green-600 mt-0.5">no action needed</div>
                </CardContent>
              </Card>

              <Card
                className="border-blue-200 bg-blue-50 cursor-pointer hover:border-blue-400 transition-colors"
                onClick={() => setStatusFilter(statusFilter === 'excess' ? 'all' : 'excess')}
              >
                <CardContent className="pt-5">
                  <div className="flex items-center gap-2 mb-1">
                    <Package className="h-4 w-4 text-blue-600" />
                    <span className="text-xs font-medium text-blue-700 uppercase tracking-wide">Excess Stock</span>
                  </div>
                  <div className="text-3xl font-bold text-blue-700">{summary.excess}</div>
                  <div className="text-xs text-blue-600 mt-0.5">over 3× reorder point</div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5">
                  <div className="flex items-center gap-2 mb-1">
                    <ShoppingCart className="h-4 w-4 text-primary" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Est. Reorder Value</span>
                  </div>
                  <div className="text-2xl font-bold text-primary">{formatCurrency(summary.total_reorder_value)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">critical + warning items</div>
                </CardContent>
              </Card>

            </div>

            {/* Filters */}
            <Card>
              <CardContent className="pt-5">
                <div className="flex flex-wrap gap-4 items-end">
                  <div className="flex-1 min-w-[200px] space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Search</p>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        className="pl-8"
                        placeholder="Product name or code…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</p>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="critical">Reorder Now</SelectItem>
                        <SelectItem value="warning">Order Soon</SelectItem>
                        <SelectItem value="ok">OK</SelectItem>
                        <SelectItem value="excess">Excess Stock</SelectItem>
                        <SelectItem value="no_movement">No Movement</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Category</p>
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">ABC Class</p>
                    <Select value={abcFilter} onValueChange={setAbcFilter}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Classes</SelectItem>
                        <SelectItem value="A">A — High Value</SelectItem>
                        <SelectItem value="B">B — Medium</SelectItem>
                        <SelectItem value="C">C — Low Value</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {(statusFilter !== 'all' || categoryFilter !== 'all' || abcFilter !== 'all' || search) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setStatusFilter('all')
                        setCategoryFilter('all')
                        setAbcFilter('all')
                        setSearch('')
                      }}
                    >
                      Clear filters
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Main Table */}
            <Card>
              <CardHeader>
                <CardTitle>Reorder Analysis</CardTitle>
                <CardDescription>
                  {filtered.length} of {items.length} products · Lead time {leadTime}d · {serviceLevel}% service level · {forecastDays}d order coverage
                </CardDescription>
              </CardHeader>
              <CardContent>
                {filtered.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <PackageX className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p>No products match your filters.</p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="min-w-[220px]">Product</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-center">
                            <Tooltip>
                              <TooltipTrigger className="cursor-help underline decoration-dotted underline-offset-2">
                                ABC · XYZ
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs space-y-1 text-xs">
                                <p><strong>ABC</strong> = revenue contribution (A=top 70%, B=next 20%, C=bottom 10%)</p>
                                <p><strong>XYZ</strong> = demand regularity (X=predictable, Y=moderate, Z=lumpy)</p>
                              </TooltipContent>
                            </Tooltip>
                          </TableHead>
                          <TableHead
                            className="text-right cursor-pointer hover:text-primary select-none"
                            onClick={() => toggleSort('current_stock')}
                          >
                            Stock <SortIcon k="current_stock" />
                          </TableHead>
                          <TableHead
                            className="text-right cursor-pointer hover:text-primary select-none"
                            onClick={() => toggleSort('avg_daily_demand')}
                          >
                            <Tooltip>
                              <TooltipTrigger className="cursor-help">
                                Avg/Day <SortIcon k="avg_daily_demand" />
                              </TooltipTrigger>
                              <TooltipContent>Average daily demand based on full sales history from day 1</TooltipContent>
                            </Tooltip>
                          </TableHead>
                          <TableHead
                            className="text-right cursor-pointer hover:text-primary select-none"
                            onClick={() => toggleSort('days_to_stockout')}
                          >
                            Days Left <SortIcon k="days_to_stockout" />
                          </TableHead>
                          <TableHead
                            className="text-right cursor-pointer hover:text-primary select-none"
                            onClick={() => toggleSort('reorder_point')}
                          >
                            <Tooltip>
                              <TooltipTrigger className="cursor-help">
                                ROP <SortIcon k="reorder_point" />
                              </TooltipTrigger>
                              <TooltipContent>
                                Reorder Point = (Avg/Day × {leadTime}d lead time) + Safety Stock ({serviceLevel === 95 ? '1.65' : '2.33'} × σ × √{leadTime})
                              </TooltipContent>
                            </Tooltip>
                          </TableHead>
                          <TableHead
                            className="text-right cursor-pointer hover:text-primary select-none"
                            onClick={() => toggleSort('suggested_order_qty')}
                          >
                            <Tooltip>
                              <TooltipTrigger className="cursor-help">
                                Suggest Order <SortIcon k="suggested_order_qty" />
                              </TooltipTrigger>
                              <TooltipContent>
                                ({forecastDays}d × Avg/Day) + Safety Stock − current stock
                              </TooltipContent>
                            </Tooltip>
                          </TableHead>
                          <TableHead
                            className="text-right cursor-pointer hover:text-primary select-none"
                            onClick={() => toggleSort('reorder_value')}
                          >
                            Est. Cost <SortIcon k="reorder_value" />
                          </TableHead>
                          <TableHead className="text-center">30d Trend</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map(item => {
                          const cfg  = STATUS_CONFIG[item.status]
                          const abcC = ABC_CONFIG[item.abc_class]
                          const xyzC = XYZ_CONFIG[item.xyz_class]

                          const daysLeftColor =
                            item.days_to_stockout < item.leadTimeDays
                              ? 'text-red-600 font-bold'
                              : item.days_to_stockout < item.leadTimeDays * 2
                              ? 'text-amber-600 font-semibold'
                              : ''

                          return (
                            <TableRow
                              key={item.product_id}
                              className={item.status === 'critical' ? 'bg-red-50/40' : ''}
                            >
                              {/* Product */}
                              <TableCell>
                                <div className="font-medium leading-tight">{item.product_name}</div>
                                <div className="text-xs text-muted-foreground font-mono">{item.product_code}</div>
                              </TableCell>

                              {/* Category */}
                              <TableCell className="text-sm text-muted-foreground">{item.category_name}</TableCell>

                              {/* ABC · XYZ */}
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${abcC.bg} ${abcC.text}`}>
                                        {item.abc_class}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>{abcC.title}</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${xyzC.bg} ${xyzC.text}`}>
                                        {item.xyz_class}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>{xyzC.title}</TooltipContent>
                                  </Tooltip>
                                </div>
                              </TableCell>

                              {/* Stock */}
                              <TableCell className="text-right font-mono text-sm">
                                {item.current_stock.toLocaleString()}
                                <span className="text-xs text-muted-foreground ml-1">{item.uom_code}</span>
                              </TableCell>

                              {/* Avg/Day - Enhanced with Forecast Method Indicator + YoY */}
                              <TableCell className="text-right font-mono text-sm">
                                {item.avg_daily_demand > 0 ? (
                                  <Tooltip>
                                    <TooltipTrigger className="cursor-help">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>
                                          {item.forecast_daily_demand.toFixed(2)}
                                          <span className="text-xs text-muted-foreground ml-1">{item.uom_code}</span>
                                        </span>
                                        {/* Forecast method indicator */}
                                        {item.xyz_class === 'X' && (
                                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" title="Using historical average" />
                                        )}
                                        {item.xyz_class === 'Y' && (
                                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-500" title="Using EMA" />
                                        )}
                                        {item.xyz_class === 'Z' && (
                                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" title="Using weighted + seasonality" />
                                        )}
                                        {/* YoY data available indicator */}
                                        {item.using_yoy_data && (
                                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" title="Using year-over-year data" />
                                        )}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs space-y-1">
                                      <p className="font-semibold">
                                        {item.xyz_class === 'X' && '📈 Historical Average (Stable)'}
                                        {item.xyz_class === 'Y' && '📊 Exponential Smoothing (EMA)'}
                                        {item.xyz_class === 'Z' && '🔄 Weighted + Seasonality (Erratic)'}
                                        {item.using_yoy_data && ' + 📅 YoY'}
                                      </p>
                                      <p className="text-xs">Forecasted: {item.forecast_daily_demand.toFixed(2)} {item.uom_code}/day</p>
                                      <p className="text-xs">Historical: {item.avg_daily_demand.toFixed(2)} {item.uom_code}/day</p>
                                      {item.using_yoy_data && item.yoy_growth_pct !== undefined && (
                                        <p className="text-xs font-semibold text-blue-600">
                                          📅 Year-over-Year: {item.yoy_growth_pct > 0 ? '+' : ''}{item.yoy_growth_pct.toFixed(1)}%
                                          {item.has_seasonal_pattern && ' (Seasonal Pattern Detected)'}
                                        </p>
                                      )}
                                      {item.yoy_seasonality_factor !== 1.0 && (
                                        <p className="text-xs text-amber-600">
                                          YoY Adjustment: {(item.yoy_seasonality_factor * 100).toFixed(0)}% 
                                          {item.yoy_seasonality_factor > 1 ? ' ↑ vs last year' : ' ↓ vs last year'}
                                        </p>
                                      )}
                                      {!item.using_yoy_data && item.seasonality_factor !== 1.0 && (
                                        <p className="text-xs text-amber-600">
                                          Short-term Trend: {(item.seasonality_factor * 100).toFixed(0)}% 
                                          {item.seasonality_factor > 1 ? ' ↑ trending up' : ' ↓ trending down'}
                                        </p>
                                      )}
                                      {item.forecast_accuracy > 0 && item.forecast_accuracy < 100 && (
                                        <p className="text-xs">
                                          Accuracy: {item.forecast_accuracy < 10 ? '🎯 Excellent' : item.forecast_accuracy < 20 ? '✅ Good' : item.forecast_accuracy < 50 ? '⚠️ Fair' : '❌ Poor'}
                                          {' '}({item.forecast_accuracy.toFixed(0)}% MAPE)
                                        </p>
                                      )}
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>

                              {/* Days Left */}
                              <TableCell className={`text-right font-mono text-sm ${daysLeftColor}`}>
                                {item.avg_daily_demand > 0 ? fmtDays(item.days_to_stockout) : <span className="text-muted-foreground">—</span>}
                              </TableCell>

                              {/* ROP */}
                              <TableCell className="text-right font-mono text-sm">
                                {item.avg_daily_demand > 0
                                  ? <>{item.reorder_point.toFixed(1)} <span className="text-xs text-muted-foreground">{item.uom_code}</span></>
                                  : <span className="text-muted-foreground">—</span>}
                              </TableCell>

                              {/* Suggested Order */}
                              <TableCell className="text-right font-mono text-sm">
                                {item.suggested_order_qty > 0
                                  ? <span className="font-semibold text-primary">
                                      {Math.ceil(item.suggested_order_qty).toLocaleString()}
                                      <span className="text-xs font-normal text-muted-foreground ml-1">{item.uom_code}</span>
                                    </span>
                                  : <span className="text-muted-foreground">—</span>}
                              </TableCell>

                              {/* Est Cost */}
                              <TableCell className="text-right text-sm">
                                {item.reorder_value > 0
                                  ? formatCurrency(item.reorder_value)
                                  : <span className="text-muted-foreground">—</span>}
                              </TableCell>

                              {/* Trend */}
                              <TableCell className="text-center">
                                {item.sold_last_30d === 0 && item.sold_prior_30d === 0 ? (
                                  <span className="text-muted-foreground text-xs">—</span>
                                ) : item.trend_dir === 'up' ? (
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <span className="flex items-center justify-center gap-0.5 text-green-600">
                                        <TrendingUp className="h-4 w-4" />
                                        <span className="text-xs font-medium">+{Math.round(item.trend_pct)}%</span>
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Last 30d: {item.sold_last_30d.toFixed(1)} {item.uom_code} · Prior 30d: {item.sold_prior_30d.toFixed(1)} {item.uom_code}
                                    </TooltipContent>
                                  </Tooltip>
                                ) : item.trend_dir === 'down' ? (
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <span className="flex items-center justify-center gap-0.5 text-red-500">
                                        <TrendingDown className="h-4 w-4" />
                                        <span className="text-xs font-medium">{Math.round(item.trend_pct)}%</span>
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Last 30d: {item.sold_last_30d.toFixed(1)} {item.uom_code} · Prior 30d: {item.sold_prior_30d.toFixed(1)} {item.uom_code}
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <Minus className="h-4 w-4 text-muted-foreground mx-auto" />
                                )}
                              </TableCell>

                              {/* Status */}
                              <TableCell>
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                                  {item.status === 'critical' && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                                  )}
                                  {cfg.label}
                                </span>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Explainer - Enhanced with Forecasting Methods */}
            <Card className="bg-muted/30 border-dashed">
              <CardContent className="pt-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-muted-foreground">
                  <div className="space-y-1.5">
                    <p className="font-semibold text-foreground text-xs uppercase tracking-wide">📊 Modern Forecasting Methods</p>
                    <p><strong>X-Class (Stable):</strong> Uses historical average — most reliable for consistent demand</p>
                    <p><strong>Y-Class (Variable):</strong> Uses Exponential Moving Average (EMA) — balances history with recent trends</p>
                    <p><strong>Z-Class (Erratic):</strong> Uses Weighted Moving Average + Seasonality — adapts to irregular patterns</p>
                    <p className="text-xs pt-1 border-t mt-2 pt-2">
                      <strong>📅 Year-over-Year Seasonality (Primary):</strong> Compares sales from same period last year (±15d monthly, ±45d quarterly). Requires 365+ days history. 
                      <span className="text-blue-600 font-semibold"> Adjusts by 0.5x-2.5x for seasonal patterns.</span>
                    </p>
                    <p className="text-xs">
                      <strong>Short-term Trend (Fallback):</strong> Compares last 30d vs prior 30d when YoY unavailable. Applied to Y-class and Z-class forecasts.
                    </p>
                  </div>
                  
                  <div className="space-y-1.5">
                    <p className="font-semibold text-foreground text-xs uppercase tracking-wide">🧮 How Numbers Work</p>
                    <p><strong>Avg Daily Demand</strong> = total units sold ÷ days since first sale (full history)</p>
                    <p><strong>Safety Stock</strong> = {serviceLevel === 95 ? '1.65' : '2.33'} × σ × √{leadTime}d + variance buffer for Z-class</p>
                    <p><strong>Reorder Point (ROP)</strong> = (Forecast Daily × {leadTime}d) + Safety Stock</p>
                    <p><strong>Days Left</strong> = current stock ÷ forecasted daily demand</p>
                    <p><strong>Suggested Order</strong> = ({forecastDays}d × Forecast) + Safety − current stock</p>
                  </div>
                  
                  <div className="space-y-1.5">
                    <p className="font-semibold text-foreground text-xs uppercase tracking-wide">🎯 ABC · XYZ Strategy</p>
                    <p><strong>A</strong> = top 70% revenue · <strong>B</strong> = next 20% · <strong>C</strong> = bottom 10%</p>
                    <p><strong>X</strong> = predictable (CV &lt; 0.5) — automate</p>
                    <p><strong>Y</strong> = moderate (CV 0.5–1.0) — review weekly</p>
                    <p><strong>Z</strong> = erratic (CV &gt; 1.0) — manual batches</p>
                    <p className="pt-1 text-xs border-t mt-2 pt-2">
                      <strong>Priority:</strong> AX/AY first (high value + predictable). AZ items need extra safety stock. CZ items → review for discontinuation.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* Additional Insights Card */}
            <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border-blue-200">
              <CardContent className="pt-5">
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 p-2 rounded-lg bg-blue-600 text-white">
                      <TrendingUp className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-foreground mb-1">💡 Smart Reordering Tips</p>
                      <div className="grid gap-2 text-sm text-muted-foreground">
                        <p>• <strong>Critical items</strong> (red) need immediate orders — delay risks stockouts</p>
                        <p>• <strong>Trending up</strong> products may need larger orders than suggested — consider +20% buffer</p>
                        <p>• <strong>Excess stock</strong> (blue) items → stop reordering until stock normalizes</p>
                        <p>• <strong>No movement</strong> items → consider marking inactive or run promotions to clear</p>
                        <p>• Group orders by supplier to save on shipping costs — use category filter</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {!isLoading && !error && items.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>No active products with stock or sales history found.</p>
          </div>
        )}

      </div>
    </TooltipProvider>
  )
}
