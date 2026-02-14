'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import { useCategories, useSubcategories, useUnitsOfMeasure, useCreateProduct, useUpdateProduct } from '@/hooks/useProducts'
import type { Product } from '@/lib/supabase/queries/products'
import { ProductImageUpload } from '@/components/products/product-image-upload'
import type { ProductImage } from '@/lib/supabase/storage/product-images'
import { addProductImageRecord } from '@/lib/supabase/storage/product-images'

const productFormSchema = z.object({
  code: z.string().min(1, 'Product code is required'),
  name: z.string().min(1, 'Product name is required'),
  category_id: z.string().uuid('Please select a category'),
  subcategory_id: z.string().optional(),
  base_uom_id: z.string().uuid('Please select a base unit'),
  selling_uom_id: z.string().uuid('Please select a selling unit'),
  conversion_factor: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: 'Conversion factor must be greater than 0',
  }),
  base_unit_cost: z.string().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
    message: 'Base unit cost must be a valid number',
  }),
  latest_cogs: z.string().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
    message: 'Cost must be a valid number',
  }),
  markup_percentage: z.string().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
    message: 'Markup must be a valid number',
  }),
  current_selling_price: z.string().optional(),
  reorder_point: z.string().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
    message: 'Reorder point must be a valid number',
  }),
  reorder_quantity: z.string().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
    message: 'Reorder quantity must be a valid number',
  }),
  description: z.string().optional(),
  is_active: z.boolean(),
})

type ProductFormValues = z.infer<typeof productFormSchema>

interface ProductFormProps {
  product?: Product
  mode: 'create' | 'edit'
}

export function ProductForm({ product, mode }: ProductFormProps) {
  const router = useRouter()
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(product?.category_id)
  const [productImages, setProductImages] = useState<ProductImage[]>(
    (product as any)?.images || []
  )

  const { data: categories } = useCategories()
  const { data: subcategories } = useSubcategories(selectedCategoryId)
  const { data: units } = useUnitsOfMeasure()
  
  const createProduct = useCreateProduct()
  const updateProduct = useUpdateProduct()

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      code: product?.code || '',
      name: product?.name || '',
      category_id: product?.category_id || '',
      subcategory_id: product?.subcategory_id || '',
      base_uom_id: product?.base_uom_id || '',
      selling_uom_id: product?.selling_uom_id || '',
      conversion_factor: (product as any)?.conversion_factor?.toString() || '1',
      base_unit_cost: product?.latest_cogs?.toString() || '0',
      latest_cogs: product?.latest_cogs?.toString() || '0',
      markup_percentage: product?.markup_percentage?.toString() || '20',
      current_selling_price: product?.current_selling_price?.toString() || '0',
      reorder_point: product?.reorder_point?.toString() || '10',
      reorder_quantity: product?.reorder_quantity?.toString() || '50',
      description: product?.description || '',
      is_active: product?.is_active ?? true,
    },
  })

  // Track which field was last edited to avoid circular updates
  const lastEditedField = useRef<'cost' | 'markup' | 'price' | null>(null)

  // Watch for changes in cost and markup
  const watchBaseUnitCost = form.watch('base_unit_cost')
  const watchCost = form.watch('latest_cogs')
  const watchMarkup = form.watch('markup_percentage')
  const watchBaseUom = form.watch('base_uom_id')
  const watchSellingUom = form.watch('selling_uom_id')
  const watchConversionFactor = form.watch('conversion_factor')

  // Check if units are different
  const isDifferentUnits = watchBaseUom && watchSellingUom && watchBaseUom !== watchSellingUom

  // Get unit names for display
  const baseUnitName = units?.find(u => u.id === watchBaseUom)?.name || 'base unit'
  const sellingUnitName = units?.find(u => u.id === watchSellingUom)?.name || 'selling unit'

  // Auto-calculate COGS from base unit cost and conversion factor
  useEffect(() => {
    const baseUnitCost = Number(watchBaseUnitCost) || 0
    const conversionFactor = Number(watchConversionFactor) || 1

    if (baseUnitCost >= 0) {
      let calculatedCogs: number
      
      if (isDifferentUnits && conversionFactor > 0) {
        // Calculate cost per selling unit: base cost / conversion factor
        // Example: 1100 per box / 20 kg = 55 per kg
        calculatedCogs = baseUnitCost / conversionFactor
      } else {
        // Same units, no conversion
        calculatedCogs = baseUnitCost
      }
      
      form.setValue('latest_cogs', calculatedCogs.toFixed(4))
    }
  }, [watchBaseUnitCost, watchConversionFactor, isDifferentUnits, form])

  // Calculate selling price when cost or markup changes
  useEffect(() => {
    if (lastEditedField.current === 'price') {
      lastEditedField.current = null
      return
    }
    const cost = Number(watchCost) || 0
    const markup = Number(watchMarkup) || 0
    if (cost > 0) {
      const sellingPrice = cost * (1 + markup / 100)
      form.setValue('current_selling_price', sellingPrice.toFixed(2))
    }
  }, [watchCost, watchMarkup, form])

  // Calculate markup when selling price is manually changed
  const handlePriceChange = (value: string) => {
    lastEditedField.current = 'price'
    form.setValue('current_selling_price', value)

    const cost = Number(watchCost) || 0
    const price = Number(value) || 0

    if (cost > 0 && price > 0) {
      const markup = ((price - cost) / cost) * 100
      form.setValue('markup_percentage', markup.toFixed(2))
    }
  }

  // Handle base unit cost change
  const handleBaseUnitCostChange = (value: string) => {
    form.setValue('base_unit_cost', value)
  }

  // Mark field as edited when markup changes
  const handleMarkupChange = (value: string) => {
    lastEditedField.current = 'markup'
    form.setValue('markup_percentage', value)
  }

  // Update subcategory options when category changes
  const handleCategoryChange = (value: string) => {
    setSelectedCategoryId(value)
    form.setValue('subcategory_id', '') // Reset subcategory when category changes
  }

  async function onSubmit(values: ProductFormValues) {
    try {
      // Convert string values to numbers
      const productData = {
        code: values.code,
        name: values.name,
        category_id: values.category_id,
        subcategory_id: values.subcategory_id || null,
        base_uom_id: values.base_uom_id,
        selling_uom_id: values.selling_uom_id,
        conversion_factor: Number(values.conversion_factor),
        latest_cogs: Number(values.latest_cogs),
        markup_percentage: Number(values.markup_percentage),
        current_selling_price: Number(values.current_selling_price),
        reorder_point: Number(values.reorder_point),
        reorder_quantity: Number(values.reorder_quantity),
        description: values.description || null,
        is_active: values.is_active,
      }

      if (mode === 'create') {
        const newProduct = await createProduct.mutateAsync(productData)
        
        // Save temporary images to database with actual product ID
        if (productImages.length > 0) {
          for (const image of productImages) {
            await addProductImageRecord(
              newProduct.id,
              image.url,
              image.is_primary,
              image.alt_text || undefined
            )
          }
        }
        
        toast.success('Product created successfully')
      } else {
        await updateProduct.mutateAsync({
          id: product!.id,
          updates: productData,
        })
        toast.success('Product updated successfully')
      }

      router.push('/products')
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'An error occurred')
    }
  }

  const isLoading = createProduct.isPending || updateProduct.isPending

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>
              Enter the basic details of the product
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product Code (SKU) *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., PROD-001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Portland Cement" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category *</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value)
                        handleCategoryChange(value)
                      }}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories?.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="subcategory_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subcategory</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value || undefined}
                      disabled={!selectedCategoryId}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select subcategory" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {subcategories?.map((subcategory) => (
                          <SelectItem key={subcategory.id} value={subcategory.id}>
                            {subcategory.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter product description"
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Units of Measure */}
        <Card>
          <CardHeader>
            <CardTitle>Units of Measure</CardTitle>
            <CardDescription>
              Define how the product is measured and sold
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="base_uom_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Base Unit *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select base unit" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {units?.map((unit) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.name} ({unit.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      The standard unit for inventory tracking
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="selling_uom_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Selling Unit *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select selling unit" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {units?.map((unit) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.name} ({unit.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      The unit used when selling to customers
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Conversion Factor - Only show when units are different */}
            {isDifferentUnits && (
              <FormField
                control={form.control}
                name="conversion_factor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit Conversion Factor *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.0001"
                        placeholder="1"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      How many <strong>{sellingUnitName}s</strong> are in 1 <strong>{baseUnitName}</strong>? 
                      (e.g., 1 box = 20 kg → enter 20)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </CardContent>
        </Card>

        {/* Pricing */}
        <Card>
          <CardHeader>
            <CardTitle>Pricing</CardTitle>
            <CardDescription>
              Set the cost and pricing for this product
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="base_unit_cost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Base Unit Cost ({baseUnitName}) *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={field.value}
                        onChange={(e) => handleBaseUnitCostChange(e.target.value)}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <FormDescription>
                      Cost per {baseUnitName} {isDifferentUnits ? '(will be converted)' : ''}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="latest_cogs"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>COGS per {sellingUnitName}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.0001"
                        placeholder="0.00"
                        value={field.value}
                        disabled
                        className="bg-muted"
                      />
                    </FormControl>
                    <FormDescription>
                      {isDifferentUnits 
                        ? `Auto-calculated: ${watchBaseUnitCost || 0} ÷ ${watchConversionFactor || 1}` 
                        : 'Same as base unit cost'}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="markup_percentage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Markup %</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="20"
                        value={field.value}
                        onChange={(e) => handleMarkupChange(e.target.value)}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <FormDescription>
                      Auto-adjusts with price
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="current_selling_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Selling Price *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={field.value}
                        onChange={(e) => handlePriceChange(e.target.value)}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <FormDescription>
                      Editable - markup adjusts
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Inventory Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Inventory Settings</CardTitle>
            <CardDescription>
              Configure reorder points and stock alerts (tracked in base units)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="reorder_point"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reorder Point ({baseUnitName}) *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="1"
                        placeholder="10"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Alert when stock falls below this quantity
                      {isDifferentUnits && ` (inventory tracked in ${baseUnitName}s)`}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="reorder_quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reorder Quantity ({baseUnitName}) *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="1"
                        placeholder="50"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Suggested quantity to reorder
                      {isDifferentUnits && ` (in ${baseUnitName}s)`}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Product Images */}
        <Card>
          <CardHeader>
            <CardTitle>Product Images</CardTitle>
            <CardDescription>
              Upload images of the product. The first image will be the primary image.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProductImageUpload
              productId={product?.id}
              images={productImages}
              onImagesChange={setProductImages}
              maxImages={5}
            />
          </CardContent>
        </Card>

        {/* Additional Information */}
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Active</FormLabel>
                    <FormDescription>
                      Make this product available for sale
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/products')}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'create' ? 'Create Product' : 'Update Product'}
          </Button>
        </div>
      </form>
    </Form>
  )
}
