'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useProduct, useDeleteProduct } from '@/hooks/useProducts'
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
  Loader2
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface ProductDetailPageProps {
  params: Promise<{ id: string }>
}

export default function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { id } = use(params)
  const router = useRouter()
  
  const { data: product, isLoading, error } = useProduct(id)
  const deleteProduct = useDeleteProduct()

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
