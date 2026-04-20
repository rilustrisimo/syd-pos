'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  AlertTriangle, TrendingUp, TrendingDown, Minus,
  Loader2, RefreshCw, Search, ArrowUpDown,
  ShoppingCart, Info, PackageX, CheckCircle, Package,
  Zap, Download, ChevronDown, ChevronUp,
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
  transaction_count: number
  txn_count_last_30d: number
  txn_count_prior_30d: number
  po_count_total: number
  po_count_last_90d: number
  abc_class: 'A' | 'B' | 'C'
}

type VelocityClass = 'high' | 'medium' | 'low' | 'none'
type StatusType = 'critical' | 'warning' | 'ok' | 'excess' | 'no_movement'

interface ForecastItem extends ForecastRaw {
  velocity_class: VelocityClass
  velocity_score: number      // combined sales+PO frequency score for sorting
  safety_stock: number
  reorder_point: number
  days_to_stockout: number
  suggested_order_qty: number
  trend_pct: number
  trend_dir: 'up' | 'down' | 'flat'
  status: StatusType
  reorder_value: number
  stock_ratio: number   // current_stock / reorder_point — for the health bar
  leadTimeDays: number
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchForecastData(): Promise<ForecastRaw[]> {
  const supabase = getClient()
  const { data, error } = await supabase.rpc('get_demand_forecast')
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
    transaction_count:    Number(r.transaction_count     || 0),
    txn_count_last_30d:   Number(r.txn_count_last_30d    || 0),
    txn_count_prior_30d:  Number(r.txn_count_prior_30d   || 0),
    po_count_total:       Number(r.po_count_total        || 0),
    po_count_last_90d:    Number(r.po_count_last_90d     || 0),
    abc_class:            (r.abc_class || 'C') as 'A' | 'B' | 'C',
  }))
}

// ── Derive ────────────────────────────────────────────────────────────────────

function deriveItems(
  raw: ForecastRaw[],
  leadTimeDays: number,
  Z: number,
  forecastDays: number,
): ForecastItem[] {
  // ── Velocity score = sales txn frequency (70%) + PO replenishment frequency (30%)
  // Normalise each signal to 0–1 across all products, then combine.
  // Products that sell often AND need frequent restocking rank highest.
  const maxTxn = Math.max(1, ...raw.map(r => r.txn_count_last_30d))
  const maxPO  = Math.max(1, ...raw.map(r => r.po_count_last_90d))

  const scores = raw.map(r => {
    const txnNorm = r.txn_count_last_30d / maxTxn
    const poNorm  = r.po_count_last_90d  / maxPO
    return txnNorm * 0.7 + poNorm * 0.3
  }).sort((a, b) => a - b)

  const n   = scores.length
  const p75 = n > 0 ? scores[Math.floor(n * 0.75)] : 0
  const p40 = n > 0 ? scores[Math.floor(n * 0.40)] : 0

  return raw.map(r => {
    const add    = r.avg_daily_demand
    const sigma  = r.demand_stddev_daily

    // Combined velocity score for this product
    const txnNorm      = r.txn_count_last_30d / maxTxn
    const poNorm       = r.po_count_last_90d  / maxPO
    const velocity_score = txnNorm * 0.7 + poNorm * 0.3

    let velocity_class: VelocityClass
    if (r.txn_count_last_30d === 0)        velocity_class = 'none'
    else if (velocity_score >= p75)        velocity_class = 'high'
    else if (velocity_score >= p40)        velocity_class = 'medium'
    else                                   velocity_class = 'low'

    const safety_stock     = Z * sigma * Math.sqrt(leadTimeDays)
    const reorder_point    = add * leadTimeDays + safety_stock
    const days_to_stockout = add > 0 ? r.current_stock / add : 99999
    const suggested_order_qty = add > 0
      ? Math.max(0, add * forecastDays + safety_stock - r.current_stock)
      : 0

    const trend_pct = r.sold_prior_30d > 0
      ? (r.sold_last_30d - r.sold_prior_30d) / r.sold_prior_30d * 100
      : r.sold_last_30d > 0 ? 100 : 0
    const trend_dir = trend_pct > 5 ? 'up' : trend_pct < -5 ? 'down' : 'flat'

    let status: StatusType
    if (add === 0 && r.total_units_sold === 0)       status = 'no_movement'
    else if (r.current_stock <= 0 || r.current_stock < reorder_point) status = 'critical'
    else if (days_to_stockout <= leadTimeDays * 2)   status = 'warning'
    else if (r.current_stock > reorder_point * 3)    status = 'excess'
    else                                              status = 'ok'

    const stock_ratio = reorder_point > 0 ? r.current_stock / reorder_point : 99

    return {
      ...r,
      velocity_class,
      velocity_score,
      safety_stock,
      reorder_point,
      days_to_stockout,
      suggested_order_qty,
      trend_pct,
      trend_dir: trend_dir as 'up' | 'down' | 'flat',
      status,
      reorder_value: suggested_order_qty * r.latest_cogs,
      stock_ratio,
      leadTimeDays,
    }
  })
}

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<StatusType, {
  label: string; rowBorder: string; pillBg: string; pillText: string; pillBorder: string
}> = {
  critical:    { label: 'Reorder Now',  rowBorder: 'border-l-4 border-l-red-500',    pillBg: 'bg-red-50',    pillText: 'text-red-700',   pillBorder: 'border-red-300'   },
  warning:     { label: 'Order Soon',   rowBorder: 'border-l-4 border-l-amber-400',  pillBg: 'bg-amber-50',  pillText: 'text-amber-700', pillBorder: 'border-amber-300' },
  ok:          { label: 'OK',           rowBorder: '',                                pillBg: 'bg-green-50',  pillText: 'text-green-700', pillBorder: 'border-green-300' },
  excess:      { label: 'Excess Stock', rowBorder: '',                                pillBg: 'bg-blue-50',   pillText: 'text-blue-700',  pillBorder: 'border-blue-300'  },
  no_movement: { label: 'No Sales',     rowBorder: '',                                pillBg: 'bg-gray-50',   pillText: 'text-gray-500',  pillBorder: 'border-gray-200'  },
}

const VEL_CFG: Record<VelocityClass, { label: string; bg: string; text: string; dot: string }> = {
  high:   { label: 'High',   bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  medium: { label: 'Medium', bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  low:    { label: 'Low',    bg: 'bg-gray-100',   text: 'text-gray-600',   dot: 'bg-gray-400'   },
  none:   { label: 'No Sales', bg: 'bg-gray-50',  text: 'text-gray-400',   dot: 'bg-gray-300'   },
}

type SortKey = 'velocity_score' | 'days_to_stockout' | 'avg_daily_demand' | 'suggested_order_qty' | 'current_stock' | 'reorder_value' | 'txn_count_last_30d'

// ── Stock Health Bar ──────────────────────────────────────────────────────────

function StockBar({ ratio, rop, current, uom }: { ratio: number; rop: number; current: number; uom: string }) {
  const pct = Math.min(ratio / 3, 1) * 100  // cap at 3× ROP = full bar
  const color = ratio < 1 ? 'bg-red-500' : ratio < 1.5 ? 'bg-amber-400' : 'bg-green-500'
  return (
    <Tooltip>
      <TooltipTrigger className="w-full">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden min-w-[60px]">
            <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
            {current.toLocaleString()}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">Stock: {current.toLocaleString()} {uom}</p>
        <p className="text-xs">Reorder at: {rop.toFixed(1)} {uom}</p>
        <p className="text-xs">Buffer: {(ratio * 100).toFixed(0)}% of ROP</p>
      </TooltipContent>
    </Tooltip>
  )
}

// ── Reorder Table ─────────────────────────────────────────────────────────────

function ForecastTable({
  items,
  leadTime,
  serviceLevel,
  forecastDays,
}: {
  items: ForecastItem[]
  leadTime: number
  serviceLevel: 95 | 99
  forecastDays: number
}) {
  const [search,         setSearch]         = useState('')
  const [statusFilter,   setStatusFilter]   = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [sortKey,        setSortKey]        = useState<SortKey>('velocity_score')
  const [sortDir,        setSortDir]        = useState<'asc' | 'desc'>('desc')

  const categories = useMemo(() => Array.from(new Set(items.map(i => i.category_name))).sort(), [items])

  const filtered = useMemo(() => {
    let r = items
    if (search.trim()) {
      const q = search.toLowerCase()
      r = r.filter(i =>
        i.product_name.toLowerCase().includes(q) ||
        i.product_code.toLowerCase().includes(q) ||
        i.category_name.toLowerCase().includes(q)
      )
    }
    if (statusFilter   !== 'all') r = r.filter(i => i.status        === statusFilter)
    if (categoryFilter !== 'all') r = r.filter(i => i.category_name === categoryFilter)
    return [...r].sort((a, b) =>
      sortDir === 'asc' ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]
    )
  }, [items, search, statusFilter, categoryFilter, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const SI = ({ k }: { k: SortKey }) => (
    <ArrowUpDown className={`h-3 w-3 ml-0.5 inline ${sortKey === k ? 'text-primary' : 'opacity-25'}`} />
  )

  const fmtDays = (d: number) => d >= 9999 ? '—' : `${Math.round(d)}d`

  const hasFilters = search || statusFilter !== 'all' || categoryFilter !== 'all'

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 h-8 text-sm" placeholder="Search product…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="critical">Reorder Now</SelectItem>
            <SelectItem value="warning">Order Soon</SelectItem>
            <SelectItem value="ok">OK</SelectItem>
            <SelectItem value="excess">Excess</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-44 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setSearch(''); setStatusFilter('all'); setCategoryFilter('all') }}>
            Clear
          </Button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} products</span>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="w-[110px]">Status</TableHead>
              <TableHead className="min-w-[200px]">Product</TableHead>
              <TableHead className="w-[90px] cursor-pointer hover:text-primary select-none" onClick={() => toggleSort('velocity_score')}>
                <Tooltip>
                  <TooltipTrigger>Velocity <SI k="velocity_score" /></TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Combined score: 70% sales frequency (txns last 30d) + 30% restock frequency (POs last 90d). Higher = true fast mover.
                  </TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead className="w-[80px] cursor-pointer hover:text-primary select-none text-right" onClick={() => toggleSort('days_to_stockout')}>
                Days Left <SI k="days_to_stockout" />
              </TableHead>
              <TableHead className="min-w-[140px]">
                <Tooltip>
                  <TooltipTrigger className="cursor-help">Stock Health</TooltipTrigger>
                  <TooltipContent>Bar shows current stock vs reorder point. Red = below ROP, Amber = near, Green = healthy.</TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead className="w-[110px] cursor-pointer hover:text-primary select-none text-right" onClick={() => toggleSort('suggested_order_qty')}>
                Order Qty <SI k="suggested_order_qty" />
              </TableHead>
              <TableHead className="w-[100px] cursor-pointer hover:text-primary select-none text-right" onClick={() => toggleSort('reorder_value')}>
                Est. Cost <SI k="reorder_value" />
              </TableHead>
              <TableHead className="w-[80px] text-center">Trend</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                  <PackageX className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No products match your filters.
                </TableCell>
              </TableRow>
            ) : filtered.map(item => {
              const scfg = STATUS_CFG[item.status]
              const vcfg = VEL_CFG[item.velocity_class]

              const daysColor =
                item.days_to_stockout < item.leadTimeDays        ? 'text-red-600 font-bold' :
                item.days_to_stockout < item.leadTimeDays * 2    ? 'text-amber-600 font-semibold' :
                item.days_to_stockout < 30                       ? 'text-yellow-700' : ''

              return (
                <TableRow key={item.product_id} className={`${scfg.rowBorder} ${item.status === 'critical' ? 'bg-red-50/30' : item.status === 'warning' ? 'bg-amber-50/20' : ''}`}>

                  {/* Status */}
                  <TableCell className="py-2">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${scfg.pillBg} ${scfg.pillText} ${scfg.pillBorder}`}>
                      {item.status === 'critical' && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />}
                      {scfg.label}
                    </span>
                  </TableCell>

                  {/* Product */}
                  <TableCell className="py-2">
                    <div className="font-medium text-sm leading-tight">{item.product_name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{item.product_code} · {item.category_name}</div>
                  </TableCell>

                  {/* Velocity */}
                  <TableCell className="py-2">
                    <Tooltip>
                      <TooltipTrigger>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${vcfg.bg} ${vcfg.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${vcfg.dot}`} />
                          {vcfg.label}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs font-semibold">Sales: {item.txn_count_last_30d} transactions in last 30d</p>
                        <p className="text-xs text-muted-foreground">Prior 30d: {item.txn_count_prior_30d} txns · All-time: {item.transaction_count} txns</p>
                        <p className="text-xs text-muted-foreground">{item.sold_last_30d.toFixed(1)} {item.uom_code} sold this month</p>
                        <p className="text-xs font-semibold mt-1">Restocks: {item.po_count_last_90d} POs in last 90d</p>
                        <p className="text-xs text-muted-foreground">All-time POs: {item.po_count_total}</p>
                        <p className="text-xs text-muted-foreground mt-1">Score: {(item.velocity_score * 100).toFixed(0)}/100</p>
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>

                  {/* Days Left */}
                  <TableCell className={`py-2 text-right font-mono text-sm ${daysColor}`}>
                    {item.avg_daily_demand > 0 ? fmtDays(item.days_to_stockout) : <span className="text-muted-foreground">—</span>}
                  </TableCell>

                  {/* Stock Health bar */}
                  <TableCell className="py-2 pr-4">
                    {item.avg_daily_demand > 0 ? (
                      <StockBar
                        ratio={item.stock_ratio}
                        rop={item.reorder_point}
                        current={item.current_stock}
                        uom={item.uom_code}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">{item.current_stock.toLocaleString()} {item.uom_code}</span>
                    )}
                  </TableCell>

                  {/* Order Qty */}
                  <TableCell className="py-2 text-right">
                    {item.suggested_order_qty > 0 ? (
                      <span className="font-semibold text-sm text-primary">
                        {Math.ceil(item.suggested_order_qty).toLocaleString()}
                        <span className="text-xs font-normal text-muted-foreground ml-1">{item.uom_code}</span>
                      </span>
                    ) : <span className="text-muted-foreground text-sm">—</span>}
                  </TableCell>

                  {/* Est Cost */}
                  <TableCell className="py-2 text-right text-sm">
                    {item.reorder_value > 0 ? formatCurrency(item.reorder_value) : <span className="text-muted-foreground">—</span>}
                  </TableCell>

                  {/* Trend */}
                  <TableCell className="py-2 text-center">
                    {item.txn_count_last_30d === 0 && item.txn_count_prior_30d === 0 ? (
                      <span className="text-muted-foreground text-xs">—</span>
                    ) : item.trend_dir === 'up' ? (
                      <Tooltip>
                        <TooltipTrigger>
                          <span className="flex items-center justify-center gap-0.5 text-green-600">
                            <TrendingUp className="h-3.5 w-3.5" />
                            <span className="text-xs font-medium">+{Math.round(item.trend_pct)}%</span>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">Last 30d: {item.txn_count_last_30d} txns ({item.sold_last_30d.toFixed(1)} {item.uom_code})</p>
                          <p className="text-xs">Prior 30d: {item.txn_count_prior_30d} txns ({item.sold_prior_30d.toFixed(1)} {item.uom_code})</p>
                        </TooltipContent>
                      </Tooltip>
                    ) : item.trend_dir === 'down' ? (
                      <Tooltip>
                        <TooltipTrigger>
                          <span className="flex items-center justify-center gap-0.5 text-red-500">
                            <TrendingDown className="h-3.5 w-3.5" />
                            <span className="text-xs font-medium">{Math.round(item.trend_pct)}%</span>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">Last 30d: {item.txn_count_last_30d} txns ({item.sold_last_30d.toFixed(1)} {item.uom_code})</p>
                          <p className="text-xs">Prior 30d: {item.txn_count_prior_30d} txns ({item.sold_prior_30d.toFixed(1)} {item.uom_code})</p>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <Minus className="h-3.5 w-3.5 text-muted-foreground mx-auto" />
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DemandForecastPage() {
  const [leadTime,        setLeadTime]        = useState(7)
  const [serviceLevel,    setServiceLevel]    = useState<95 | 99>(95)
  const [forecastDays,    setForecastDays]    = useState(30)
  const [settingsOpen,    setSettingsOpen]    = useState(false)
  const [activeTab,       setActiveTab]       = useState('fast-movers')

  const Z = serviceLevel === 95 ? 1.65 : 2.33

  const { data: rawItems = [], isLoading, error, refetch } = useQuery({
    queryKey: ['demand-forecast'],
    queryFn:  fetchForecastData,
    staleTime: 10 * 60 * 1000,
  })

  const items = useMemo(
    () => deriveItems(rawItems, leadTime, Z, forecastDays),
    [rawItems, leadTime, Z, forecastDays],
  )

  // Fast movers = high + medium velocity, sorted by velocity score DESC
  // (most frequently sold + most frequently restocked first)
  // Within same score, secondary sort by days_to_stockout ASC so at-risk items surface
  const fastMovers = useMemo(
    () => items
      .filter(i => i.velocity_class === 'high' || i.velocity_class === 'medium')
      .sort((a, b) =>
        b.velocity_score !== a.velocity_score
          ? b.velocity_score - a.velocity_score
          : a.days_to_stockout - b.days_to_stockout
      ),
    [items],
  )

  const allItems = useMemo(
    () => [...items].sort((a, b) =>
      b.velocity_score !== a.velocity_score
        ? b.velocity_score - a.velocity_score
        : a.days_to_stockout - b.days_to_stockout
    ),
    [items],
  )

  const summary = useMemo(() => {
    const fm = fastMovers
    return {
      fm_critical:    fm.filter(i => i.status === 'critical').length,
      fm_warning:     fm.filter(i => i.status === 'warning').length,
      fm_ok:          fm.filter(i => i.status === 'ok' || i.status === 'excess').length,
      fm_count:       fm.length,
      fm_reorder_val: fm.filter(i => i.status === 'critical' || i.status === 'warning')
                        .reduce((s, i) => s + i.reorder_value, 0),
      all_critical:   items.filter(i => i.status === 'critical').length,
    }
  }, [fastMovers, items])

  // CSV export for items that need ordering
  const exportCSV = () => {
    const source = activeTab === 'fast-movers' ? fastMovers : allItems
    const toExport = source.filter(i => i.status === 'critical' || i.status === 'warning')
    if (toExport.length === 0) return

    const headers = ['Code','Product','Category','Velocity','Days Left','Current Stock','Order Qty','UOM','Est. Cost','Status','Txns (30d)']
    const rows = toExport.map(i => [
      i.product_code,
      i.product_name,
      i.category_name,
      VEL_CFG[i.velocity_class].label,
      i.days_to_stockout >= 9999 ? '—' : Math.round(i.days_to_stockout),
      i.current_stock.toFixed(2),
      Math.ceil(i.suggested_order_qty),
      i.uom_code,
      i.reorder_value.toFixed(2),
      STATUS_CFG[i.status].label,
      i.txn_count_last_30d,
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `reorder-list-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  return (
    <TooltipProvider>
      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Demand Forecast</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Focused on fast-moving items — what to reorder before you run out.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button onClick={exportCSV} variant="outline" size="sm" disabled={isLoading || summary.fm_critical + summary.fm_warning === 0}>
              <Download className="mr-1.5 h-4 w-4" />
              Export Reorder List
            </Button>
            <Button onClick={() => refetch()} variant="outline" size="sm" disabled={isLoading}>
              <RefreshCw className={`mr-1.5 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Settings — compact collapsible row */}
        <div className="border rounded-lg bg-muted/20">
          <button
            onClick={() => setSettingsOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-muted/30 transition-colors rounded-lg"
          >
            <span className="flex items-center gap-3 text-muted-foreground">
              <span><strong className="text-foreground">Lead time:</strong> {leadTime}d</span>
              <span className="text-border">·</span>
              <span><strong className="text-foreground">Order coverage:</strong> {forecastDays}d</span>
              <span className="text-border">·</span>
              <span><strong className="text-foreground">Service level:</strong> {serviceLevel}%</span>
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              Adjust settings
              {settingsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </span>
          </button>

          {settingsOpen && (
            <div className="px-4 pb-4 pt-1 border-t">
              <div className="flex flex-wrap gap-6 items-end pt-3">

                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lead Time (days)</Label>
                    <Tooltip>
                      <TooltipTrigger><Info className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                      <TooltipContent className="max-w-xs">Days from placing PO to receiving stock. Drives the Reorder Point. Adjust per supplier.</TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {[3, 5, 7, 14, 21, 30].map(d => (
                      <Button key={d} size="sm" variant={leadTime === d ? 'default' : 'outline'} onClick={() => setLeadTime(d)}>{d}d</Button>
                    ))}
                    <Input
                      type="number" className="w-16 h-8 text-sm" value={leadTime} min={1}
                      onChange={e => setLeadTime(Math.max(1, Number(e.target.value)))}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Order Coverage</Label>
                    <Tooltip>
                      <TooltipTrigger><Info className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                      <TooltipContent className="max-w-xs">How many days of stock to buy per order. Suggested qty covers this period + safety buffer.</TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="flex gap-1">
                    {[14, 30, 45, 60, 90].map(d => (
                      <Button key={d} size="sm" variant={forecastDays === d ? 'default' : 'outline'} onClick={() => setForecastDays(d)}>{d}d</Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Service Level</Label>
                    <Tooltip>
                      <TooltipTrigger><Info className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                      <TooltipContent className="max-w-xs">95% = avoid stockout 95% of the time. 99% adds more safety stock.</TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant={serviceLevel === 95 ? 'default' : 'outline'} onClick={() => setServiceLevel(95)}>95%</Button>
                    <Button size="sm" variant={serviceLevel === 99 ? 'default' : 'outline'} onClick={() => setServiceLevel(99)}>99%</Button>
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-5 text-destructive text-sm">
              Failed to load: {(error as any).message}
            </CardContent>
          </Card>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-muted-foreground">Analysing sales history…</span>
          </div>
        )}

        {!isLoading && !error && items.length > 0 && (
          <>
            {/* Urgent banner — only when critical fast movers exist */}
            {summary.fm_critical > 0 && (
              <div className="flex items-center gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3">
                <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
                <div className="flex-1 text-sm">
                  <span className="font-semibold text-red-900">{summary.fm_critical} fast-moving {summary.fm_critical === 1 ? 'product' : 'products'} need immediate reordering</span>
                  <span className="text-red-700"> — estimated {formatCurrency(summary.fm_reorder_val)} to replenish all critical + warning items.</span>
                </div>
              </div>
            )}

            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

              <Card className={`border-red-200 ${summary.fm_critical > 0 ? 'bg-red-50' : ''}`}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className={`h-4 w-4 ${summary.fm_critical > 0 ? 'text-red-600' : 'text-muted-foreground'}`} />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Reorder Now</span>
                  </div>
                  <div className={`text-3xl font-bold ${summary.fm_critical > 0 ? 'text-red-700' : 'text-foreground'}`}>{summary.fm_critical}</div>
                  <div className="text-xs text-muted-foreground">fast movers below ROP</div>
                </CardContent>
              </Card>

              <Card className={`border-amber-200 ${summary.fm_warning > 0 ? 'bg-amber-50' : ''}`}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className={`h-4 w-4 ${summary.fm_warning > 0 ? 'text-amber-600' : 'text-muted-foreground'}`} />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Order Soon</span>
                  </div>
                  <div className={`text-3xl font-bold ${summary.fm_warning > 0 ? 'text-amber-700' : 'text-foreground'}`}>{summary.fm_warning}</div>
                  <div className="text-xs text-muted-foreground">fast movers running low</div>
                </CardContent>
              </Card>

              <Card className="border-green-200 bg-green-50">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Well Stocked</span>
                  </div>
                  <div className="text-3xl font-bold text-green-700">{summary.fm_ok}</div>
                  <div className="text-xs text-muted-foreground">fast movers with healthy stock</div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <ShoppingCart className="h-4 w-4 text-primary" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Reorder Investment</span>
                  </div>
                  <div className="text-2xl font-bold text-primary">{formatCurrency(summary.fm_reorder_val)}</div>
                  <div className="text-xs text-muted-foreground">for fast movers only</div>
                </CardContent>
              </Card>

            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="fast-movers" className="gap-2">
                  <Zap className="h-3.5 w-3.5" />
                  Fast Movers
                  <span className="ml-1 px-1.5 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full font-medium">
                    {fastMovers.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="all">
                  All Products
                  <span className="ml-1 px-1.5 py-0.5 text-xs bg-muted text-muted-foreground rounded-full">
                    {items.length}
                  </span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="fast-movers" className="mt-4">
                <Card>
                  <CardHeader className="pb-0 pt-4">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Zap className="h-4 w-4 text-orange-500" />
                      Fast-Moving Products
                      <span className="text-sm font-normal text-muted-foreground">— sorted by days until stockout</span>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground pt-1">
                      High &amp; medium velocity items based on transaction frequency in the last 30 days. These are your bread-and-butter products — keep them stocked.
                    </p>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <ForecastTable
                      items={fastMovers}
                      leadTime={leadTime}
                      serviceLevel={serviceLevel}
                      forecastDays={forecastDays}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="all" className="mt-4">
                <Card>
                  <CardHeader className="pb-0 pt-4">
                    <CardTitle className="text-base">All Active Products</CardTitle>
                    <p className="text-xs text-muted-foreground pt-1">
                      Includes slow movers and no-movement items. Sorted by urgency (days to stockout).
                    </p>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <ForecastTable
                      items={allItems}
                      leadTime={leadTime}
                      serviceLevel={serviceLevel}
                      forecastDays={forecastDays}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* How it works footer */}
            <div className="rounded-lg border border-dashed bg-muted/20 px-5 py-4 text-sm text-muted-foreground">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="font-semibold text-foreground text-xs uppercase tracking-wide mb-1.5">Velocity Score</p>
                  <p><strong>Score</strong> = 70% sales frequency (txns last 30d) + 30% restock frequency (POs last 90d)</p>
                  <p className="mt-1"><strong>High</strong> = top 25% score · <strong>Medium</strong> = 40–75% · <strong>Low/None</strong> = infrequent</p>
                  <p className="mt-1">Products that sell often <em>and</em> get restocked often rank highest — true fast movers.</p>
                </div>
                <div>
                  <p className="font-semibold text-foreground text-xs uppercase tracking-wide mb-1.5">Reorder Formula</p>
                  <p><strong>Reorder Point</strong> = (Avg/Day × {leadTime}d) + Safety Stock</p>
                  <p><strong>Safety Stock</strong> = {serviceLevel === 95 ? '1.65' : '2.33'} × std dev × √{leadTime}</p>
                  <p><strong>Order Qty</strong> = ({forecastDays}d × Avg/Day) + Safety − on hand</p>
                </div>
                <div>
                  <p className="font-semibold text-foreground text-xs uppercase tracking-wide mb-1.5">Stock Health Bar</p>
                  <p><span className="text-red-600 font-medium">Red</span> = below reorder point — order immediately</p>
                  <p><span className="text-amber-600 font-medium">Amber</span> = 1–1.5× ROP — order soon</p>
                  <p><span className="text-green-600 font-medium">Green</span> = safely stocked above 1.5× ROP</p>
                </div>
              </div>
            </div>
          </>
        )}

        {!isLoading && !error && items.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>No active products with stock or sales data found.</p>
          </div>
        )}

      </div>
    </TooltipProvider>
  )
}
