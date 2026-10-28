'use client'

import { use, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useProduct, useDeleteProduct, useActivateProduct } from '@/hooks/useProducts'
import { PageTitle } from '@/components/page-title'
import { useProductPurchaseHistory } from '@/hooks/usePurchases'
import { useProductSalesHistory } from '@/hooks/useTransactions'
import { useProductInventory, useInventoryMovements, useMovementTotals } from '@/hooks/useInventory'
import { formatCurrency } from '@/lib/utils/formatting'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Package,
  Ruler,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Image as ImageIcon,
  ShoppingCart,
  ExternalLink,
  Receipt,
  TrendingUp,
  Settings,
  Warehouse,
  Activity,
  AlertCircle,
  TrendingDown,
  Power,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { cn } from '@/lib/utils'

interface ProductDetailPageProps {
  params: Promise<{ id: string }>
}

export default function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { id } = use(params)
  const router = useRouter()
  
  const { data: salesHistory = [], isLoading: salesLoading } = useProductSalesHistory(id)
  const { data: product, isLoading, error } = useProduct(id)
  const deleteProduct = useDeleteProduct()
  const activateProduct = useActivateProduct()

  // Pagination and filtering state for Purchase History
  const [purchasePage, setPurchasePage] = useState(1)
  const [purchaseStartDate, setPurchaseStartDate] = useState('')
  const [purchaseEndDate, setPurchaseEndDate] = useState('')
  const purchaseItemsPerPage = 10

  // Pagination and filtering state for Sales History
  const [salesPage, setSalesPage] = useState(1)
  const [salesStartDate, setSalesStartDate] = useState('')
  const [salesEndDate, setSalesEndDate] = useState('')
  const salesItemsPerPage = 10

  // Pagination and filtering state for Inventory Movements
  const [movementsPage, setMovementsPage] = useState(1)
  const [movementsStartDate, setMovementsStartDate] = useState('')
  const [movementsEndDate, setMovementsEndDate] = useState('')
  const movementsItemsPerPage = 10

  const handleActivate = async () => {
    if (!product) return
    try {
      await activateProduct.mutateAsync(id)
      toast.success(`"${product.name}" has been activated`)
    } catch (error: any) {
      toast.error(error.message || 'Failed to activate product')
    }
  }
  const { data: purchaseHistory = [], isLoading: historyLoading } = useProductPurchaseHistory(id)
  const { data: branchInventory = [], isLoading: inventoryLoading } = useProductInventory(id)
  const { data: movementsResult, isLoading: movementsLoading } = useInventoryMovements({ productId: id, limit: 200 })
  const allMovements: any[] = movementsResult?.data ?? []
  const { data: movementTotals, isLoading: auditLoading } = useMovementTotals(id)

  // Filter and paginate Purchase History
  const filteredPurchaseHistory = useMemo(() => {
    let filtered = purchaseHistory as any[]
    if (purchaseStartDate || purchaseEndDate) {
      filtered = filtered.filter((line) => {
        const po = line.purchase_order
        if (!po) return false
        const poDate = new Date(po.po_date)
        if (purchaseStartDate && poDate < new Date(purchaseStartDate)) return false
        if (purchaseEndDate && poDate > new Date(purchaseEndDate)) return false
        return true
      })
    }
    return filtered
  }, [purchaseHistory, purchaseStartDate, purchaseEndDate])

  const paginatedPurchaseHistory = useMemo(() => {
    const start = (purchasePage - 1) * purchaseItemsPerPage
    const end = start + purchaseItemsPerPage
    return filteredPurchaseHistory.slice(start, end)
  }, [filteredPurchaseHistory, purchasePage])

  const purchaseTotalPages = Math.ceil(filteredPurchaseHistory.length / purchaseItemsPerPage)

  // Filter and paginate Sales History
  const filteredSalesHistory = useMemo(() => {
    let filtered = salesHistory as any[]
    if (salesStartDate || salesEndDate) {
      filtered = filtered.filter((line) => {
        const txn = line.transaction
        if (!txn) return false
        const txnDate = new Date(txn.transaction_date)
        if (salesStartDate && txnDate < new Date(salesStartDate)) return false
        if (salesEndDate && txnDate > new Date(salesEndDate)) return false
        return true
      })
    }
    return filtered
  }, [salesHistory, salesStartDate, salesEndDate])

  const paginatedSalesHistory = useMemo(() => {
    const start = (salesPage - 1) * salesItemsPerPage
    const end = start + salesItemsPerPage
    return filteredSalesHistory.slice(start, end)
  }, [filteredSalesHistory, salesPage])

  const salesTotalPages = Math.ceil(filteredSalesHistory.length / salesItemsPerPage)

  // Filter and paginate Inventory Movements
  const filteredMovements = useMemo(() => {
    let filtered = allMovements
    if (movementsStartDate || movementsEndDate) {
      filtered = filtered.filter((movement) => {
        const movementDate = new Date(movement.created_at)
        if (movementsStartDate && movementDate < new Date(movementsStartDate)) return false
        if (movementsEndDate && movementDate > new Date(movementsEndDate)) return false
        return true
      })
    }
    return filtered
  }, [allMovements, movementsStartDate, movementsEndDate])

  const paginatedMovements = useMemo(() => {
    const start = (movementsPage - 1) * movementsItemsPerPage
    const end = start + movementsItemsPerPage
    return filteredMovements.slice(start, end)
  }, [filteredMovements, movementsPage])

  const movementsTotalPages = Math.ceil(filteredMovements.length / movementsItemsPerPage)

  const handleDelete = async () => {
    if (!product) return
    
    if (!confirm(`Are you sure you want to delete "${product.name}"? This will deactivate the product.`)) {
      return
    }

    try {
      await deleteProduct.mutateAsync(id)
      toast.success('Product deleted successfully')
      router.push('/products')
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete product')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/products">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Product Not Found</h1>
          </div>
        </div>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {error?.message || 'The product you are looking for does not exist.'}
          </AlertDescription>
        </Alert>

        <Button onClick={() => router.push('/products')}>
          Back to Products
        </Button>
      </div>
    )
  }

  const images: any[] = (product as any).images ?? []
  const primaryImage = images.find((img) => img.is_primary) ?? images[0]
  const totalOnHand = (branchInventory as any[]).reduce((sum, inv) => sum + Number(inv.quantity_on_hand || 0), 0)
  const unitCode = product.base_uom?.code || 'units'
  const sellingUnitCode = product.selling_uom?.code || product.base_uom?.code
  const profitPerUnit = product.current_selling_price - product.latest_cogs
  const marginPct = product.current_selling_price > 0 ? (profitPerUnit / product.current_selling_price) * 100 : 0
  const stockStatus = inventoryLoading
    ? null
    : totalOnHand <= 0
      ? { label: 'Out of stock', className: 'bg-red-100 text-red-700 border-red-200' }
      : totalOnHand <= Number(product.reorder_point)
        ? { label: 'Low stock', className: 'bg-amber-100 text-amber-700 border-amber-200' }
        : { label: 'In stock', className: 'bg-green-100 text-green-700 border-green-200' }

  return (
    <div className="space-y-6">
      <PageTitle title={product ? `${product.name} · Products` : 'Products'} />
      {/* Page header: identity + actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Link href="/products">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{product.name}</h1>
            <div className="flex items-center gap-2 flex-wrap text-sm text-muted-foreground mt-0.5">
              <span className="font-mono">{product.code}</span>
              <span>·</span>
              <span>
                {product.category?.name || 'Uncategorized'}
                {product.subcategory && ` / ${product.subcategory.name}`}
              </span>
              <Badge variant={product.is_active ? 'default' : 'secondary'} className="text-xs">
                {product.is_active ? (
                  <><CheckCircle2 className="mr-1 h-3 w-3" /> Active</>
                ) : (
                  <><XCircle className="mr-1 h-3 w-3" /> Inactive</>
                )}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {product.is_active ? (
            <Link href={`/products/${id}/edit`}>
              <Button variant="outline">
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </Link>
          ) : (
            <Button
              variant="default"
              onClick={handleActivate}
              disabled={activateProduct.isPending}
            >
              <Power className="mr-2 h-4 w-4" />
              {activateProduct.isPending ? 'Activating…' : 'Activate'}
            </Button>
          )}
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteProduct.isPending}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Inactive alert */}
      {!product.is_active && (
        <Alert className="border-orange-300 bg-orange-50 text-orange-900">
          <XCircle className="h-4 w-4 text-orange-600" />
          <AlertDescription>
            This product is <strong>inactive</strong> — it will not appear on the sale screen or be available for new sales.
            Click <strong>Activate</strong> above to make it available again.
          </AlertDescription>
        </Alert>
      )}

      {/* Overview: the numbers people check most — price and stock first */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-5">
            <Link
              href={`/products/${id}/edit`}
              className="relative w-full sm:w-36 aspect-square shrink-0 rounded-lg overflow-hidden border bg-muted/40 flex items-center justify-center"
              title={primaryImage ? 'Product image' : 'Add images'}
            >
              {primaryImage ? (
                <Image
                  src={primaryImage.url}
                  alt={primaryImage.alt_text || product.name}
                  fill
                  className="object-cover"
                  sizes="144px"
                  unoptimized
                />
              ) : (
                <div className="flex flex-col items-center gap-1 text-muted-foreground text-xs">
                  <ImageIcon className="h-8 w-8 opacity-40" />
                  Add image
                </div>
              )}
              {images.length > 1 && (
                <span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">
                  +{images.length - 1}
                </span>
              )}
            </Link>

            <div className="flex-1 grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 content-start">
              <div className="col-span-2 lg:col-span-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Selling price</p>
                <p className="text-3xl font-bold text-green-600">
                  {formatCurrency(product.current_selling_price)}
                  {sellingUnitCode && <span className="text-base font-normal text-muted-foreground"> / {sellingUnitCode}</span>}
                </p>
                <p className="text-xs text-muted-foreground">Cost + {product.markup_percentage.toFixed(2)}% markup</p>
              </div>
              <div className="col-span-2 lg:col-span-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">On hand (all branches)</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-3xl font-bold">
                    {inventoryLoading ? '…' : totalOnHand.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    <span className="text-base font-normal text-muted-foreground"> {unitCode}</span>
                  </p>
                  {stockStatus && (
                    <Badge variant="outline" className={stockStatus.className}>{stockStatus.label}</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Reorder at {product.reorder_point} {unitCode}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Profit per unit</p>
                <p className={cn('text-xl font-bold', profitPerUnit >= 0 ? 'text-green-600' : 'text-red-600')}>
                  {formatCurrency(profitPerUnit)}
                </p>
                <p className="text-xs text-muted-foreground">{marginPct.toFixed(1)}% margin</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Latest cost (COGS)</p>
                <p className="text-xl font-bold">{formatCurrency(product.latest_cogs)}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Stock value</p>
                <p className="text-xl font-bold">{inventoryLoading ? '…' : formatCurrency(totalOnHand * product.latest_cogs)}</p>
                <p className="text-xs text-muted-foreground">At cost</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Warehouse className="h-5 w-5" />
              Current Stock by Branch
            </CardTitle>
            <CardDescription>
              Live levels per branch. Movement Total sums all recorded stock changes; a mismatch with
              On Hand means some changes weren&apos;t recorded.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {inventoryLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : branchInventory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No stock records found for this product.
              </div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Branch</TableHead>
                      <TableHead className="text-right">On Hand</TableHead>
                      <TableHead className="text-right">Movement Total</TableHead>
                      <TableHead>Audit Status</TableHead>
                      <TableHead>Last Movement</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(branchInventory as any[]).map((inv) => {
                      const movementTotal = movementTotals?.get(inv.branch_id) ?? 0
                      const discrepancy = Number(inv.quantity_on_hand) - movementTotal
                      const hasDiscrepancy = Math.abs(discrepancy) > 0.01
                      const isLowStock = Number(inv.quantity_on_hand) <= Number(product.reorder_point)
                      const isOutOfStock = Number(inv.quantity_on_hand) === 0
                      return (
                        <TableRow key={inv.id}>
                          <TableCell className="font-medium">{inv.branch?.name ?? '—'}</TableCell>
                          <TableCell className="text-right">
                            <span className={cn(
                              "font-mono font-semibold",
                              isOutOfStock ? "text-red-600" : isLowStock ? "text-amber-600" : "text-green-600"
                            )}>
                              {Number(inv.quantity_on_hand).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                            </span>
                            {' '}<span className="text-xs text-muted-foreground">{product.base_uom?.code}</span>
                            {isLowStock && !isOutOfStock && (
                              <Badge variant="outline" className="ml-2 text-xs border-amber-400 text-amber-600">Low Stock</Badge>
                            )}
                            {isOutOfStock && (
                              <Badge variant="destructive" className="ml-2 text-xs">Out of Stock</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-muted-foreground">
                            {auditLoading ? '…' : movementTotal.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                          </TableCell>
                          <TableCell>
                            {auditLoading ? (
                              <span className="text-muted-foreground text-sm">Loading…</span>
                            ) : hasDiscrepancy ? (
                              <div className="flex items-center gap-1.5 text-amber-600">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                <span className="text-sm">
                                  {discrepancy > 0 ? '+' : ''}{discrepancy.toLocaleString(undefined, { maximumFractionDigits: 4 })} unrecorded
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-green-600">
                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                                <span className="text-sm">Balanced</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {inv.last_movement_at
                              ? new Date(inv.last_movement_at).toLocaleDateString('en-PH', {
                                  year: 'numeric', month: 'short', day: 'numeric',
                                })
                              : '—'}
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

        {/* Details: reference info, compact */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-5 w-5" />
              Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y text-sm">
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-muted-foreground flex items-center gap-1.5"><Ruler className="h-3.5 w-3.5" /> Base unit</dt>
                <dd className="text-right">{product.base_uom?.name || 'N/A'}{product.base_uom?.code && <span className="text-muted-foreground"> ({product.base_uom.code})</span>}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-muted-foreground">Selling unit</dt>
                <dd className="text-right">{product.selling_uom?.name || 'N/A'}{product.selling_uom?.code && <span className="text-muted-foreground"> ({product.selling_uom.code})</span>}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-muted-foreground flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Reorder point</dt>
                <dd className="text-right font-medium text-amber-600">{product.reorder_point} {unitCode}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-muted-foreground">Reorder quantity</dt>
                <dd className="text-right">{product.reorder_quantity} {unitCode}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-muted-foreground">Reorder value</dt>
                <dd className="text-right">{formatCurrency(product.reorder_quantity * product.latest_cogs)}</dd>
              </div>
            </dl>
            {product.base_uom?.code !== product.selling_uom?.code && (
              <p className="mt-2 rounded-md bg-blue-50 dark:bg-blue-950/30 p-2 text-xs text-blue-900 dark:text-blue-100">
                Base and selling units differ — check the unit conversion setup.
              </p>
            )}
            {product.description && (
              <div className="mt-3 border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                <p className="text-sm whitespace-pre-wrap">{product.description}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sales History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Sales History
          </CardTitle>
          <CardDescription>
            All sales transactions that included this product
          </CardDescription>
          
          {/* Date Filters */}
          <div className="flex flex-wrap gap-3 pt-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="sales-start" className="text-sm">From:</Label>
              <Input
                id="sales-start"
                type="date"
                value={salesStartDate}
                onChange={(e) => {
                  setSalesStartDate(e.target.value)
                  setSalesPage(1)
                }}
                className="w-[150px]"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="sales-end" className="text-sm">To:</Label>
              <Input
                id="sales-end"
                type="date"
                value={salesEndDate}
                onChange={(e) => {
                  setSalesEndDate(e.target.value)
                  setSalesPage(1)
                }}
                className="w-[150px]"
              />
            </div>
            {(salesStartDate || salesEndDate) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSalesStartDate('')
                  setSalesEndDate('')
                  setSalesPage(1)
                }}
              >
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
            <div className="ml-auto text-sm text-muted-foreground">
              Showing {paginatedSalesHistory.length} of {filteredSalesHistory.length} records
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {salesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredSalesHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {salesStartDate || salesEndDate 
                ? 'No sales found for the selected date range.'
                : 'No sales found for this product.'}
            </div>
          ) : (
            <>
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Receipt #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Line Total</TableHead>
                      <TableHead className="w-[40px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedSalesHistory.map((line) => {
                      const txn = line.transaction
                      if (!txn) return null
                      return (
                        <TableRow key={line.id}>
                          <TableCell className="whitespace-nowrap">
                            {new Date(txn.transaction_date).toLocaleDateString('en-PH', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </TableCell>
                          <TableCell className="font-mono text-sm">{txn.transaction_number}</TableCell>
                          <TableCell>{txn.customer?.name ?? '—'}</TableCell>
                          <TableCell>{txn.branch?.name ?? '—'}</TableCell>
                          <TableCell>
                            <Badge variant={txn.transaction_type === 'sale' ? 'default' : 'secondary'} className="capitalize text-xs">
                              {txn.transaction_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {Number(line.quantity).toLocaleString()} {line.uom?.code}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(line.unit_price)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium">
                            {formatCurrency(line.line_total)}
                          </TableCell>
                          <TableCell>
                            <Link href={`/pos/history?txn=${txn.id}`}>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              
              {/* Pagination Controls */}
              {salesTotalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Page {salesPage} of {salesTotalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSalesPage(p => Math.max(1, p - 1))}
                      disabled={salesPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSalesPage(p => Math.min(salesTotalPages, p + 1))}
                      disabled={salesPage === salesTotalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Purchase History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Purchase History
          </CardTitle>
          <CardDescription>
            All purchase orders that included this product
          </CardDescription>
          
          {/* Date Filters */}
          <div className="flex flex-wrap gap-3 pt-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="purchase-start" className="text-sm">From:</Label>
              <Input
                id="purchase-start"
                type="date"
                value={purchaseStartDate}
                onChange={(e) => {
                  setPurchaseStartDate(e.target.value)
                  setPurchasePage(1)
                }}
                className="w-[150px]"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="purchase-end" className="text-sm">To:</Label>
              <Input
                id="purchase-end"
                type="date"
                value={purchaseEndDate}
                onChange={(e) => {
                  setPurchaseEndDate(e.target.value)
                  setPurchasePage(1)
                }}
                className="w-[150px]"
              />
            </div>
            {(purchaseStartDate || purchaseEndDate) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPurchaseStartDate('')
                  setPurchaseEndDate('')
                  setPurchasePage(1)
                }}
              >
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
            <div className="ml-auto text-sm text-muted-foreground">
              Showing {paginatedPurchaseHistory.length} of {filteredPurchaseHistory.length} records
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredPurchaseHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {purchaseStartDate || purchaseEndDate 
                ? 'No purchase orders found for the selected date range.'
                : 'No purchase orders found for this product.'}
            </div>
          ) : (
            <>
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>PO Number</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead className="text-right">Qty Ordered</TableHead>
                      <TableHead className="text-right">Qty Received</TableHead>
                      <TableHead className="text-right">Unit Cost</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[40px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedPurchaseHistory.map((line) => {
                      const po = line.purchase_order
                      if (!po) return null
                      return (
                        <TableRow key={line.id}>
                          <TableCell className="whitespace-nowrap">
                            {new Date(po.po_date).toLocaleDateString('en-PH', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </TableCell>
                          <TableCell className="font-mono text-sm">{po.po_number}</TableCell>
                          <TableCell>{po.supplier?.name ?? '—'}</TableCell>
                          <TableCell>{po.branch?.name ?? '—'}</TableCell>
                          <TableCell className="text-right font-mono">
                            {Number(line.quantity_ordered).toLocaleString()} {line.uom?.code}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            <span className={cn(
                              Number(line.quantity_received) >= Number(line.quantity_ordered)
                                ? 'text-green-600'
                                : Number(line.quantity_received) > 0
                                ? 'text-amber-600'
                                : 'text-muted-foreground'
                            )}>
                              {Number(line.quantity_received).toLocaleString()} {line.uom?.code}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(line.unit_cost)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={
                              po.status === 'received' ? 'default' :
                              po.status === 'partially_received' ? 'secondary' :
                              po.status === 'cancelled' ? 'destructive' :
                              'outline'
                            } className="capitalize text-xs">
                              {po.status.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Link href={`/purchases/${po.id}`}>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              
              {/* Pagination Controls */}
              {purchaseTotalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Page {purchasePage} of {purchaseTotalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPurchasePage(p => Math.max(1, p - 1))}
                      disabled={purchasePage === 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPurchasePage(p => Math.min(purchaseTotalPages, p + 1))}
                      disabled={purchasePage === purchaseTotalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* All Inventory Movements */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Inventory Movement History
          </CardTitle>
          <CardDescription>
            Complete audit trail: purchases, sales, returns, and manual adjustments
          </CardDescription>
          
          {/* Date Filters */}
          <div className="flex flex-wrap gap-3 pt-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="movements-start" className="text-sm">From:</Label>
              <Input
                id="movements-start"
                type="date"
                value={movementsStartDate}
                onChange={(e) => {
                  setMovementsStartDate(e.target.value)
                  setMovementsPage(1)
                }}
                className="w-[150px]"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="movements-end" className="text-sm">To:</Label>
              <Input
                id="movements-end"
                type="date"
                value={movementsEndDate}
                onChange={(e) => {
                  setMovementsEndDate(e.target.value)
                  setMovementsPage(1)
                }}
                className="w-[150px]"
              />
            </div>
            {(movementsStartDate || movementsEndDate) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMovementsStartDate('')
                  setMovementsEndDate('')
                  setMovementsPage(1)
                }}
              >
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
            <div className="ml-auto text-sm text-muted-foreground">
              Showing {paginatedMovements.length} of {filteredMovements.length} records
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {movementsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredMovements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {movementsStartDate || movementsEndDate
                ? 'No inventory movements found for the selected date range.'
                : 'No inventory movements recorded for this product.'}
            </div>
          ) : (
            <>
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Change</TableHead>
                      <TableHead className="text-right">Before</TableHead>
                      <TableHead className="text-right">After</TableHead>
                      <TableHead>By</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedMovements.map((movement: any) => {
                      const isIncrease = Number(movement.quantity_change) > 0
                      const movementTypeColors: Record<string, string> = {
                        purchase: 'bg-green-100 text-green-800 border-green-200',
                        sale: 'bg-red-100 text-red-800 border-red-200',
                        return: 'bg-blue-100 text-blue-800 border-blue-200',
                        adjustment: 'bg-amber-100 text-amber-800 border-amber-200',
                        transfer: 'bg-purple-100 text-purple-800 border-purple-200',
                        damaged_return: 'bg-orange-100 text-orange-800 border-orange-200',
                      }
                      const referenceLabels: Record<string, string> = {
                        transaction: 'Sale',
                        transaction_reversal: 'Deleted Txn',
                        inventory_correction: 'Bulk Correction',
                        manual_adjustment: 'Manual Count',
                        system_reconciliation: 'System Fix',
                        purchase_order: 'Purchase Order',
                      }
                      return (
                        <TableRow key={movement.id}>
                          <TableCell className="whitespace-nowrap text-sm">
                            {new Date(movement.created_at).toLocaleDateString('en-PH', {
                              year: 'numeric', month: 'short', day: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </TableCell>
                          <TableCell className="text-sm">{movement.branch?.name ?? '—'}</TableCell>
                          <TableCell>
                            <span className={cn(
                              'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize',
                              movementTypeColors[movement.movement_type] ?? 'bg-gray-100 text-gray-800 border-gray-200'
                            )}>
                              {movement.movement_type}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {referenceLabels[movement.reference_type ?? ''] ?? movement.reference_type ?? '—'}
                          </TableCell>
                          <TableCell className={cn(
                            "text-right font-mono font-semibold",
                            isIncrease ? "text-green-600" : "text-red-600"
                          )}>
                            {isIncrease ? '+' : ''}
                            {Number(movement.quantity_change).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-muted-foreground">
                            {Number(movement.quantity_before).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {Number(movement.quantity_after).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                          </TableCell>
                          <TableCell className="text-sm">{movement.created_by_user?.full_name ?? '—'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-xs">
                            <span className="line-clamp-2">{movement.notes ?? '—'}</span>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              
              {/* Pagination Controls */}
              {movementsTotalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Page {movementsPage} of {movementsTotalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setMovementsPage(p => Math.max(1, p - 1))}
                      disabled={movementsPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setMovementsPage(p => Math.min(movementsTotalPages, p + 1))}
                      disabled={movementsPage === movementsTotalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Product Images (the primary one is in the overview) */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ImageIcon className="h-5 w-5" />
              Product Images
              <span className="text-sm font-normal text-muted-foreground">
                {images.length > 0 ? `${images.length} uploaded` : 'none yet'}
              </span>
            </CardTitle>
            <Link href={`/products/${id}/edit`}>
              <Button variant="outline" size="sm">
                <ImageIcon className="mr-2 h-4 w-4" />
                {images.length > 0 ? 'Manage' : 'Add Images'}
              </Button>
            </Link>
          </div>
        </CardHeader>
        {images.length > 0 && (
          <CardContent>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {images.map((image: any) => (
                <div
                  key={image.id}
                  className={cn(
                    'relative aspect-square rounded-lg overflow-hidden border-2',
                    image.is_primary ? 'border-primary' : 'border-border'
                  )}
                >
                  <Image
                    src={image.url}
                    alt={image.alt_text || product.name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 33vw, (max-width: 768px) 25vw, (max-width: 1024px) 16vw, 12vw"
                    unoptimized
                    onError={(e) => {
                      console.error('Image failed to load:', image.url)
                      const target = e.target as HTMLImageElement
                      target.style.display = 'none'
                    }}
                  />
                  {image.is_primary && (
                    <div className="absolute top-1 left-1 bg-primary text-primary-foreground px-1.5 py-0.5 rounded text-[10px] font-medium">
                      Primary
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Record info */}
      <p className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
        <span>Created {new Date(product.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        <span>Updated {new Date(product.updated_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        <span>ID <span className="font-mono">{product.id}</span></span>
      </p>
    </div>
  )
}
