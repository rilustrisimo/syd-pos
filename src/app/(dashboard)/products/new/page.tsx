'use client'

import { useEffect } from 'react'
import { ProductForm } from '@/components/forms/product-form'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

const STORAGE_KEY = 'products-filters'

export default function NewProductPage() {
  // Clear products list filters when mounting new product page
  useEffect(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch (error) {
      console.error('Failed to clear session filters:', error)
    }
  }, [])

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
          <h1 className="text-3xl font-bold tracking-tight">Create New Product</h1>
          <p className="text-muted-foreground">
            Add a new product to your inventory
          </p>
        </div>
      </div>

      {/* Form */}
      <ProductForm mode="create" />
    </div>
  )
}
