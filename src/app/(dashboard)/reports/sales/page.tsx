'use client'

import { useState, useMemo } from 'react'
import { useSalesByProduct, useSalesByCategory, useSalesTrendByDateRange } from '@/hooks/useDashboard'
import { useCategories } from '@/hooks/useProducts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  BarChart3,
  DollarSign,
  Loader2,
  Package,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Calendar,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils/formatting'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'

const COLORS = ['#3b82f6', '#22c55e', '#eab308', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

// ─── Date preset helpers ──────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function formatLocalDate(year: number, month: number, day: number): string {
  const yyyy = year.toString()
  const mm = (month + 1).toString().padStart(2, '0')
  const dd = day.toString().padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function getPresetRange(preset: string): { from: string; to: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()

  switch (preset) {
    case 'today':
      return { from: todayStr(), to: todayStr() }
    case 'yesterday': {
      const yest = new Date(y, m, d - 1)
      return { 
        from: formatLocalDate(yest.getFullYear(), yest.getMonth(), yest.getDate()), 
        to: formatLocalDate(yest.getFullYear(), yest.getMonth(), yest.getDate()) 
      }
    }
    case 'this_week': {
      const dow = now.getDay() // 0=Sun
      const weekStart = new Date(y, m, d - dow)
      return { 
        from: formatLocalDate(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()), 
        to: todayStr() 
      }
    }
    case 'last_week': {
      const dow = now.getDay()
      const prevSun = new Date(y, m, d - dow - 7)
      const prevSat = new Date(y, m, d - dow - 1)
      return {
        from: formatLocalDate(prevSun.getFullYear(), prevSun.getMonth(), prevSun.getDate()),
        to: formatLocalDate(prevSat.getFullYear(), prevSat.getMonth(), prevSat.getDate()),
      }
    }
    case 'this_month':
      return {
        from: formatLocalDate(y, m, 1),
        to: todayStr(),
      }
    case 'last_month': {
      const firstOfLast = new Date(y, m - 1, 1)
      const lastOfLast = new Date(y, m, 0)
      return {
        from: formatLocalDate(firstOfLast.getFullYear(), firstOfLast.getMonth(), firstOfLast.getDate()),
        to: formatLocalDate(lastOfLast.getFullYear(), lastOfLast.getMonth(), lastOfLast.getDate()),
      }
    }
    case 'this_quarter': {
      const qStart = new Date(y, Math.floor(m / 3) * 3, 1)
      return { 
        from: formatLocalDate(qStart.getFullYear(), qStart.getMonth(), qStart.getDate()), 
        to: todayStr() 
      }
    }
    case 'last_quarter': {
      const thisQStart = Math.floor(m / 3) * 3
      const lqStart = new Date(y, thisQStart - 3, 1)
      const lqEnd = new Date(y, thisQStart, 0)
      return {
        from: formatLocalDate(lqStart.getFullYear(), lqStart.getMonth(), lqStart.getDate()),
        to: formatLocalDate(lqEnd.getFullYear(), lqEnd.getMonth(), lqEnd.getDate()),
      }
    }
    case 'this_year':
      return {
        from: formatLocalDate(y, 0, 1),
        to: todayStr(),
      }
    case 'last_year':
      return {
        from: formatLocalDate(y - 1, 0, 1),
        to: formatLocalDate(y - 1, 11, 31),
      }
    default:
      return {
        from: new Date(y, m, 1).toISOString().split('T')[0],
        to: todayStr(),
      }
  }
}

const DATE_PRESETS = [
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'This Week', value: 'this_week' },
  { label: 'Last Week', value: 'last_week' },
  { label: 'This Month', value: 'this_month' },
  { label: 'Last Month', value: 'last_month' },
  { label: 'This Quarter', value: 'this_quarter' },
  { label: 'Last Quarter', value: 'last_quarter' },
  { label: 'This Year', value: 'this_year' },
  { label: 'Last Year', value: 'last_year' },
  { label: 'Custom', value: 'custom' },
]

// ─── Trend chart tooltip ──────────────────────────────────────────────────────
function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-background p-3 shadow-md text-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  )
}

// ─── Summary card ─────────────────────────────────────────────────────────────
function SummaryCard({
  title,
  value,
  sub,
  icon,
  highlight,
  trend,
}: {
  title: string
  value: string
  sub: string
  icon: React.ReactNode
  highlight?: 'green' | 'red' | 'blue'
  trend?: number
}) {
  const valueColor =
    highlight === 'green'
      ? 'text-green-600'
      : highlight === 'red'
      ? 'text-red-600'
      : highlight === 'blue'
      ? 'text-blue-600'
      : ''
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${valueColor}`}>{value}</div>
        <div className="flex items-center gap-1 mt-1">
          <p className="text-xs text-muted-foreground">{sub}</p>
          {trend !== undefined && (
            <span
              className={`text-xs font-medium ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}
            >
              {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}%
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SalesReportPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'product' | 'category'>('overview')

  // Default to this month
  const [selectedPreset, setSelectedPreset] = useState<string>('this_month')
  const [dateFrom, setDateFrom] = useState(() => getPresetRange('this_month').from)
  const [dateTo, setDateTo] = useState(() => getPresetRange('this_month').to)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  const filters = {
    date_from: dateFrom,
    date_to: dateTo,
    category_id: categoryFilter && categoryFilter !== 'all' ? categoryFilter : undefined,
  }

  const { data: categories } = useCategories()

  const {
    data: productData,
    isLoading: productLoading,
    refetch: refetchProducts,
  } = useSalesByProduct(filters)

  const {
    data: categoryData,
    isLoading: categoryLoading,
    refetch: refetchCategories,
  } = useSalesByCategory(filters)

  const {
    data: trendData,
    isLoading: trendLoading,
    refetch: refetchTrend,
  } = useSalesTrendByDateRange(dateFrom, dateTo)

  const isLoading = productLoading || categoryLoading || trendLoading

  const handleRefresh = () => {
    refetchProducts()
    refetchCategories()
    refetchTrend()
  }

  const applyPreset = (preset: string) => {
    setSelectedPreset(preset)
    if (preset !== 'custom') {
      const range = getPresetRange(preset)
      setDateFrom(range.from)
      setDateTo(range.to)
    }
  }

  // ── Summary calculations ──────────────────────────────────────────────────
  const summary = useMemo(
    () =>
      productData?.reduce(
        (acc, p) => ({
          revenue: acc.revenue + p.total_revenue,
          cost: acc.cost + p.total_cost,
          profit: acc.profit + p.gross_profit,
          qty: acc.qty + p.quantity_sold,
        }),
        { revenue: 0, cost: 0, profit: 0, qty: 0 }
      ) ?? { revenue: 0, cost: 0, profit: 0, qty: 0 },
    [productData]
  )

  const overallMargin = summary.revenue > 0 ? (summary.profit / summary.revenue) * 100 : 0

  // ── Trend chart data (skip days with 0 if range > 60 days, label short) ──
  const trendChartData = useMemo(() => {
    if (!trendData) return []
    return trendData.map((d) => ({
      date: d.date,
      label: new Date(d.date + 'T00:00:00').toLocaleDateString('en-PH', {
        month: 'short',
        day: 'numeric',
      }),
      Revenue: d.revenue,
      Profit: d.profit,
      transactions: d.transactions,
    }))
  }, [trendData])

  const trendDays = trendChartData.length
  const xTickInterval = trendDays <= 14 ? 0 : trendDays <= 31 ? 2 : trendDays <= 92 ? 6 : 14

  // ── Category chart data ───────────────────────────────────────────────────
  const categoryChartData = useMemo(
    () =>
      categoryData?.slice(0, 8).map((c, i) => ({
        name:
          c.category_name.length > 15 ? c.category_name.slice(0, 15) + '…' : c.category_name,
        revenue: c.total_revenue,
        profit: c.gross_profit,
        fill: COLORS[i % COLORS.length],
      })) ?? [],
    [categoryData]
  )

  // ── Period label ──────────────────────────────────────────────────────────
  const periodLabel = useMemo(() => {
    const preset = DATE_PRESETS.find((p) => p.value === selectedPreset)
    if (selectedPreset === 'custom') return `${dateFrom} → ${dateTo}`
    return preset?.label ?? ''
  }, [selectedPreset, dateFrom, dateTo])

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Sales Report</h1>
          <p className="text-muted-foreground text-sm">
            Revenue, cost &amp; profit analysis · {periodLabel}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh
        </Button>
      </div>

      {/* ── Date Presets + Filters ── */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          {/* Preset pills */}
          <div className="flex flex-wrap gap-2">
            {DATE_PRESETS.map((preset) => (
              <Button
                key={preset.value}
                variant={selectedPreset === preset.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => applyPreset(preset.value)}
                className="h-8"
              >
                {preset.value === 'custom' && <Calendar className="h-3 w-3 mr-1" />}
                {preset.label}
              </Button>
            ))}
          </div>

          {/* Custom date + category filter */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">From Date</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value)
                  setSelectedPreset('custom')
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To Date</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value)
                  setSelectedPreset('custom')
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories?.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => {
                  applyPreset('this_month')
                  setCategoryFilter('all')
                }}
              >
                Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Summary Cards ── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Total Revenue"
          value={formatCurrency(summary.revenue)}
          sub={`${summary.qty.toLocaleString()} units sold`}
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
          highlight="blue"
        />
        <SummaryCard
          title="Total Cost (COGS)"
          value={formatCurrency(summary.cost)}
          sub="Cost at time of sale"
          icon={<Package className="h-4 w-4 text-muted-foreground" />}
        />
        <SummaryCard
          title="Gross Profit"
          value={formatCurrency(summary.profit)}
          sub="Revenue minus COGS"
          icon={<TrendingUp className="h-4 w-4 text-green-500" />}
          highlight={summary.profit >= 0 ? 'green' : 'red'}
        />
        <SummaryCard
          title="Profit Margin"
          value={formatPercent(overallMargin)}
          sub="Overall gross margin"
          icon={<BarChart3 className="h-4 w-4 text-muted-foreground" />}
          highlight={overallMargin >= 20 ? 'green' : overallMargin >= 10 ? undefined : 'red'}
        />
      </div>

      {/* ── Report Tabs ── */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="product">By Product</TabsTrigger>
          <TabsTrigger value="category">By Category</TabsTrigger>
        </TabsList>

        {/* ─── OVERVIEW TAB ──────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-4">
          {/* Daily Trend Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Daily Sales Trend</CardTitle>
              <CardDescription>
                Revenue and gross profit per day · {periodLabel}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {trendLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : trendChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={trendChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="profGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      interval={xTickInterval}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v) =>
                        v >= 1000 ? `₱${(v / 1000).toFixed(0)}k` : `₱${v}`
                      }
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={60}
                    />
                    <Tooltip content={<TrendTooltip />} />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="Revenue"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fill="url(#revGrad)"
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="Profit"
                      stroke="#22c55e"
                      strokeWidth={2}
                      fill="url(#profGrad)"
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                  No data for this period
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top 10 Products table (quick view in overview) */}
          <Card>
            <CardHeader>
              <CardTitle>Top Products</CardTitle>
              <CardDescription>Top 10 by revenue for the selected period</CardDescription>
            </CardHeader>
            <CardContent>
              {productLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : productData && productData.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Profit</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productData.slice(0, 10).map((product, idx) => (
                      <TableRow key={product.product_id}>
                        <TableCell className="text-muted-foreground text-sm">{idx + 1}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{product.product_name}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {product.product_code}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{product.quantity_sold}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(product.total_revenue)}
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          {formatCurrency(product.gross_profit)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={product.profit_margin >= 20 ? 'default' : 'secondary'}
                            className={product.profit_margin >= 20 ? 'bg-green-500' : ''}
                          >
                            {formatPercent(product.profit_margin)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No sales data for this period
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── BY PRODUCT TAB ────────────────────────────────────────────── */}
        <TabsContent value="product" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Sales by Product</CardTitle>
              <CardDescription>
                Complete breakdown — revenue, cost &amp; profit per product
              </CardDescription>
            </CardHeader>
            <CardContent>
              {productLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : productData && productData.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Qty Sold</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">COGS</TableHead>
                      <TableHead className="text-right">Gross Profit</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productData.map((product) => (
                      <TableRow key={product.product_id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{product.product_name}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {product.product_code}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{product.category_name}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{product.quantity_sold}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(product.total_revenue)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatCurrency(product.total_cost)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-medium ${
                            product.gross_profit >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {formatCurrency(product.gross_profit)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={product.profit_margin >= 20 ? 'default' : 'secondary'}
                            className={product.profit_margin >= 20 ? 'bg-green-500' : ''}
                          >
                            {formatPercent(product.profit_margin)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-12">
                  <Package className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-medium">No sales data</h3>
                  <p className="text-muted-foreground">No sales found for the selected period</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── BY CATEGORY TAB ───────────────────────────────────────────── */}
        <TabsContent value="category" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Revenue pie */}
            <Card>
              <CardHeader>
                <CardTitle>Revenue by Category</CardTitle>
                <CardDescription>Distribution of total revenue</CardDescription>
              </CardHeader>
              <CardContent>
                {categoryLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : categoryChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={categoryChartData}
                        dataKey="revenue"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ name, percent }) =>
                          `${name} (${((percent || 0) * 100).toFixed(0)}%)`
                        }
                      >
                        {categoryChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatCurrency(value as number)} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                    No data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Profit bar */}
            <Card>
              <CardHeader>
                <CardTitle>Profit by Category</CardTitle>
                <CardDescription>Gross profit comparison</CardDescription>
              </CardHeader>
              <CardContent>
                {categoryLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : categoryChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={categoryChartData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        type="number"
                        tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={100}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip formatter={(value) => formatCurrency(value as number)} />
                      <Bar dataKey="profit" fill="#22c55e" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                    No data available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Category table */}
          <Card>
            <CardHeader>
              <CardTitle>Sales by Category</CardTitle>
              <CardDescription>Revenue, cost &amp; profit per category</CardDescription>
            </CardHeader>
            <CardContent>
              {categoryLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : categoryData && categoryData.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Products</TableHead>
                      <TableHead className="text-right">Qty Sold</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">COGS</TableHead>
                      <TableHead className="text-right">Gross Profit</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categoryData.map((category, index) => (
                      <TableRow key={category.category_id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: COLORS[index % COLORS.length] }}
                            />
                            {category.category_name}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">{category.product_count}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{category.quantity_sold}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(category.total_revenue)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatCurrency(category.total_cost)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-medium ${
                            category.gross_profit >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {formatCurrency(category.gross_profit)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={category.profit_margin >= 20 ? 'default' : 'secondary'}
                            className={category.profit_margin >= 20 ? 'bg-green-500' : ''}
                          >
                            {formatPercent(category.profit_margin)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-12">
                  <Package className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-medium">No sales data</h3>
                  <p className="text-muted-foreground">No sales found for the selected period</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
