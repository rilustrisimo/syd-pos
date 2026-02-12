'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  BarChart3,
  Package,
  TrendingUp,
  TrendingDown,
  Clock,
  Loader2,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils/formatting'

interface InventoryTurnoverItem {
  product_id: string
  product_code: string
  product_name: string
  category_name: string
  current_stock: number
  avg_stock: number
  units_sold: number
  cogs_sold: number
  turnover_ratio: number
  days_in_inventory: number
  status: 'fast' | 'normal' | 'slow' | 'dead'
}

interface TurnoverSummary {
  total_products: number
  avg_turnover: number
  avg_days: number
  fast_movers: number
  slow_movers: number
  dead_stock: number
  total_inventory_value: number
}

async function getInventoryTurnover(days: number): Promise<{
  items: InventoryTurnoverItem[]
  summary: TurnoverSummary
}> {
  const supabase = getClient()
  
  // Calculate date range
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  
  // Get sales data and current inventory
  const { data: salesData, error: salesError } = await supabase.rpc('get_inventory_turnover', {
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
  })
  
  if (salesError) {
    console.error('Error fetching turnover data:', salesError)
    throw salesError
  }
  
  // Process the data
  const items: InventoryTurnoverItem[] = (salesData || []).map((item: any) => {
    const avgStock = item.avg_stock || item.current_stock || 1
    const unitsSold = item.units_sold || 0
    const turnoverRatio = avgStock > 0 ? unitsSold / avgStock : 0
    const daysInInventory = turnoverRatio > 0 ? days / turnoverRatio : days
    
    let status: 'fast' | 'normal' | 'slow' | 'dead' = 'normal'
    if (daysInInventory <= 30) status = 'fast'
    else if (daysInInventory <= 60) status = 'normal'
    else if (daysInInventory <= 90) status = 'slow'
    else status = 'dead'
    
    return {
      product_id: item.product_id,
      product_code: item.product_code,
      product_name: item.product_name,
      category_name: item.category_name,
      current_stock: item.current_stock || 0,
      avg_stock: avgStock,
      units_sold: unitsSold,
      cogs_sold: item.cogs_sold || 0,
      turnover_ratio: turnoverRatio,
      days_in_inventory: daysInInventory,
      status,
    }
  })
  
  // Calculate summary
  const summary: TurnoverSummary = {
    total_products: items.length,
    avg_turnover: items.reduce((sum, item) => sum + item.turnover_ratio, 0) / (items.length || 1),
    avg_days: items.reduce((sum, item) => sum + item.days_in_inventory, 0) / (items.length || 1),
    fast_movers: items.filter(item => item.status === 'fast').length,
    slow_movers: items.filter(item => item.status === 'slow').length,
    dead_stock: items.filter(item => item.status === 'dead').length,
    total_inventory_value: items.reduce((sum, item) => sum + (item.current_stock * item.cogs_sold / (item.units_sold || 1)), 0),
  }
  
  return { items, summary }
}

export default function InventoryTurnoverPage() {
  const [days, setDays] = useState(90)
  const [searchQuery, setSearchQuery] = useState('')
  
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['inventory-turnover', days],
    queryFn: () => getInventoryTurnover(days),
  })
  
  const filteredItems = data?.items.filter(item =>
    item.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.product_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.category_name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || []
  
  const getStatusBadge = (status: string, value: number) => {
    const variants = {
      fast: { variant: 'default' as const, label: 'Fast Mover', icon: TrendingUp, color: 'text-green-600' },
      normal: { variant: 'secondary' as const, label: 'Normal', icon: Clock, color: 'text-blue-600' },
      slow: { variant: 'secondary' as const, label: 'Slow Mover', icon: TrendingDown, color: 'text-orange-600' },
      dead: { variant: 'destructive' as const, label: 'Dead Stock', icon: AlertTriangle, color: 'text-red-600' },
    }
    
    const config = variants[status as keyof typeof variants] || variants.normal
    const Icon = config.icon
    
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label} ({value.toFixed(0)}d)
      </Badge>
    )
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Inventory Turnover Report</h1>
          <p className="text-muted-foreground">
            Track how efficiently inventory is moving
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm">
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
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Time Period</Label>
              <div className="flex gap-2">
                {[30, 60, 90, 180, 365].map(d => (
                  <Button
                    key={d}
                    variant={days === d ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setDays(d)}
                  >
                    {d}d
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Search Products</Label>
              <Input
                placeholder="Search by name, code, or category..."
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
      ) : data ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Turnover Ratio</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.summary.avg_turnover.toFixed(2)}x</div>
                <p className="text-xs text-muted-foreground">
                  Times sold per period
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Days in Stock</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.summary.avg_days.toFixed(0)} days</div>
                <p className="text-xs text-muted-foreground">
                  Average holding period
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Fast Movers</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{data.summary.fast_movers}</div>
                <p className="text-xs text-muted-foreground">
                  ≤30 days turnover
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Slow/Dead Stock</CardTitle>
                <AlertTriangle className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  {data.summary.slow_movers + data.summary.dead_stock}
                </div>
                <p className="text-xs text-muted-foreground">
                  {data.summary.slow_movers} slow + {data.summary.dead_stock} dead
                </p>
              </CardContent>
            </Card>
          </div>
          
          {/* Turnover Table */}
          <Card>
            <CardHeader>
              <CardTitle>Product Turnover Details</CardTitle>
              <CardDescription>
                Showing {filteredItems.length} of {data.items.length} products
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Current Stock</TableHead>
                      <TableHead className="text-right">Units Sold</TableHead>
                      <TableHead className="text-right">Turnover Ratio</TableHead>
                      <TableHead className="text-right">Days in Stock</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          No products found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredItems
                        .sort((a, b) => b.turnover_ratio - a.turnover_ratio)
                        .map((item) => (
                          <TableRow key={item.product_id}>
                            <TableCell>
                              <div>
                                <div className="font-medium">{item.product_name}</div>
                                <div className="text-xs text-muted-foreground">{item.product_code}</div>
                              </div>
                            </TableCell>
                            <TableCell>{item.category_name}</TableCell>
                            <TableCell className="text-right">{item.current_stock.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{item.units_sold.toLocaleString()}</TableCell>
                            <TableCell className="text-right font-medium">
                              {item.turnover_ratio.toFixed(2)}x
                            </TableCell>
                            <TableCell className="text-right">
                              {item.days_in_inventory.toFixed(0)}
                            </TableCell>
                            <TableCell>
                              {getStatusBadge(item.status, item.days_in_inventory)}
                            </TableCell>
                          </TableRow>
                        ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          
          {/* Recommendations */}
          <Card>
            <CardHeader>
              <CardTitle>Recommendations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.summary.dead_stock > 0 && (
                <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div>
                    <div className="font-medium text-red-900">Dead Stock Alert</div>
                    <div className="text-sm text-red-700">
                      {data.summary.dead_stock} products haven't moved in over 90 days. 
                      Consider promotions, discounts, or discontinuation.
                    </div>
                  </div>
                </div>
              )}
              {data.summary.slow_movers > 5 && (
                <div className="flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 p-3">
                  <TrendingDown className="h-5 w-5 text-orange-600 mt-0.5" />
                  <div>
                    <div className="font-medium text-orange-900">Slow Movers</div>
                    <div className="text-sm text-orange-700">
                      {data.summary.slow_movers} products are moving slowly (60-90 days). 
                      Review pricing and marketing strategies.
                    </div>
                  </div>
                </div>
              )}
              {data.summary.fast_movers > 0 && (
                <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3">
                  <TrendingUp className="h-5 w-5 text-green-600 mt-0.5" />
                  <div>
                    <div className="font-medium text-green-900">Fast Movers</div>
                    <div className="text-sm text-green-700">
                      {data.summary.fast_movers} products are selling quickly (≤30 days). 
                      Ensure adequate stock levels to avoid stockouts.
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
