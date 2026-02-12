'use client'

import { useState } from 'react'
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
  BarChart3,
  DollarSign,
  Loader2,
  Package,
  RefreshCw,
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
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'

const COLORS = ['#3b82f6', '#22c55e', '#eab308', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

export default function SalesReportPage() {
  const [activeTab, setActiveTab] = useState<'product' | 'category'>('product')
  const [dateFrom, setDateFrom] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() - 30)
    return date.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])
  const [categoryFilter, setCategoryFilter] = useState<string>('')

  const filters = {
    date_from: dateFrom,
    date_to: dateTo,
    category_id: categoryFilter || undefined,
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

  const isLoading = activeTab === 'product' ? productLoading : categoryLoading

  const handleRefresh = () => {
    refetchProducts()
    refetchCategories()
  }

  // Summary calculations
  const productSummary = productData?.reduce(
    (acc, p) => ({
      totalRevenue: acc.totalRevenue + p.total_revenue,
      totalCost: acc.totalCost + p.total_cost,
      totalProfit: acc.totalProfit + p.gross_profit,
      totalQty: acc.totalQty + p.quantity_sold,
    }),
    { totalRevenue: 0, totalCost: 0, totalProfit: 0, totalQty: 0 }
  ) || { totalRevenue: 0, totalCost: 0, totalProfit: 0, totalQty: 0 }

  const overallMargin = productSummary.totalRevenue > 0
    ? (productSummary.totalProfit / productSummary.totalRevenue) * 100
    : 0

  // Chart data for category
  const categoryChartData = categoryData?.slice(0, 8).map((c, i) => ({
    name: c.category_name.length > 15 ? c.category_name.slice(0, 15) + '...' : c.category_name,
    revenue: c.total_revenue,
    profit: c.gross_profit,
    fill: COLORS[i % COLORS.length],
  })) || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sales Report</h1>
          <p className="text-muted-foreground">
            Analyze sales performance by product and category
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>From Date</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>To Date</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
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
            <div className="flex items-end">
              <Button
                variant="secondary"
                onClick={() => {
                  const date = new Date()
                  date.setDate(date.getDate() - 30)
                  setDateFrom(date.toISOString().split('T')[0])
                  setDateTo(new Date().toISOString().split('T')[0])
                  setCategoryFilter('')
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
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(productSummary.totalRevenue)}
            </div>
            <p className="text-xs text-muted-foreground">
              {productData?.length || 0} products sold
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(productSummary.totalCost)}
            </div>
            <p className="text-xs text-muted-foreground">
              COGS for period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gross Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(productSummary.totalProfit)}
            </div>
            <p className="text-xs text-muted-foreground">
              Revenue - COGS
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Profit Margin</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatPercent(overallMargin)}
            </div>
            <p className="text-xs text-muted-foreground">
              Average margin
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Report Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'product' | 'category')}>
        <TabsList>
          <TabsTrigger value="product">By Product</TabsTrigger>
          <TabsTrigger value="category">By Category</TabsTrigger>
        </TabsList>

        <TabsContent value="product" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Sales by Product</CardTitle>
              <CardDescription>
                Detailed breakdown of sales performance by product
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
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Profit</TableHead>
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
                        <TableCell className="text-right text-green-600 font-medium">
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
                  <p className="text-muted-foreground">
                    No sales found for the selected period
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="category" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Category Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Revenue by Category</CardTitle>
                <CardDescription>Visual breakdown of revenue distribution</CardDescription>
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
                        label={({ name, percent }) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`}
                      >
                        {categoryChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => formatCurrency(value as number)}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                    No data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Category Profit Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Profit by Category</CardTitle>
                <CardDescription>Gross profit comparison across categories</CardDescription>
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
                      <XAxis type="number" tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`} />
                      <YAxis dataKey="name" type="category" width={100} />
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

          {/* Category Table */}
          <Card>
            <CardHeader>
              <CardTitle>Sales by Category</CardTitle>
              <CardDescription>
                Summary of sales performance by category
              </CardDescription>
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
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Profit</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categoryData.map((category, index) => (
                      <TableRow key={category.category_id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
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
                        <TableCell className="text-right text-green-600 font-medium">
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
                  <p className="text-muted-foreground">
                    No sales found for the selected period
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
