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
  DollarSign,
  TrendingUp,
  TrendingDown,
  Percent,
  Loader2,
  RefreshCw,
  AlertCircle,
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
  Legend,
  ScatterChart,
  Scatter,
  ZAxis,
} from 'recharts'

const COLORS = ['#3b82f6', '#22c55e', '#eab308', '#ef4444', '#8b5cf6']

export default function ProfitMarginPage() {
  const [startDate, setStartDate] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() - 30)
    return date.toISOString().split('T')[0]
  })

  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0]
  })

  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')

  const filters = {
    date_from: startDate,
    date_to: endDate,
    category_id: categoryFilter || undefined,
  }

  const { data: categories } = useCategories()
  const { data: productData, isLoading: productsLoading, refetch: refetchProducts } = useSalesByProduct(filters)
  const { data: categoryData, isLoading: categoriesLoading, refetch: refetchCategories } = useSalesByCategory(filters)
  
  const isLoading = productsLoading || categoriesLoading
  
  // Calculate summary metrics
  const summary = productData
    ? {
        totalRevenue: productData.reduce((sum, p) => sum + p.total_revenue, 0),
        totalCost: productData.reduce((sum, p) => sum + p.total_cost, 0),
        totalProfit: productData.reduce((sum, p) => sum + p.gross_profit, 0),
        avgMargin: productData.length > 0
          ? productData.reduce((sum, p) => sum + p.profit_margin, 0) / productData.length
          : 0,
        highMarginProducts: productData.filter(p => p.profit_margin >= 30).length,
        lowMarginProducts: productData.filter(p => p.profit_margin < 10).length,
      }
    : null
  
  // Filter products
  const filteredProducts = productData?.filter(item =>
    item.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.product_code.toLowerCase().includes(searchQuery.toLowerCase())
  ) || []
  
  // Top and bottom performers
  const topPerformers = [...(filteredProducts || [])].sort((a, b) => b.profit_margin - a.profit_margin).slice(0, 10)
  const bottomPerformers = [...(filteredProducts || [])].sort((a, b) => a.profit_margin - b.profit_margin).slice(0, 10)
  
  // Prepare scatter plot data (margin vs volume)
  const scatterData = filteredProducts.map(p => ({
    name: p.product_name,
    margin: p.profit_margin,
    revenue: p.total_revenue,
    profit: p.gross_profit,
  }))
  
  const getMarginBadge = (margin: number) => {
    if (margin >= 30) return <Badge className="bg-green-600">Excellent ({margin.toFixed(1)}%)</Badge>
    if (margin >= 20) return <Badge className="bg-blue-600">Good ({margin.toFixed(1)}%)</Badge>
    if (margin >= 10) return <Badge variant="secondary">Fair ({margin.toFixed(1)}%)</Badge>
    return <Badge variant="destructive">Low ({margin.toFixed(1)}%)</Badge>
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Profit Margin Analysis</h1>
          <p className="text-muted-foreground">
            Analyze profitability across products and categories
          </p>
        </div>
        <Button
          onClick={() => {
            refetchProducts()
            refetchCategories()
          }}
          variant="outline"
          size="sm"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>
      
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
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
            <div className="space-y-2">
              <Label>Search Products</Label>
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Summary Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : summary ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Gross Profit</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(summary.totalProfit)}</div>
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
                <div className="text-2xl font-bold">{summary.avgMargin.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground">
                  Across all products
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">High Margin Products</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{summary.highMarginProducts}</div>
                <p className="text-xs text-muted-foreground">
                  ≥30% margin
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Low Margin Products</CardTitle>
                <TrendingDown className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{summary.lowMarginProducts}</div>
                <p className="text-xs text-muted-foreground">
                  &lt;10% margin
                </p>
              </CardContent>
            </Card>
          </div>
          
          {/* Tabs for different views */}
          <Tabs defaultValue="products" className="space-y-4">
            <TabsList>
              <TabsTrigger value="products">By Product</TabsTrigger>
              <TabsTrigger value="categories">By Category</TabsTrigger>
              <TabsTrigger value="top-bottom">Top & Bottom</TabsTrigger>
            </TabsList>
            
            {/* By Product Tab */}
            <TabsContent value="products" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Product Margins</CardTitle>
                  <CardDescription>
                    Showing {filteredProducts.length} of {productData?.length || 0} products
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
                            <TableCell colSpan={6} className="text-center text-muted-foreground">
                              No data available
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredProducts
                            .sort((a, b) => b.gross_profit - a.gross_profit)
                            .map((item) => (
                              <TableRow key={item.product_id}>
                                <TableCell>
                                  <div>
                                    <div className="font-medium">{item.product_name}</div>
                                    <div className="text-xs text-muted-foreground">{item.product_code}</div>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">{item.quantity_sold.toLocaleString()}</TableCell>
                                <TableCell className="text-right">{formatCurrency(item.total_revenue)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(item.total_cost)}</TableCell>
                                <TableCell className="text-right font-medium text-green-600">
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
            
            {/* By Category Tab */}
            <TabsContent value="categories" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Category Profit Margins</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {categoryData && categoryData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={categoryData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="category_name" angle={-45} textAnchor="end" height={80} />
                          <YAxis />
                          <Tooltip formatter={(value) => `${(value as number).toFixed(1)}%`} />
                          <Bar dataKey="profit_margin" fill="#3b82f6" radius={[4, 4, 0, 0]} />
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
                        categoryData.map((cat) => (
                          <div key={cat.category_id} className="flex items-center justify-between border-b pb-2 last:border-0">
                            <div>
                              <div className="font-medium">{cat.category_name}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatCurrency(cat.total_revenue)} revenue
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-medium text-green-600">{formatCurrency(cat.gross_profit)}</div>
                              <div className="text-xs text-muted-foreground">{cat.profit_margin.toFixed(1)}% margin</div>
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
            </TabsContent>
            
            {/* Top & Bottom Tab */}
            <TabsContent value="top-bottom" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-green-600" />
                      Top 10 by Margin
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {topPerformers.map((product, index) => (
                        <div key={product.product_id} className="flex items-center justify-between p-2 rounded-lg border">
                          <div className="flex items-center gap-3">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-xs font-medium text-green-600">
                              {index + 1}
                            </div>
                            <div>
                              <div className="font-medium text-sm">{product.product_name}</div>
                              <div className="text-xs text-muted-foreground">{formatCurrency(product.gross_profit)} profit</div>
                            </div>
                          </div>
                          <Badge className="bg-green-600">{product.profit_margin.toFixed(1)}%</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-red-600" />
                      Bottom 10 by Margin
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {bottomPerformers.map((product, index) => (
                        <div key={product.product_id} className="flex items-center justify-between p-2 rounded-lg border border-red-200">
                          <div className="flex items-center gap-3">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-xs font-medium text-red-600">
                              {index + 1}
                            </div>
                            <div>
                              <div className="font-medium text-sm">{product.product_name}</div>
                              <div className="text-xs text-muted-foreground">{formatCurrency(product.gross_profit)} profit</div>
                            </div>
                          </div>
                          <Badge variant="destructive">{product.profit_margin.toFixed(1)}%</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              {/* Recommendations */}
              <Card>
                <CardHeader>
                  <CardTitle>Recommendations</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {summary.lowMarginProducts > 0 && (
                    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
                      <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                      <div>
                        <div className="font-medium text-red-900">Low Margin Alert</div>
                        <div className="text-sm text-red-700">
                          {summary.lowMarginProducts} products have margins below 10%. 
                          Consider reviewing pricing or sourcing cheaper suppliers.
                        </div>
                      </div>
                    </div>
                  )}
                  {summary.highMarginProducts > 0 && (
                    <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3">
                      <TrendingUp className="h-5 w-5 text-green-600 mt-0.5" />
                      <div>
                        <div className="font-medium text-green-900">High Performers</div>
                        <div className="text-sm text-green-700">
                          {summary.highMarginProducts} products have excellent margins (≥30%). 
                          Focus on promoting these products to maximize profitability.
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </div>
  )
}
