'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useProducts, useCategories } from '@/hooks/useProducts'
import { formatCurrency } from '@/lib/utils/formatting'
import { Button } from '@/components/ui/button'
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Search, Plus, Package, ChevronLeft, ChevronRight, FolderTree } from 'lucide-react'

const STORAGE_KEY = 'products-filters'

export default function ProductsPage() {
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [page, setPage] = useState(1)
  const [isInitialized, setIsInitialized] = useState(false)
  const limit = 20

  // Load filters from sessionStorage on mount
  useEffect(() => {
    try {
      const savedFilters = sessionStorage.getItem(STORAGE_KEY)
      if (savedFilters) {
        const parsed = JSON.parse(savedFilters)
        setSearch(parsed.search || '')
        setCategoryId(parsed.categoryId || '')
        setPage(parsed.page || 1)
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
      const filters = { search, categoryId, page }
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters))
    } catch (error) {
      console.error('Failed to save filters:', error)
    }
  }, [search, categoryId, page, isInitialized])

  const { data: productsData, isLoading } = useProducts({
    search: search || undefined,
    categoryId: categoryId || undefined,
    page,
    limit,
  })

  const { data: categories } = useCategories()

  const products = productsData?.data || []
  const totalPages = productsData?.totalPages || 1
  const total = productsData?.total || 0

  // Clear filters from session storage (used when navigating to add/edit/categories)
  const clearSessionFilters = () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch (error) {
      console.error('Failed to clear session filters:', error)
    }
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground">
            Manage your product catalog ({total} products)
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/products/categories" onClick={clearSessionFilters}>
            <Button variant="outline">
              <FolderTree className="mr-2 h-4 w-4" />
              Categories
            </Button>
          </Link>
          <Link href="/products/new" onClick={clearSessionFilters}>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Product
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name or code..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                className="pl-9"
              />
            </div>
            <Select
              value={categoryId}
              onValueChange={(value) => {
                setCategoryId(value === 'all' ? '' : value)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-[200px]">
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
        </CardContent>
      </Card>

      {/* Products table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="text-muted-foreground">Loading products...</div>
            </div>
          ) : products.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2">
              <Package className="h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">No products found</p>
              {(search || categoryId) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch('')
                    setCategoryId('')
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Markup</TableHead>
                    <TableHead className="text-right">Selling Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <Link
                          href={`/products/${product.id}`}
                          className="font-mono text-sm text-primary hover:underline"
                        >
                          {product.code}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/products/${product.id}`}
                          className="font-medium hover:underline"
                        >
                          {product.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {product.category?.name || 'Uncategorized'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {product.selling_uom?.code || product.base_uom?.code || '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(product.latest_cogs)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={product.markup_percentage >= 20 ? 'default' : 'secondary'}
                        >
                          {product.markup_percentage.toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {formatCurrency(product.current_selling_price)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between border-t px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
