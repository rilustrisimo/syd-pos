'use client'

import { useState } from 'react'
import { useDemandForecast } from '@/hooks/useDashboard'
import { useCategories } from '@/hooks/useProducts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
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
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Loader2,
  Package,
  PackageX,
  RefreshCw,
  ShoppingCart,
  Timer,
  TrendingUp,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils/formatting'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts'

const URGENCY_COLORS = {
  critical: '#ef4444',
  soon: '#eab308',
  ok: '#22c55e',
}

export default function DemandForecastPage() {
  const [activeTab, setActiveTab] = useState<'reorder' | 'velocity'>('reorder')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')

  const filters = {
    category_id: categoryFilter || undefined,
  }

  const { data: categories } = useCategories()
  const { data, isLoading, refetch } = useDemandForecast(filters)

  // Filter by search
  const filteredData = data?.filter(item =>
    item.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.product_code.toLowerCase().includes(searchQuery.toLowerCase())
  ) || []

  // Summary calculations
  const needReorder = filteredData.filter(i => i.urgency === 'critical' || i.urgency === 'soon').length
  const outOfStock = filteredData.filter(i => i.current_stock <= 0).length
  const avgDaysToStockout = filteredData.length > 0
    ? filteredData
        .filter(i => i.days_to_stockout < 999)
        .reduce((sum, i) => sum + i.days_to_stockout, 0) /
      (filteredData.filter(i => i.days_to_stockout < 999).length || 1)
    : 0
  const totalReorderCost = filteredData
    .filter(i => i.urgency === 'critical' || i.urgency === 'soon')
    .reduce((sum, i) => sum + i.estimated_reorder_cost, 0)

  // Chart data - top 10 products closest to stockout (that have sales)
  const stockoutChartData = filteredData
    .filter(i => i.days_to_stockout < 999 && i.avg_daily_sales_30d > 0)
    .slice(0, 10)
    .map(i => ({
      name: i.product_name.length > 18 ? i.product_name.slice(0, 18) + '...' : i.product_name,
      days: Math.round(i.days_to_stockout),
      urgency: i.urgency,
    }))

  const getUrgencyBadge = (urgency: string) => {
    switch (urgency) {
      case 'critical':
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            Critical
          </Badge>
        )
      case 'soon':
        return (
          <Badge variant="secondary" className="gap-1 bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
            <Timer className="h-3 w-3" />
            Reorder Soon
          </Badge>
        )
      default:
        return (
          <Badge variant="secondary" className="gap-1 bg-green-100 text-green-800 hover:bg-green-100">
            OK
          </Badge>
        )
    }
  }

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <ArrowUp className="h-4 w-4 text-green-600" />
      case 'down':
        return <ArrowDown className="h-4 w-4 text-red-500" />
      default:
        return <ArrowRight className="h-4 w-4 text-muted-foreground" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Demand Forecast & Reorder</h1>
          <p className="text-muted-foreground">
            Sales velocity analysis and reorder suggestions
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Categories</SelectItem>
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
            <div className="flex items-end">
              <Button
                variant="secondary"
                onClick={() => {
                  setCategoryFilter('')
                  setSearchQuery('')
                }}
              >
                Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Needs Reorder</CardTitle>
            <ShoppingCart className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{needReorder}</div>
            <p className="text-xs text-muted-foreground">Products to reorder</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Days to Stockout</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgDaysToStockout.toFixed(0)} days</div>
            <p className="text-xs text-muted-foreground">Across active products</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Out of Stock</CardTitle>
            <PackageX className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{outOfStock}</div>
            <p className="text-xs text-muted-foreground">Zero inventory</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reorder Cost</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalReorderCost)}</div>
            <p className="text-xs text-muted-foreground">Estimated total</p>
          </CardContent>
        </Card>
      </div>

      {/* Stockout Timeline Chart */}
      {stockoutChartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Days to Stockout</CardTitle>
            <CardDescription>Products closest to running out of stock</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stockoutChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" label={{ value: 'Days', position: 'insideBottom', offset: -5 }} />
                <YAxis dataKey="name" type="category" width={140} />
                <Tooltip formatter={(value) => [`${value} days`, 'Days to Stockout']} />
                <Bar dataKey="days" radius={[0, 4, 4, 0]}>
                  {stockoutChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={URGENCY_COLORS[entry.urgency as keyof typeof URGENCY_COLORS]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Report Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'reorder' | 'velocity')}>
        <TabsList>
          <TabsTrigger value="reorder">Reorder Suggestions</TabsTrigger>
          <TabsTrigger value="velocity">Sales Velocity</TabsTrigger>
        </TabsList>

        <TabsContent value="reorder" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Reorder Suggestions</CardTitle>
              <CardDescription>
                Products that need restocking based on sales velocity and current inventory.
                Showing {filteredData.filter(i => i.urgency !== 'ok' || i.current_stock <= 0).length} products needing attention.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : filteredData.filter(i => i.urgency !== 'ok' || i.current_stock <= 0).length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">Daily Sales</TableHead>
                      <TableHead className="text-right">Days Left</TableHead>
                      <TableHead className="text-right">Reorder Qty</TableHead>
                      <TableHead className="text-right">Est. Cost</TableHead>
                      <TableHead>Urgency</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredData
                      .filter(i => i.urgency !== 'ok' || i.current_stock <= 0)
                      .map((item) => (
                        <TableRow key={item.product_id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{item.product_name}</p>
                              <p className="text-xs text-muted-foreground font-mono">
                                {item.product_code}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{item.category_name}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={item.current_stock <= 0 ? 'text-red-600 font-medium' : ''}>
                              {item.current_stock.toLocaleString()}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            {item.avg_daily_sales_30d.toFixed(1)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={
                              item.days_to_stockout <= 7 ? 'text-red-600 font-medium' :
                              item.days_to_stockout <= 14 ? 'text-yellow-600 font-medium' : ''
                            }>
                              {item.days_to_stockout >= 999 ? '-' : `${Math.round(item.days_to_stockout)}d`}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {item.suggested_reorder_qty.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {formatCurrency(item.estimated_reorder_cost)}
                          </TableCell>
                          <TableCell>
                            {getUrgencyBadge(item.urgency)}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-12">
                  <Package className="mx-auto h-12 w-12 text-green-500" />
                  <h3 className="mt-4 text-lg font-medium">All stocked up</h3>
                  <p className="text-muted-foreground">
                    No products need reordering at this time
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="velocity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Sales Velocity</CardTitle>
              <CardDescription>
                Average daily sales over different time periods with trend analysis.
                Showing {filteredData.filter(i => i.avg_daily_sales_90d > 0).length} products with sales history.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : filteredData.filter(i => i.avg_daily_sales_90d > 0).length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">7-Day Avg</TableHead>
                      <TableHead className="text-right">30-Day Avg</TableHead>
                      <TableHead className="text-right">90-Day Avg</TableHead>
                      <TableHead className="text-center">Trend</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">Days Left</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredData
                      .filter(i => i.avg_daily_sales_90d > 0)
                      .sort((a, b) => b.avg_daily_sales_30d - a.avg_daily_sales_30d)
                      .map((item) => (
                        <TableRow key={item.product_id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{item.product_name}</p>
                              <p className="text-xs text-muted-foreground font-mono">
                                {item.product_code}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{item.category_name}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {item.avg_daily_sales_7d.toFixed(1)}/day
                          </TableCell>
                          <TableCell className="text-right">
                            {item.avg_daily_sales_30d.toFixed(1)}/day
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {item.avg_daily_sales_90d.toFixed(1)}/day
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              {getTrendIcon(item.trend)}
                              <span className={
                                item.trend === 'up' ? 'text-green-600 text-sm' :
                                item.trend === 'down' ? 'text-red-500 text-sm' :
                                'text-muted-foreground text-sm'
                              }>
                                {item.trend === 'up' ? 'Rising' : item.trend === 'down' ? 'Falling' : 'Stable'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {item.current_stock.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={
                              item.days_to_stockout <= 7 ? 'text-red-600 font-medium' :
                              item.days_to_stockout <= 14 ? 'text-yellow-600 font-medium' : ''
                            }>
                              {item.days_to_stockout >= 999 ? '999+' : `${Math.round(item.days_to_stockout)}d`}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-12">
                  <Package className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-medium">No sales data</h3>
                  <p className="text-muted-foreground">
                    No products have sales in the last 90 days
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Recommendations */}
      {data && (
        <Card>
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {outOfStock > 0 && (
              <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
                <PackageX className="h-5 w-5 text-red-600 mt-0.5" />
                <div>
                  <div className="font-medium text-red-900">Out of Stock</div>
                  <div className="text-sm text-red-700">
                    {outOfStock} product{outOfStock > 1 ? 's have' : ' has'} zero inventory.
                    Create purchase orders immediately to avoid lost sales.
                  </div>
                </div>
              </div>
            )}
            {filteredData.filter(i => i.urgency === 'critical' && i.current_stock > 0).length > 0 && (
              <div className="flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 p-3">
                <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5" />
                <div>
                  <div className="font-medium text-orange-900">Critical Stock Levels</div>
                  <div className="text-sm text-orange-700">
                    {filteredData.filter(i => i.urgency === 'critical' && i.current_stock > 0).length} products
                    will run out within 7 days at current sales rates. Prioritize reordering these items.
                  </div>
                </div>
              </div>
            )}
            {filteredData.filter(i => i.trend === 'up').length > 3 && (
              <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3">
                <TrendingUp className="h-5 w-5 text-green-600 mt-0.5" />
                <div>
                  <div className="font-medium text-green-900">Trending Up</div>
                  <div className="text-sm text-green-700">
                    {filteredData.filter(i => i.trend === 'up').length} products show increasing demand.
                    Consider ordering above the suggested quantities for these items.
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
