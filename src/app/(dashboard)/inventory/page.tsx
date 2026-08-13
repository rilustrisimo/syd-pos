'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  useBranchInventory,
  useBranches,
  useInventorySummary,
  useLowStockAlerts,
} from '@/hooks/useInventory'
import type { Branch } from '@/lib/supabase/queries/inventory'
import { formatCurrency } from '@/lib/utils/formatting'
import {
  Package2,
  Search,
  AlertTriangle,
  TrendingDown,
  DollarSign,
  Box,
  Plus,
  Filter,
  FileText,
  Loader2,
  PackageX,
  TrendingUp,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { Alert, AlertDescription } from '@/components/ui/alert'

const STORAGE_KEY = 'inventory-filters'

export default function InventoryPage() {
  const router = useRouter()
  const [selectedBranch, setSelectedBranch] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showLowStockOnly, setShowLowStockOnly] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [isInitialized, setIsInitialized] = useState(false)

  // Load filters from sessionStorage on mount
  useEffect(() => {
    try {
      const savedFilters = sessionStorage.getItem(STORAGE_KEY)
      if (savedFilters) {
        const parsed = JSON.parse(savedFilters)
        setSelectedBranch(parsed.selectedBranch || '')
        setSearchQuery(parsed.searchQuery || '')
        setShowLowStockOnly(parsed.showLowStockOnly || false)
        setCurrentPage(parsed.currentPage || 1)
      }
    } catch (error) {
      console.error('Failed to load saved filters:', error)
    } finally {
      setIsInitialized(true)
    }
  }, [])

  // Save filters to sessionStorage whenever they change
  useEffect(() => {
    if (!isInitialized) return
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ selectedBranch, searchQuery, showLowStockOnly, currentPage })
      )
    } catch (error) {
      console.error('Failed to save filters:', error)
    }
  }, [selectedBranch, searchQuery, showLowStockOnly, currentPage, isInitialized])

  // Clear filters from session storage (used when navigating away to a different flow)
  const clearSessionFilters = () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch (error) {
      console.error('Failed to clear session filters:', error)
    }
  }

  const { data: branches, isLoading: branchesLoading } = useBranches()
  const branchesList: Branch[] = branches || []
  const { data: inventoryData, isLoading: inventoryLoading } = useBranchInventory({
    branchId: selectedBranch || undefined,
    search: searchQuery,
    lowStockOnly: showLowStockOnly,
    page: currentPage,
    limit: 50,
    enabled: isInitialized,
  })
  const { data: summary, isLoading: summaryLoading } = useInventorySummary(
    selectedBranch || undefined
  )
  const { data: lowStockAlerts } = useLowStockAlerts(selectedBranch || undefined)

  const inventory = inventoryData?.data || []
  const totalPages = inventoryData?.totalPages || 1

  const getStockStatus = (item: any) => {
    const quantity = Number(item.quantity_on_hand)
    const reorderPoint = Number(item.product?.reorder_point || 0)

    if (quantity <= 0) return { label: 'Out of Stock', variant: 'destructive' as const }
    if (quantity <= reorderPoint) return { label: 'Low Stock', variant: 'secondary' as const }
    return { label: 'In Stock', variant: 'default' as const }
  }

  const handleBranchChange = (value: string) => {
    setSelectedBranch(value === 'all' ? '' : value)
    setCurrentPage(1)
  }

  const handleSearch = (value: string) => {
    setSearchQuery(value)
    setCurrentPage(1)
  }

  const toggleLowStockFilter = () => {
    setShowLowStockOnly(!showLowStockOnly)
    setCurrentPage(1)
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Inventory Management</h1>
          <p className="text-muted-foreground">
            Track and manage stock levels across all branches
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/inventory/movements" onClick={clearSessionFilters}>
            <Button variant="outline">
              <FileText className="mr-2 h-4 w-4" />
              Movement History
            </Button>
          </Link>
          <Link href="/inventory/adjust" onClick={clearSessionFilters}>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Adjust Stock
            </Button>
          </Link>
        </div>
      </div>

      {/* Low Stock Alert */}
      {lowStockAlerts && lowStockAlerts.length > 0 && !showLowStockOnly && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>{lowStockAlerts.length} products</strong> are below reorder point.{' '}
            <button
              onClick={toggleLowStockFilter}
              className="underline font-medium"
            >
              View low stock items
            </button>
          </AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      {!summaryLoading && summary && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Items</CardTitle>
              <Package2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalItems}</div>
              <p className="text-xs text-muted-foreground">Unique products in stock</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Quantity</CardTitle>
              <Box className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {summary.totalQuantity.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">Units on hand</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Inventory Value</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(summary.totalValue)}</div>
              <p className="text-xs text-muted-foreground">At cost price</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Potential Profit</CardTitle>
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">
                {formatCurrency(summary.potentialProfit)}
              </div>
              <p className="text-xs text-muted-foreground">If all stock is sold</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Low Stock</CardTitle>
              <TrendingDown className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">
                {summary.lowStockItems}
              </div>
              <p className="text-xs text-muted-foreground">Below reorder point</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Out of Stock</CardTitle>
              <PackageX className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                {summary.outOfStockItems}
              </div>
              <p className="text-xs text-muted-foreground">Need restocking</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Inventory List</CardTitle>
          <CardDescription>View and manage stock levels for all products</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            {/* Branch Selector */}
            <div className="w-full md:w-64">
              <Select
                value={selectedBranch || 'all'}
                onValueChange={handleBranchChange}
                disabled={branchesLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select branch..." />
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

            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search products..."
                  className="pl-8"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                />
              </div>
            </div>

            {/* Low Stock Filter */}
            <Button
              variant={showLowStockOnly ? 'default' : 'outline'}
              onClick={toggleLowStockFilter}
            >
              <Filter className="mr-2 h-4 w-4" />
              {showLowStockOnly ? 'Show All' : 'Low Stock Only'}
            </Button>
          </div>

          {/* Inventory Table */}
          {inventoryLoading || !isInitialized ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : inventory.length === 0 ? (
            <div className="text-center py-8">
              <Package2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No inventory found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery
                  ? 'Try adjusting your search or filters'
                  : 'Start adding stock through purchase orders or adjustments'}
              </p>
            </div>
          ) : (
            <>
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product Code</TableHead>
                      <TableHead>Product Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead className="text-right">On Hand</TableHead>
                      <TableHead className="text-right">Available</TableHead>
                      <TableHead className="text-right">Reorder Point</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventory.map((item: any) => {
                      const status = getStockStatus(item)
                      const available = Number(item.quantity_on_hand)
                      const value =
                        Number(item.quantity_on_hand) *
                        Number(item.product?.latest_cogs || 0)

                      return (
                        <TableRow key={item.id}>
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
                          <TableCell className="text-right font-medium">
                            {Number(item.quantity_on_hand).toLocaleString()}{' '}
                            <span className="text-xs text-muted-foreground">
                              {item.product?.base_uom?.code}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {available.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-amber-600">
                            {Number(item.product?.reorder_point || 0).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant={status.variant}>{status.label}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(value)}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
