'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useBranches, useAdjustInventory } from '@/hooks/useInventory'
import type { Branch } from '@/lib/supabase/queries/inventory'
import { useProducts } from '@/hooks/useProducts'
import { useAuthStore } from '@/lib/stores/auth'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Minus, Loader2, Save } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function AdjustStockPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [selectedBranch, setSelectedBranch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState('')
  const [adjustmentType, setAdjustmentType] = useState<'add' | 'subtract'>('add')
  const [quantity, setQuantity] = useState('')
  const [notes, setNotes] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Debounce search to prevent UI freezing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(productSearch)
    }, 300)
    return () => clearTimeout(timer)
  }, [productSearch])

  const { data: branches, isLoading: branchesLoading } = useBranches()
  const branchesList: Branch[] = branches || []
  const { data: productsData, isLoading: productsLoading } = useProducts({
    search: debouncedSearch,
    limit: 20,
  })
  const adjustMutation = useAdjustInventory()

  const products = productsData?.data || []
  const selectedProductData = useMemo(
    () => products.find((p) => p.id === selectedProduct),
    [products, selectedProduct]
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedBranch || !selectedProduct || !quantity || !notes.trim()) {
      toast.error('Please fill in all required fields')
      return
    }

    if (!user?.id) {
      toast.error('User not authenticated')
      return
    }

    const quantityNum = parseFloat(quantity)
    if (isNaN(quantityNum) || quantityNum <= 0) {
      toast.error('Please enter a valid positive quantity')
      return
    }

    const quantityChange = adjustmentType === 'add' ? quantityNum : -quantityNum

    try {
      await adjustMutation.mutateAsync({
        branchId: selectedBranch,
        productId: selectedProduct,
        quantityChange,
        notes: notes.trim(),
        userId: user.id,
      })

      toast.success(
        `Successfully ${adjustmentType === 'add' ? 'added' : 'removed'} ${quantityNum} units`
      )
      
      // Reset form
      setSelectedProduct('')
      setQuantity('')
      setNotes('')
      setProductSearch('')
      
      // Navigate back after a short delay
      setTimeout(() => {
        router.push('/inventory')
      }, 1000)
    } catch (error: any) {
      toast.error(error.message || 'Failed to adjust inventory')
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-4">
        <Link href="/inventory">
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Adjust Stock</h1>
          <p className="text-muted-foreground">
            Manually add or remove inventory with a reason
          </p>
        </div>
      </div>

      {/* Info Alert */}
      <Alert>
        <AlertDescription>
          Use this form to manually adjust inventory levels. All adjustments are logged
          with timestamp, user, and reason for audit purposes.
        </AlertDescription>
      </Alert>

      {/* Adjustment Form */}
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Stock Adjustment Details</CardTitle>
            <CardDescription>
              Select a branch and product, then specify the adjustment quantity
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Branch Selection */}
            <div className="space-y-2">
              <Label htmlFor="branch">
                Branch <span className="text-destructive">*</span>
              </Label>
              <Select
                value={selectedBranch}
                onValueChange={setSelectedBranch}
                disabled={branchesLoading}
              >
                <SelectTrigger id="branch">
                  <SelectValue placeholder="Select a branch..." />
                </SelectTrigger>
                <SelectContent>
                  {branchesList?.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Product Search and Selection */}
            <div className="space-y-2">
              <Label htmlFor="product-search">
                Product <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="product-search"
                  placeholder="Search for a product..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
                {productsLoading && productSearch && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
              {debouncedSearch && products.length > 0 && (
                <div className="mt-2 space-y-1 border rounded-lg p-2 max-h-64 overflow-y-auto">
                  {products.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => {
                        setSelectedProduct(product.id)
                        setProductSearch(product.name)
                      }}
                      className={`w-full text-left p-3 rounded hover:bg-accent transition-colors ${
                        selectedProduct === product.id ? 'bg-accent' : ''
                      }`}
                    >
                      <div className="font-medium">{product.name}</div>
                      <div className="text-sm text-muted-foreground">
                        Code: {product.code} • Category: {product.category?.name || 'N/A'}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {selectedProductData && (
                <Alert className="mt-2">
                  <AlertDescription>
                    <strong>Selected:</strong> {selectedProductData.name} (
                    {selectedProductData.code})
                    <br />
                    <span className="text-sm">
                      Base Unit: {selectedProductData.base_uom?.name} (
                      {selectedProductData.base_uom?.code})
                    </span>
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Adjustment Type */}
            <div className="space-y-3">
              <Label>
                Adjustment Type <span className="text-destructive">*</span>
              </Label>
              <RadioGroup
                value={adjustmentType}
                onValueChange={(value: string) => setAdjustmentType(value as 'add' | 'subtract')}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="add" id="add" />
                  <Label htmlFor="add" className="font-normal cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Plus className="h-4 w-4 text-green-600" />
                      <span>Add Stock (Increase inventory)</span>
                    </div>
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="subtract" id="subtract" />
                  <Label htmlFor="subtract" className="font-normal cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Minus className="h-4 w-4 text-red-600" />
                      <span>Remove Stock (Decrease inventory)</span>
                    </div>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Quantity */}
            <div className="space-y-2">
              <Label htmlFor="quantity">
                Quantity {selectedProductData?.base_uom?.code && `(${selectedProductData.base_uom.code})`}{' '}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="quantity"
                type="number"
                step="0.01"
                min="0"
                placeholder="Enter quantity..."
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Enter the quantity to {adjustmentType === 'add' ? 'add to' : 'remove from'}{' '}
                inventory
              </p>
            </div>

            {/* Notes/Reason */}
            <div className="space-y-2">
              <Label htmlFor="notes">
                Reason / Notes <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="notes"
                placeholder="Explain why this adjustment is needed..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Examples: "Received damaged goods", "Physical count correction", "Expired
                stock removal"
              </p>
            </div>

            {/* Summary */}
            {selectedProduct && quantity && (
              <Alert>
                <AlertDescription>
                  <strong>Summary:</strong> This will{' '}
                  <span className={adjustmentType === 'add' ? 'text-green-600' : 'text-red-600'}>
                    {adjustmentType === 'add' ? 'add' : 'remove'}
                  </span>{' '}
                  <strong>{quantity} {selectedProductData?.base_uom?.code || 'units'}</strong>{' '}
                  {adjustmentType === 'add' ? 'to' : 'from'} the inventory of{' '}
                  <strong>{selectedProductData?.name}</strong> at the selected branch.
                </AlertDescription>
              </Alert>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                type="submit"
                disabled={
                  !selectedBranch ||
                  !selectedProduct ||
                  !quantity ||
                  !notes.trim() ||
                  adjustMutation.isPending
                }
                className="flex-1"
              >
                {adjustMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Submit Adjustment
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/inventory')}
                disabled={adjustMutation.isPending}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
