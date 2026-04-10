'use client'

import { useState } from 'react'
import { useSupplierPurchaseHistory } from '@/hooks/useDashboard'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
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
  Truck,
  DollarSign,
  ClipboardList,
  Loader2,
  Package,
  RefreshCw,
  TrendingUp,
  CheckCircle,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils/formatting'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'

const COLORS = ['#3b82f6', '#22c55e', '#eab308', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

function useSuppliersList() {
  return useQuery({
    queryKey: ['suppliers-list'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, name, code')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data as { id: string; name: string; code: string }[]
    },
    staleTime: 300000,
  })
}

export default function SupplierHistoryPage() {
  const [activeTab, setActiveTab] = useState<'supplier' | 'product'>('supplier')
  const [dateFrom, setDateFrom] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() - 90)
    return date.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])
  const [supplierFilter, setSupplierFilter] = useState<string>('')

  const filters = {
    date_from: dateFrom,
    date_to: dateTo,
    supplier_id: supplierFilter || undefined,
  }

  const { data: suppliers } = useSuppliersList()
  const { data, isLoading, refetch } = useSupplierPurchaseHistory(filters)

  // Summary calculations
  const totalSuppliers = data?.bySupplier.length || 0
  const totalSpent = data?.bySupplier.reduce((sum, s) => sum + s.total_spent, 0) || 0
  const totalOrders = data?.bySupplier.reduce((sum, s) => sum + s.total_orders, 0) || 0
  const avgOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0

  // Chart data - top 8 suppliers by spend
  const chartData = data?.bySupplier.slice(0, 8).map(s => ({
    name: s.supplier_name.length > 15 ? s.supplier_name.slice(0, 15) + '...' : s.supplier_name,
    spent: s.total_spent,
    orders: s.total_orders,
  })) || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Supplier Purchase History</h1>
          <p className="text-muted-foreground">
            Track purchasing patterns and supplier performance
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
              <Label>Supplier</Label>
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Suppliers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Suppliers</SelectItem>
                  {suppliers?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
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
                  date.setDate(date.getDate() - 90)
                  setDateFrom(date.toISOString().split('T')[0])
                  setDateTo(new Date().toISOString().split('T')[0])
                  setSupplierFilter('')
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
            <CardTitle className="text-sm font-medium">Active Suppliers</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSuppliers}</div>
            <p className="text-xs text-muted-foreground">With orders in period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalSpent)}</div>
            <p className="text-xs text-muted-foreground">Purchase orders value</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total POs</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOrders}</div>
            <p className="text-xs text-muted-foreground">Purchase orders placed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Order Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(avgOrderValue)}</div>
            <p className="text-xs text-muted-foreground">Per purchase order</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Suppliers by Spend</CardTitle>
            <CardDescription>Highest value suppliers in the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`} />
                <YAxis dataKey="name" type="category" width={120} />
                <Tooltip formatter={(value) => formatCurrency(value as number)} />
                <Bar dataKey="spent" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Report Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'supplier' | 'product')}>
        <TabsList>
          <TabsTrigger value="supplier">By Supplier</TabsTrigger>
          <TabsTrigger value="product">By Product</TabsTrigger>
        </TabsList>

        <TabsContent value="supplier" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Supplier Summary</CardTitle>
              <CardDescription>
                Purchase history and performance by supplier
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : data?.bySupplier && data.bySupplier.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Total Spent</TableHead>
                      <TableHead className="text-right">Avg Order</TableHead>
                      <TableHead>Last Order</TableHead>
                      <TableHead className="text-right">On-Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.bySupplier.map((supplier) => (
                      <TableRow key={supplier.supplier_id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{supplier.supplier_name}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {supplier.supplier_code}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">{supplier.total_orders}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(supplier.total_spent)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatCurrency(supplier.avg_order_value)}
                        </TableCell>
                        <TableCell>
                          {supplier.last_order_date
                            ? formatDate(supplier.last_order_date)
                            : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {supplier.on_time_delivery_pct > 0 ? (
                            <Badge
                              variant={supplier.on_time_delivery_pct >= 80 ? 'default' : 'secondary'}
                              className={supplier.on_time_delivery_pct >= 80 ? 'bg-green-500' : ''}
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              {supplier.on_time_delivery_pct.toFixed(0)}%
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">N/A</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-12">
                  <Truck className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-medium">No purchase data</h3>
                  <p className="text-muted-foreground">
                    No purchase orders found for the selected period
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="product" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Products by Supplier</CardTitle>
              <CardDescription>
                What products were purchased from which suppliers
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : data?.byProduct && data.byProduct.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Qty Purchased</TableHead>
                      <TableHead className="text-right">Total Cost</TableHead>
                      <TableHead className="text-right">Avg Unit Cost</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.byProduct.map((item, index) => (
                      <TableRow key={`${item.supplier_id}-${item.product_id}`}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{item.product_name}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {item.product_code}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{item.supplier_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.category_name}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{item.total_quantity.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(item.total_cost)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatCurrency(item.avg_unit_cost)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">{item.order_count}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-12">
                  <Package className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-medium">No product data</h3>
                  <p className="text-muted-foreground">
                    No product purchases found for the selected period
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
