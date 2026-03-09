'use client'

import { useState, useMemo } from 'react'
import { useSalesByProduct, useSalesByCategory } from '@/hooks/useDashboard'
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
  DollarSign,
  TrendingUp,
  TrendingDown,
  Percent,
  Loader2,
  RefreshCw,
  AlertCircle,
  BarChart3,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils/formatting'
import { getTodayPH } from '@/lib/utils/datetime'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'

// ─── Date preset helpers ──────────────────────────────────────────────────────

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
      return { from: getTodayPH(), to: getTodayPH() }
    case 'yesterday': {
      const yest = new Date(y, m, d - 1)
      return {
        from: formatLocalDate(yest.getFullYear(), yest.getMonth(), yest.getDate()),
        to: formatLocalDate(yest.getFullYear(), yest.getMonth(), yest.getDate()),
      }
    }
    case 'this_week': {
      const dow = now.getDay()
      const weekStart = new Date(y, m, d - dow)
      return {
        from: formatLocalDate(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()),
        to: getTodayPH(),
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
      return { from: formatLocalDate(y, m, 1), to: getTodayPH() }
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
        to: getTodayPH(),
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
      return { from: formatLocalDate(y, 0, 1), to: getTodayPH() }
    case 'last_year':
      return {
        from: formatLocalDate(y - 1, 0, 1),
        to: formatLocalDate(y - 1, 11, 31),
      }
    default:
      return { from: formatLocalDate(y, m, 1), to: getTodayPH() }
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

// ─── Margin badge ─────────────────────────────────────────────────────────────

function getMarginBadge(margin: number) {
  if (margin >= 30) return <Badge className="bg-green-600">Excellent ({margin.toFixed(1)}%)</Badge>
  if (margin >= 20) return <Badge className="bg-blue-600">Good ({margin.toFixed(1)}%)</Badge>
  if (margin >= 10) return <Badge variant="secondary">Fair ({margin.toFixed(1)}%)</Badge>
  return <Badge variant="destructive">Low ({margin.toFixed(1)}%)</Badge>
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProfitMarginPage() {
  const [selectedPreset, setSelectedPreset] = useState<string>('this_month')
  const [dateFrom, setDateFrom] = useState(() => getPresetRange('this_month').from)
  const [dateTo, setDateTo] = useState(() => getPresetRange('this_month').to)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const filters = {
    date_from: dateFrom,
    date_to: dateTo,
    category_id: categoryFilter && categoryFilter !== 'all' ? categoryFilter : undefined,
  }

  const applyPreset = (preset: string) => {
    setSelectedPreset(preset)
    if (preset !== 'custom') {
      const range = getPresetRange(preset)
      setDateFrom(range.from)
      setDateTo(range.to)
    }
  }

  const { data: categories } = useCategories()
  const {
    data: productData,
    isLoading: productsLoading,
    refetch: refetchProducts,
  } = useSalesByProduct(filters)
  const {
    data: categoryData,
    isLoading: categoriesLoading,
    refetch: refetchCategories,
  } = useSalesByCategory(filters)

  const isLoading = productsLoading || categoriesLoading

  const handleRefresh = () => {
    refetchProducts()
    refetchCategories()
  }

  // ── Summary calculations (weighted margin) ────────────────────────────────
  const summary = useMemo(() => {
    if (!productData) return null
    const totalRevenue = productData.reduce((sum, p) => sum + p.total_revenue, 0)
    const totalCost = productData.reduce((sum, p) => sum + p.total_cost, 0)
    const totalProfit = productData.reduce((sum, p) => sum + p.gross_profit, 0)
    return {
      totalRevenue,
      totalCost,
      totalProfit,
      avgMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
      highMarginProducts: productData.filter((p) => p.profit_margin >= 30).length,
      lowMarginProducts: productData.filter((p) => p.profit_margin < 10).length,
    }
  }, [productData])

  const filteredProducts = useMemo(
    () =>
      productData?.filter(
        (item) =>
          item.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.product_code.toLowerCase().includes(searchQuery.toLowerCase())
      ) ?? [],
    [productData, searchQuery]
  )

  const topPerformers = useMemo(
    () => [...filteredProducts].sort((a, b) => b.profit_margin - a.profit_margin).slice(0, 10),
    [filteredProducts]
  )

  const bottomPerformers = useMemo(
    () => [...filteredProducts].sort((a, b) => a.profit_margin - b.profit_margin).slice(0, 10),
    [filteredProducts]
  )

  const periodLabel = useMemo(() => {
    if (selectedPreset === 'custom') return `${dateFrom} → ${dateTo}`
    return DATE_PRESETS.find((p) => p.value === selectedPreset)?.label ?? ''
  }, [selectedPreset, dateFrom, dateTo])

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Profit Margin Analysis</h1>
          <p className="text-muted-foreground">
            Profitability breakdown by product and category · {periodLabel}
          </p>
        </div>
        <Button onClick={handleRefresh} variant="outline" size="sm" disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          {isLoading ? 'Loading...' : 'Refresh'}
        </Button>
      </div>

      {/* ── Filters ── */}
      <Card>
        <CardContent className="pt-4 space-y-4">
          {/* Date presets */}
          <div className="flex flex-wrap gap-2">
            {DATE_PRESETS.map((p) => (
              <Button
                key={p.value}
                size="sm"
                variant={selectedPreset === p.value ? 'default' : 'outline'}
                onClick={() => applyPreset(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value)
                  setSelectedPreset('custom')
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value)
                  setSelectedPreset('custom')
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
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
            <div className="space-y-2">
              <Label>Search Products</Label>
              <Input
                placeholder="Search by name or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Loading ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !productData || productData.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No sales data found</p>
            <p className="text-sm text-muted-foreground mt-1">
              Try selecting a different date range or category.
            </p>
          </CardContent>
        </Card>
      ) : summary ? (
        <>
          {/* ── Summary Cards ── */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Gross Profit</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div
                  className={`text-2xl font-bold ${summary.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}
                >
                  {formatCurrency(summary.totalProfit)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(summary.totalRevenue)} revenue
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Profit Margin</CardTitle>
                <Percent className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div
                  className={`text-2xl font-bold ${
                    summary.avgMargin >= 20
                      ? 'text-green-600'
                      : summary.avgMargin >= 10
                        ? 'text-blue-600'
                        : 'text-red-600'
                  }`}
                >
                  {summary.avgMargin.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">Weighted across all products</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">High Margin Products</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {summary.highMarginProducts}
                </div>
                <p className="text-xs text-muted-foreground">Excellent margin ≥30%</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Low Margin Products</CardTitle>
                <TrendingDown className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{summary.lowMarginProducts}</div>
                <p className="text-xs text-muted-foreground">Needs attention &lt;10%</p>
              </CardContent>
            </Card>
          </div>

          {/* ── Tabs ── */}
          <Tabs defaultValue="products" className="space-y-4">
            <TabsList>
              <TabsTrigger value="products">By Product</TabsTrigger>
              <TabsTrigger value="categories">By Category</TabsTrigger>
              <TabsTrigger value="top-bottom">Top & Bottom</TabsTrigger>
            </TabsList>

            {/* ── By Product ── */}
            <TabsContent value="products" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Product Margins</CardTitle>
                  <CardDescription>
                    {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''} ·
                    sorted by gross profit
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Qty Sold</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                          <TableHead className="text-right">Profit</TableHead>
                          <TableHead>Margin</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredProducts.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={6}
                              className="text-center text-muted-foreground py-8"
                            >
                              No products match your search
                            </TableCell>
                          </TableRow>
                        ) : (
                          [...filteredProducts]
                            .sort((a, b) => b.gross_profit - a.gross_profit)
                            .map((item) => (
                              <TableRow key={item.product_id}>
                                <TableCell>
                                  <div className="font-medium">{item.product_name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {item.product_code}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  {item.quantity_sold.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(item.total_revenue)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(item.total_cost)}
                                </TableCell>
                                <TableCell
                                  className={`text-right font-medium ${item.gross_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}
                                >
                                  {formatCurrency(item.gross_profit)}
                                </TableCell>
                                <TableCell>{getMarginBadge(item.profit_margin)}</TableCell>
                              </TableRow>
                            ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── By Category ── */}
            <TabsContent value="categories" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Margin by Category</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {categoryData && categoryData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={categoryData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="category_name"
                            angle={-45}
                            textAnchor="end"
                            height={80}
                          />
                          <YAxis tickFormatter={(v) => `${v}%`} />
                          <Tooltip
                            formatter={(value) => [
                              `${(value as number).toFixed(1)}%`,
                              'Margin',
                            ]}
                          />
                          <Bar
                            dataKey="profit_margin"
                            fill="#3b82f6"
                            radius={[4, 4, 0, 0]}
                            name="Margin %"
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                        No data available
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Category Performance</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {categoryData && categoryData.length > 0 ? (
                        [...categoryData]
                          .sort((a, b) => b.profit_margin - a.profit_margin)
                          .map((cat) => (
                            <div
                              key={cat.category_id}
                              className="flex items-center justify-between border-b pb-2 last:border-0"
                            >
                              <div>
                                <div className="font-medium">{cat.category_name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {formatCurrency(cat.total_revenue)} revenue
                                </div>
                              </div>
                              <div className="text-right">
                                <div
                                  className={`font-medium ${cat.gross_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}
                                >
                                  {formatCurrency(cat.gross_profit)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {cat.profit_margin.toFixed(1)}% margin
                                </div>
                              </div>
                            </div>
                          ))
                      ) : (
                        <div className="text-center text-muted-foreground">No data available</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Category breakdown table */}
              <Card>
                <CardHeader>
                  <CardTitle>Category Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                          <TableHead className="text-right">Gross Profit</TableHead>
                          <TableHead>Margin</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {categoryData && categoryData.length > 0 ? (
                          [...categoryData]
                            .sort((a, b) => b.gross_profit - a.gross_profit)
                            .map((cat) => (
                              <TableRow key={cat.category_id}>
                                <TableCell className="font-medium">{cat.category_name}</TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(cat.total_revenue)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(cat.total_cost)}
                                </TableCell>
                                <TableCell
                                  className={`text-right font-medium ${cat.gross_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}
                                >
                                  {formatCurrency(cat.gross_profit)}
                                </TableCell>
                                <TableCell>{getMarginBadge(cat.profit_margin)}</TableCell>
                              </TableRow>
                            ))
                        ) : (
                          <TableRow>
                            <TableCell
                              colSpan={5}
                              className="text-center text-muted-foreground py-8"
                            >
                              No category data available
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Top & Bottom ── */}
            <TabsContent value="top-bottom" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-green-600" />
                      Top 10 by Margin
                    </CardTitle>
                    <CardDescription>Highest margin products this period</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {topPerformers.length === 0 ? (
                        <p className="text-center text-muted-foreground py-4">No data</p>
                      ) : (
                        topPerformers.map((product, index) => (
                          <div
                            key={product.product_id}
                            className="flex items-center justify-between p-2 rounded-lg border"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-xs font-medium text-green-600">
                                {index + 1}
                              </div>
                              <div>
                                <div className="font-medium text-sm">{product.product_name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {formatCurrency(product.gross_profit)} profit
                                </div>
                              </div>
                            </div>
                            <Badge className="bg-green-600">
                              {product.profit_margin.toFixed(1)}%
                            </Badge>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-red-600" />
                      Bottom 10 by Margin
                    </CardTitle>
                    <CardDescription>Products that may need repricing or review</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {bottomPerformers.length === 0 ? (
                        <p className="text-center text-muted-foreground py-4">No data</p>
                      ) : (
                        bottomPerformers.map((product, index) => (
                          <div
                            key={product.product_id}
                            className="flex items-center justify-between p-2 rounded-lg border border-red-200"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-xs font-medium text-red-600">
                                {index + 1}
                              </div>
                              <div>
                                <div className="font-medium text-sm">{product.product_name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {formatCurrency(product.gross_profit)} profit
                                </div>
                              </div>
                            </div>
                            <Badge variant="destructive">
                              {product.profit_margin.toFixed(1)}%
                            </Badge>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Recommendations */}
              {(summary.lowMarginProducts > 0 || summary.highMarginProducts > 0) && (
                <Card>
                  <CardHeader>
                    <CardTitle>Recommendations</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {summary.lowMarginProducts > 0 && (
                      <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
                        <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                        <div>
                          <div className="font-medium text-red-900">Low Margin Alert</div>
                          <div className="text-sm text-red-700">
                            {summary.lowMarginProducts} product
                            {summary.lowMarginProducts !== 1 ? 's' : ''} have margins below 10%.
                            Consider reviewing pricing or sourcing from cheaper suppliers.
                          </div>
                        </div>
                      </div>
                    )}
                    {summary.highMarginProducts > 0 && (
                      <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3">
                        <TrendingUp className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                        <div>
                          <div className="font-medium text-green-900">High Performers</div>
                          <div className="text-sm text-green-700">
                            {summary.highMarginProducts} product
                            {summary.highMarginProducts !== 1 ? 's' : ''} have excellent margins
                            (≥30%). Focus on promoting these to maximize profitability.
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </div>
  )
}
