'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useBranches, useLowStockAlerts } from '@/hooks/useInventory'
import type { Branch } from '@/lib/supabase/queries/inventory'
import { formatCurrency } from '@/lib/utils/formatting'
import { ArrowLeft, Loader2, AlertTriangle, ShoppingCart, Package } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export default function LowStockAlertsPage() {
  const [selectedBranch, setSelectedBranch] = useState('')

  const { data: branches } = useBranches()
  const branchesList: Branch[] = branches || []
  const { data: lowStockItems, isLoading } = useLowStockAlerts(selectedBranch || undefined)

  // Calculate totals
  const totalReorderValue =
    lowStockItems?.reduce(
      (sum: number, item: any) =>
        sum + Number(item.product?.reorder_quantity || 0) * Number(item.product?.latest_cogs || 0),
      0
    ) || 0

  const outOfStockCount = lowStockItems?.filter((item: any) => Number(item.quantity_on_hand) <= 0).length || 0

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-4">
        <Link href="/inventory">
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Low Stock Alerts</h1>
          <p className="text-muted-foreground">
            Products below reorder point that need restocking
          </p>
        </div>
      </div>

      {/* Summary Alert */}
      {lowStockItems && lowStockItems.length > 0 && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Attention Required</AlertTitle>
          <AlertDescription>
            <strong>{lowStockItems.length} products</strong> are below their reorder point
            {outOfStockCount > 0 && (
              <>
                , including <strong>{outOfStockCount} out of stock items</strong>
              </>
            )}
            . Consider placing purchase orders to restock.
          </AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Items</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {lowStockItems?.length || 0}
            </div>
            <p className="text-xs text-muted-foreground">Products need restocking</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Out of Stock</CardTitle>
            <Package className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{outOfStockCount}</div>
            <p className="text-xs text-muted-foreground">Urgent restocking needed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Estimated Reorder Cost</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalReorderValue)}</div>
            <p className="text-xs text-muted-foreground">To restock all items</p>
          </CardContent>
        </Card>
      </div>

      {/* Low Stock Table */}
      <Card>
        <CardHeader>
          <CardTitle>Products Below Reorder Point</CardTitle>
          <CardDescription>
            Review and take action on products that need restocking
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Branch Filter */}
          <div className="mb-6">
            <Select
              value={selectedBranch || 'all'}
              onValueChange={(value) => setSelectedBranch(value === 'all' ? '' : value)}
            >
              <SelectTrigger className="w-64">
                <SelectValue placeholder="All Branches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branchesList?.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !lowStockItems || lowStockItems.length === 0 ? (
            <div className="text-center py-8">
              <Package className="mx-auto h-12 w-12 text-green-500 mb-4" />
              <h3 className="text-lg font-semibold mb-2 text-green-600">All Good!</h3>
              <p className="text-muted-foreground">
                No products are currently below their reorder point
              </p>
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Product Code</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead className="text-right">Current Stock</TableHead>
                    <TableHead className="text-right">Reorder Point</TableHead>
                    <TableHead className="text-right">Suggested Order</TableHead>
                    <TableHead className="text-right">Order Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStockItems.map((item: any) => {
                    const currentStock = Number(item.quantity_on_hand)
                    const reorderPoint = Number(item.product?.reorder_point || 0)
                    const reorderQty = Number(item.product?.reorder_quantity || 0)
                    const unitCost = Number(item.product?.latest_cogs || 0)
                    const orderCost = reorderQty * unitCost
                    const isOutOfStock = currentStock <= 0

                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Badge variant={isOutOfStock ? 'destructive' : 'secondary'} className={!isOutOfStock ? 'bg-amber-100 text-amber-800' : ''}>  
                            {isOutOfStock ? 'OUT' : 'LOW'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {item.product?.code}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/products/${item.product?.id}`}
                            className="font-medium hover:underline"
                          >
                            {item.product?.name}
                          </Link>
                        </TableCell>
                        <TableCell>{item.product?.category?.name || '-'}</TableCell>
                        <TableCell>{item.branch?.name}</TableCell>
                        <TableCell
                          className={`text-right font-medium ${
                            isOutOfStock ? 'text-destructive' : 'text-amber-600'
                          }`}
                        >
                          {currentStock.toLocaleString()}{' '}
                          <span className="text-xs text-muted-foreground">
                            {item.product?.base_uom?.code}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {reorderPoint.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-medium text-blue-600">
                          {reorderQty.toLocaleString()}{' '}
                          <span className="text-xs text-muted-foreground">
                            {item.product?.base_uom?.code}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(orderCost)}
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

      {/* Action Buttons */}
      {lowStockItems && lowStockItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Next Steps</CardTitle>
            <CardDescription>Take action to restock low inventory items</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Link href="/purchases/new">
              <Button>
                <ShoppingCart className="mr-2 h-4 w-4" />
                Create Purchase Order
              </Button>
            </Link>
            <Link href="/inventory/adjust">
              <Button variant="outline">
                <Package className="mr-2 h-4 w-4" />
                Manual Stock Adjustment
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
