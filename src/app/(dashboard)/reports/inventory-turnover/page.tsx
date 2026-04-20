'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
  BarChart3,
  TrendingUp,
  TrendingDown,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Search,
  ArrowUpDown,
  Package,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils/formatting'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TurnoverItem {
  product_id: string
  product_code: string
  product_name: string
  category_name: string
  uom: string
  current_stock: number
  units_sold: number            // quantity sold (forward sales only) in period
  cogs_sold: number             // total COGS of goods sold
  avg_stock: number             // (beginning_stock + current_stock) / 2
  turnover_ratio: number        // units_sold / avg_stock
  days_in_inventory: number     // days / turnover_ratio  (∞ → period days if no sales)
  inventory_value: number       // current_stock × cogs_per_unit
  status: 'fast' | 'normal' | 'slow' | 'dead' | 'no_stock'
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  fast:     { label: 'Fast Mover',  variant: 'default'     as const, color: 'text-green-600',  bg: 'bg-green-100',  border: 'border-green-200' },
  normal:   { label: 'Normal',      variant: 'secondary'   as const, color: 'text-blue-600',   bg: 'bg-blue-50',    border: 'border-blue-200'  },
  slow:     { label: 'Slow Mover',  variant: 'secondary'   as const, color: 'text-amber-600',  bg: 'bg-amber-50',   border: 'border-amber-200' },
  dead:     { label: 'Dead Stock',  variant: 'destructive' as const, color: 'text-red-600',    bg: 'bg-red-50',     border: 'border-red-200'   },
  no_stock: { label: 'No Stock',    variant: 'outline'     as const, color: 'text-gray-400',   bg: 'bg-gray-50',    border: 'border-gray-200'  },
}

function getStatus(daysInInventory: number, currentStock: number, unitsSold: number, period: number): TurnoverItem['status'] {
  if (currentStock <= 0 && unitsSold === 0) return 'no_stock'
  if (unitsSold === 0) return 'dead'
  // Classify relative to the analysis period
  if (daysInInventory <= period * 0.25)  return 'fast'
  if (daysInInventory <= period * 0.6)   return 'normal'
  if (daysInInventory <= period)         return 'slow'
  return 'dead'
}

// ── Data fetching (no RPC — direct table queries) ─────────────────────────────

async function fetchTurnoverData(days: number): Promise<TurnoverItem[]> {
  const supabase = getClient()

  const endDate   = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  // Single RPC call — Postgres does all joins + aggregation server-side.
  // Returns one row per product (no row-limit truncation risk).
  const { data, error } = await supabase.rpc('get_inventory_turnover_v2', {
    p_start_date: startDate.toISOString(),
    p_end_date:   endDate.toISOString(),
  })

  if (error) throw error

  return ((data as any[]) || []).map(row => {
    const currentStock   = Number(row.current_stock  || 0)
    const unitsSold      = Number(row.units_sold     || 0)
    const netChange      = Number(row.net_change     || 0)
    const cogsPerUnit    = Number(row.latest_cogs    || 0)

    // beginning_stock = what stock was at start of period
    // current = beginning + net_change  →  beginning = current − net_change
    const beginningStock = Math.max(0, currentStock - netChange)
    const avgStock       = (beginningStock + currentStock) / 2

    const turnoverRatio   = avgStock > 0 ? unitsSold / avgStock : 0
    const daysInInventory = turnoverRatio > 0 ? days / turnoverRatio : days * 10

    const status = getStatus(daysInInventory, currentStock, unitsSold, days)

    return {
      product_id:        row.product_id,
      product_code:      row.product_code || '—',
      product_name:      row.product_name,
      category_name:     row.category_name || 'Uncategorized',
      uom:               row.uom_code      || 'pc',
      current_stock:     currentStock,
      units_sold:        unitsSold,
      cogs_sold:         unitsSold * cogsPerUnit,
      avg_stock:         avgStock,
      turnover_ratio:    turnoverRatio,
      days_in_inventory: daysInInventory,
      inventory_value:   currentStock * cogsPerUnit,
      status,
    } satisfies TurnoverItem
  })
}

// ── Page ──────────────────────────────────────────────────────────────────────

type SortKey = 'turnover_ratio' | 'days_in_inventory' | 'units_sold' | 'inventory_value' | 'current_stock'
type SortDir = 'asc' | 'desc'

export default function InventoryTurnoverPage() {
  const [days,        setDays]        = useState(90)
  const [search,      setSearch]      = useState('')
  const [statusFilter,setStatusFilter]= useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [sortKey,     setSortKey]     = useState<SortKey>('turnover_ratio')
  const [sortDir,     setSortDir]     = useState<SortDir>('desc')

  const { data: items = [], isLoading, error, refetch } = useQuery({
    queryKey: ['inventory-turnover', days],
    queryFn:  () => fetchTurnoverData(days),
    staleTime: 5 * 60 * 1000,
  })

  // Derived categories list
  const categories = useMemo(() => {
    const set = new Set(items.map(i => i.category_name))
    return Array.from(set).sort()
  }, [items])

  // Summary
  const summary = useMemo(() => {
    const active = items.filter(i => i.status !== 'no_stock')
    return {
      total:      items.length,
      fast:       items.filter(i => i.status === 'fast').length,
      normal:     items.filter(i => i.status === 'normal').length,
      slow:       items.filter(i => i.status === 'slow').length,
      dead:       items.filter(i => i.status === 'dead').length,
      no_stock:   items.filter(i => i.status === 'no_stock').length,
      avg_ratio:  active.length ? active.reduce((s, i) => s + i.turnover_ratio, 0) / active.length : 0,
      avg_days:   active.filter(i => i.units_sold > 0).length
        ? active.filter(i => i.units_sold > 0).reduce((s, i) => s + i.days_in_inventory, 0) / active.filter(i => i.units_sold > 0).length
        : 0,
      total_value: items.reduce((s, i) => s + i.inventory_value, 0),
    }
  }, [items])

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

    if (statusFilter !== 'all') {
      result = result.filter(i => i.status === statusFilter)
    }

    if (categoryFilter !== 'all') {
      result = result.filter(i => i.category_name === categoryFilter)
    }

    result = [...result].sort((a, b) => {
      const va = a[sortKey]
      const vb = b[sortKey]
      return sortDir === 'desc' ? vb - va : va - vb
    })

    return result
  }, [items, search, statusFilter, categoryFilter, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k
      ? <ArrowUpDown className={`h-3 w-3 ml-1 inline ${sortDir === 'desc' ? 'text-primary' : 'text-primary rotate-180'}`} />
      : <ArrowUpDown className="h-3 w-3 ml-1 inline opacity-30" />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Inventory Turnover</h1>
          <p className="text-muted-foreground">How efficiently is each product moving?</p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm" disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap gap-4 items-end">
            {/* Period toggle */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Time Period</p>
              <div className="flex gap-1">
                {[30, 60, 90, 180, 365].map(d => (
                  <Button key={d} variant={days === d ? 'default' : 'outline'} size="sm" onClick={() => setDays(d)}>
                    {d}d
                  </Button>
                ))}
              </div>
            </div>

            {/* Search */}
            <div className="flex-1 min-w-[200px] space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Search</p>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Product name, code, or category…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>

            {/* Status filter */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</p>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="fast">Fast Mover</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="slow">Slow Mover</SelectItem>
                  <SelectItem value="dead">Dead Stock</SelectItem>
                  <SelectItem value="no_stock">No Stock</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Category filter */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Category</p>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error state */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-destructive text-sm">
            Failed to load data: {(error as any).message}
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-3 text-muted-foreground">Crunching inventory data…</span>
        </div>
      )}

      {!isLoading && !error && items.length > 0 && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-5">
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Avg Turnover</div>
                <div className="text-2xl font-bold mt-1">{summary.avg_ratio.toFixed(2)}×</div>
                <div className="text-xs text-muted-foreground">times per {days}d period</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Avg Days to Sell</div>
                <div className="text-2xl font-bold mt-1">{summary.avg_days.toFixed(0)} days</div>
                <div className="text-xs text-muted-foreground">for products with sales</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Inventory Value</div>
                <div className="text-2xl font-bold mt-1 text-primary">{formatCurrency(summary.total_value)}</div>
                <div className="text-xs text-muted-foreground">at cost (COGS)</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Movement Breakdown</div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-green-600 font-bold text-lg">{summary.fast}</span><span className="text-xs text-muted-foreground">fast</span>
                  <span className="text-amber-600 font-bold text-lg">{summary.slow}</span><span className="text-xs text-muted-foreground">slow</span>
                  <span className="text-red-600 font-bold text-lg">{summary.dead}</span><span className="text-xs text-muted-foreground">dead</span>
                </div>
                <div className="text-xs text-muted-foreground">{summary.normal} normal · {summary.no_stock} no stock</div>
              </CardContent>
            </Card>
          </div>

          {/* Status Pills summary bar */}
          <div className="flex flex-wrap gap-2">
            {(['fast','normal','slow','dead'] as const).map(s => {
              const cfg = STATUS_CONFIG[s]
              const count = summary[s]
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    statusFilter === s
                      ? `${cfg.bg} ${cfg.color} ${cfg.border} border`
                      : 'bg-muted border-transparent hover:border-border'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${cfg.bg} border ${cfg.border}`} />
                  {cfg.label}: {count}
                </button>
              )
            })}
          </div>

          {/* Main Table */}
          <Card>
            <CardHeader>
              <CardTitle>Product Turnover Details</CardTitle>
              <CardDescription>
                Showing {filtered.length} of {items.length} products · {days}-day period
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filtered.length === 0 ? (
                <div className="text-center py-10">
                  <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No products match your filters.</p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead>Product</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead
                          className="text-right cursor-pointer hover:text-primary select-none"
                          onClick={() => toggleSort('current_stock')}
                        >
                          Stock <SortIcon k="current_stock" />
                        </TableHead>
                        <TableHead
                          className="text-right cursor-pointer hover:text-primary select-none"
                          onClick={() => toggleSort('units_sold')}
                        >
                          Sold ({days}d) <SortIcon k="units_sold" />
                        </TableHead>
                        <TableHead
                          className="text-right cursor-pointer hover:text-primary select-none"
                          onClick={() => toggleSort('turnover_ratio')}
                        >
                          Turnover <SortIcon k="turnover_ratio" />
                        </TableHead>
                        <TableHead
                          className="text-right cursor-pointer hover:text-primary select-none"
                          onClick={() => toggleSort('days_in_inventory')}
                        >
                          Days to Sell <SortIcon k="days_in_inventory" />
                        </TableHead>
                        <TableHead
                          className="text-right cursor-pointer hover:text-primary select-none"
                          onClick={() => toggleSort('inventory_value')}
                        >
                          Stock Value <SortIcon k="inventory_value" />
                        </TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map(item => {
                        const cfg = STATUS_CONFIG[item.status]
                        return (
                          <TableRow key={item.product_id}>
                            <TableCell>
                              <div className="font-medium">{item.product_name}</div>
                              <div className="text-xs text-muted-foreground font-mono">{item.product_code}</div>
                            </TableCell>
                            <TableCell className="text-sm">{item.category_name}</TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {item.current_stock.toLocaleString()}
                              <span className="text-xs text-muted-foreground ml-1">{item.uom}</span>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {item.units_sold > 0
                                ? <>{item.units_sold.toLocaleString()} <span className="text-xs text-muted-foreground">{item.uom}</span></>
                                : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {item.units_sold > 0 ? `${item.turnover_ratio.toFixed(2)}×` : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-right">
                              {item.units_sold > 0
                                ? <span className={item.days_in_inventory > days ? 'text-red-600 font-medium' : ''}>
                                    {Math.min(item.days_in_inventory, days * 10).toFixed(0)}d
                                  </span>
                                : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {item.inventory_value > 0 ? formatCurrency(item.inventory_value) : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell>
                              <Badge variant={cfg.variant} className={`${cfg.color} whitespace-nowrap`}>
                                {cfg.label}
                              </Badge>
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

          {/* Recommendations */}
          <div className="space-y-3">
            {summary.dead > 0 && (
              <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
                <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold text-red-900">Dead Stock — {summary.dead} products</div>
                  <div className="text-sm text-red-700 mt-0.5">
                    These items have not moved in over {days} days. Consider running promotions, bundling with fast movers, or marking them down to free up capital.
                  </div>
                </div>
              </div>
            )}
            {summary.slow > 3 && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <TrendingDown className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold text-amber-900">Slow Movers — {summary.slow} products</div>
                  <div className="text-sm text-amber-700 mt-0.5">
                    Moving slower than expected for the {days}-day window. Review pricing vs. competitors, or reduce reorder quantities until demand improves.
                  </div>
                </div>
              </div>
            )}
            {summary.fast > 0 && (
              <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
                <TrendingUp className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold text-green-900">Fast Movers — {summary.fast} products</div>
                  <div className="text-sm text-green-700 mt-0.5">
                    Selling quickly. Make sure reorder points and stock levels are high enough to avoid stockouts on these items.
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {!isLoading && !error && items.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>No products with inventory or sales data found.</p>
        </div>
      )}
    </div>
  )
}
