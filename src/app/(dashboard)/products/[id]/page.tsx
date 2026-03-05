'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useProduct, useDeleteProduct } from '@/hooks/useProducts'
import { useProductPurchaseHistory } from '@/hooks/usePurchases'
import { useProductSalesHistory, useProductAdjustmentHistory } from '@/hooks/useTransactions'
import { formatCurrency } from '@/lib/utils/formatting'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Package,
  DollarSign,
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
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
  const { data: adjustmentHistory = [], isLoading: adjustmentsLoading } = useProductAdjustmentHistory(id)
  const { data: product, isLoading, error } = useProduct(id)
  const deleteProduct = useDeleteProduct()
  const { data: purchaseHistory = [], isLoading: historyLoading } = useProductPurchaseHistory(id)

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

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/products">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{product.name}</h1>
            <p className="text-muted-foreground">
              Product Code: <span className="font-mono">{product.code}</span>
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/products/${id}/edit`}>
            <Button variant="outline">
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          </Link>
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

      {/* Status Badge */}
      <div>
        <Badge 
          variant={product.is_active ? 'default' : 'secondary'}
          className="text-base px-4 py-1"
        >
          {product.is_active ? (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Active
            </>
          ) : (
            <>
              <XCircle className="mr-2 h-4 w-4" />
              Inactive
            </>
          )}
        </Badge>
      </div>

      {/* Product Images */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Product Images
          </CardTitle>
          <CardDescription>
            {(product as any).images?.length > 0 
              ? `${(product as any).images.length} image(s) uploaded`
              : 'No images uploaded yet'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(product as any).images && (product as any).images.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {(product as any).images.map((image: any) => (
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
                    sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                    unoptimized
                    onError={(e) => {
                      console.error('Image failed to load:', image.url)
                      const target = e.target as HTMLImageElement
                      target.style.display = 'none'
                    }}
                  />
                  {image.is_primary && (
                    <div className="absolute top-2 left-2 bg-primary text-primary-foreground px-2 py-1 rounded-md text-xs font-medium">
                      Primary
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg">
              <div className="relative w-32 h-32 mb-4 opacity-20">
                <ImageIcon className="w-full h-full" />
              </div>
              <p className="text-muted-foreground text-sm mb-4">No product images uploaded</p>
              <Link href={`/products/${id}/edit`}>
                <Button variant="outline" size="sm">
                  <ImageIcon className="mr-2 h-4 w-4" />
                  Add Images
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Basic Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Product Code (SKU)</label>
              <p className="text-lg font-mono">{product.code}</p>
            </div>
            
            <Separator />
            
            <div>
              <label className="text-sm font-medium text-muted-foreground">Product Name</label>
              <p className="text-lg">{product.name}</p>
            </div>
            
            <Separator />
            
            <div>
              <label className="text-sm font-medium text-muted-foreground">Category</label>
              <p className="text-lg">
                {product.category?.name || 'Uncategorized'}
              </p>
              {product.subcategory && (
                <p className="text-sm text-muted-foreground">
                  Subcategory: {product.subcategory.name}
                </p>
              )}
            </div>
            
            {product.description && (
              <>
                <Separator />
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Description</label>
                  <p className="text-base whitespace-pre-wrap">{product.description}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Pricing Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Pricing Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Latest Cost (COGS)</label>
              <p className="text-2xl font-bold">{formatCurrency(product.latest_cogs)}</p>
            </div>
            
            <Separator />
            
            <div>
              <label className="text-sm font-medium text-muted-foreground">Markup Percentage</label>
              <p className="text-2xl font-bold text-blue-600">
                {product.markup_percentage.toFixed(2)}%
              </p>
            </div>
            
            <Separator />
            
            <div>
              <label className="text-sm font-medium text-muted-foreground">Current Selling Price</label>
              <p className="text-3xl font-bold text-green-600">
                {formatCurrency(product.current_selling_price)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Auto-calculated from COGS + Markup
              </p>
            </div>

            <Separator />

            <div className="bg-muted/50 p-4 rounded-lg">
              <label className="text-sm font-medium">Profit per Unit</label>
              <p className="text-xl font-bold text-green-600">
                {formatCurrency(product.current_selling_price - product.latest_cogs)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Units of Measure */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ruler className="h-5 w-5" />
              Units of Measure
            </CardTitle>
            <CardDescription>
              How this product is measured and sold
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Base Unit</label>
              <p className="text-lg">
                {product.base_uom?.name || 'N/A'}
                {product.base_uom?.code && (
                  <span className="text-muted-foreground"> ({product.base_uom.code})</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Used for inventory tracking
              </p>
            </div>
            
            <Separator />
            
            <div>
              <label className="text-sm font-medium text-muted-foreground">Selling Unit</label>
              <p className="text-lg">
                {product.selling_uom?.name || 'N/A'}
                {product.selling_uom?.code && (
                  <span className="text-muted-foreground"> ({product.selling_uom.code})</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Unit used when selling to customers
              </p>
            </div>

            {product.base_uom?.code !== product.selling_uom?.code && (
              <>
                <Separator />
                <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg">
                  <p className="text-sm text-blue-900 dark:text-blue-100">
                    <strong>Note:</strong> Different base and selling units may require unit conversion setup.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Inventory Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Inventory Settings
            </CardTitle>
            <CardDescription>
              Stock alert thresholds
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Reorder Point</label>
              <p className="text-2xl font-bold text-amber-600">
                {product.reorder_point} {product.base_uom?.code || 'units'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Alert when stock falls below this level
              </p>
            </div>
            
            <Separator />
            
            <div>
              <label className="text-sm font-medium text-muted-foreground">Reorder Quantity</label>
              <p className="text-2xl font-bold">
                {product.reorder_quantity} {product.base_uom?.code || 'units'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Suggested quantity to order when restocking
              </p>
            </div>

            <Separator />

            <div className="bg-muted/50 p-4 rounded-lg">
              <label className="text-sm font-medium">Reorder Value</label>
              <p className="text-xl font-bold">
                {formatCurrency(product.reorder_quantity * product.latest_cogs)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Cost to restock to suggested quantity
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

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
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : purchaseHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No purchase orders found for this product.
            </div>
          ) : (
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
                  {(purchaseHistory as any[]).map((line) => {
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
          )}
        </CardContent>
      </Card>

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
        </CardHeader>
        <CardContent>
          {salesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : salesHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No sales found for this product.
            </div>
          ) : (
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
                  {(salesHistory as any[]).map((line) => {
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
          )}
        </CardContent>
      </Card>

      {/* Inventory Adjustment History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Inventory Adjustments
          </CardTitle>
          <CardDescription>
            Manual inventory adjustments for this product
          </CardDescription>
        </CardHeader>
        <CardContent>
          {adjustmentsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : adjustmentHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No inventory adjustments found for this product.
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead className="text-right">Qty Before</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead className="text-right">Qty After</TableHead>
                    <TableHead>Adjusted By</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(adjustmentHistory as any[]).map((movement) => (
                    <TableRow key={movement.id}>
                      <TableCell className="whitespace-nowrap">
                        {new Date(movement.created_at).toLocaleDateString('en-PH', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </TableCell>
                      <TableCell>{movement.branch?.name ?? '—'}</TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(movement.quantity_before).toLocaleString()}
                      </TableCell>
                      <TableCell className={cn(
                        "text-right font-mono font-medium",
                        Number(movement.quantity_change) > 0 ? "text-green-600" : "text-red-600"
                      )}>
                        {Number(movement.quantity_change) > 0 ? '+' : ''}
                        {Number(movement.quantity_change).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {Number(movement.quantity_after).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-sm">
                        {movement.created_by_user?.full_name ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm max-w-xs truncate">
                        {movement.notes || movement.reference_type || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Additional Information */}
      <Card>
        <CardHeader>
          <CardTitle>Additional Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Product ID</label>
              <p className="text-sm font-mono">{product.id}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Created</label>
              <p className="text-sm">
                {new Date(product.created_at).toLocaleDateString('en-PH', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Last Updated</label>
              <p className="text-sm">
                {new Date(product.updated_at).toLocaleDateString('en-PH', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
