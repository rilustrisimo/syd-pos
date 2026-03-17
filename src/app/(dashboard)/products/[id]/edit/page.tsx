'use client'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Lock } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ProductForm } from '@/components/forms/product-form'
import { useProduct } from '@/hooks/useProducts'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export default function EditProductPage() {
  const params = useParams()
  const router = useRouter()
  const productId = params.id as string

  const { data: product, isLoading, error } = useProduct(productId)

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
          <AlertTitle>Error</AlertTitle>
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

  // Block editing of inactive products
  if (!product.is_active) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href={`/products/${productId}`}>
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{product.name}</h1>
            <p className="text-muted-foreground font-mono text-sm">{product.code}</p>
          </div>
        </div>

        <Alert className="border-orange-300 bg-orange-50 text-orange-900">
          <Lock className="h-4 w-4 text-orange-600" />
          <AlertTitle>Product is Inactive</AlertTitle>
          <AlertDescription>
            This product is currently inactive and cannot be edited. Go back to the product detail
            page and click <strong>Activate</strong> to enable editing.
          </AlertDescription>
        </Alert>

        <Link href={`/products/${productId}`}>
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Product
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-4">
        <Link href="/products">
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Product</h1>
          <p className="text-muted-foreground">
            Update product information for {product.name}
          </p>
        </div>
      </div>

      {/* Form */}
      <ProductForm mode="edit" product={product} />
    </div>
  )
}
