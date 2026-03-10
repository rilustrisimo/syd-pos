/**
 * Product Selling Units Manager
 * Component to manage multiple selling units for a product
 */

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2, Star } from 'lucide-react'
import {
  useProductSellingUnits,
  useCreateSellingUnit,
  useUpdateSellingUnit,
  useDeleteSellingUnit,
  useSetPrimarySellingUnit,
} from '@/hooks/useProductSellingUnits'
import { useUnitsOfMeasure } from '@/hooks/useProducts'
import { formatCurrency } from '@/lib/utils/formatting'
import { calculateSellingPrice } from '@/lib/supabase/queries/product-selling-units'

interface ProductSellingUnitsManagerProps {
  productId: string
  baseUomId: string
  sellingUomId: string // primary selling unit - cannot be deleted
  productCOGS: number // latest_cogs from product
}

export function ProductSellingUnitsManager({
  productId,
  baseUomId,
  sellingUomId,
  productCOGS,
}: ProductSellingUnitsManagerProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingUnit, setEditingUnit] = useState<any>(null)

  const { data: sellingUnits = [], isLoading } = useProductSellingUnits(productId)
  const { data: units = [] } = useUnitsOfMeasure()
  const createUnit = useCreateSellingUnit()
  const updateUnit = useUpdateSellingUnit()
  const deleteUnit = useDeleteSellingUnit()
  const setPrimary = useSetPrimarySellingUnit()

  // Dialog form state
  const [formData, setFormData] = useState({
    uom_id: '',
    conversion_factor: '1',
    markup_percentage: '20',
    selling_price: '0',
  })

  const handleOpenDialog = (unit?: any) => {
    if (unit) {
      setEditingUnit(unit)
      setFormData({
        uom_id: unit.uom_id,
        conversion_factor: unit.conversion_factor.toString(),
        markup_percentage: unit.markup_percentage.toString(),
        selling_price: unit.selling_price.toString(),
      })
    } else {
      setEditingUnit(null)
      setFormData({
        uom_id: '',
        conversion_factor: '1',
        markup_percentage: '20',
        selling_price: '0',
      })
    }
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingUnit(null)
  }

  // Auto-calculate price when conversion factor or markup changes
  const handleConversionChange = (value: string) => {
    setFormData(prev => {
      const conversionFactor = Number(value) || 1
      const sellingPrice = Number(prev.selling_price) || 0
      
      // Calculate base price for this unit: base COGS / conversion factor
      const basePricePerUnit = productCOGS / conversionFactor
      
      // Calculate markup percentage based on current selling price
      const markup = basePricePerUnit > 0 
        ? ((sellingPrice - basePricePerUnit) / basePricePerUnit) * 100 
        : Number(prev.markup_percentage) || 0
      
      return {
        ...prev,
        conversion_factor: value,
        markup_percentage: markup.toFixed(2),
      }
    })
  }

  const handleMarkupChange = (value: string) => {
    setFormData(prev => {
      const conversionFactor = Number(prev.conversion_factor) || 1
      const markup = Number(value) || 0
      const price = calculateSellingPrice(productCOGS, conversionFactor, markup)
      return {
        ...prev,
        markup_percentage: value,
        selling_price: price.toFixed(2),
      }
    })
  }

  const handlePriceChange = (value: string) => {
    setFormData(prev => {
      const sellingPrice = Number(value) || 0
      const conversionFactor = Number(prev.conversion_factor) || 1
      
      // Calculate base price for this unit: base COGS / conversion factor
      const basePricePerUnit = productCOGS / conversionFactor
      
      // Calculate markup percentage: ((selling - base) / base) * 100
      const markup = basePricePerUnit > 0 
        ? ((sellingPrice - basePricePerUnit) / basePricePerUnit) * 100 
        : 0
      
      return {
        ...prev,
        selling_price: value,
        markup_percentage: markup.toFixed(2),
      }
    })
  }

  const handleSubmit = async () => {
    try {
      if (editingUnit) {
        await updateUnit.mutateAsync({
          id: editingUnit.id,
          conversion_factor: Number(formData.conversion_factor),
          markup_percentage: Number(formData.markup_percentage),
          selling_price: Number(formData.selling_price),
        })
      } else {
        await createUnit.mutateAsync({
          product_id: productId,
          uom_id: formData.uom_id,
          conversion_factor: Number(formData.conversion_factor),
          markup_percentage: Number(formData.markup_percentage),
          selling_price: Number(formData.selling_price),
        })
      }
      handleCloseDialog()
    } catch (error) {
      // Error handled by mutation
    }
  }

  const handleDelete = async (id: string, uomId: string) => {
    // Prevent deletion of the primary selling unit
    if (uomId === sellingUomId) {
      alert('Cannot delete the primary selling unit. Please change the primary selling unit first in the product settings above.')
      return
    }
    
    if (confirm('Are you sure you want to remove this selling unit?')) {
      await deleteUnit.mutateAsync(id)
    }
  }

  const handleSetPrimary = async (id: string) => {
    await setPrimary.mutateAsync(id)
  }

  // Filter out units already added
  const availableUnits = units.filter(
    unit => !sellingUnits.some(su => su.uom_id === unit.id) || (editingUnit && unit.id === editingUnit.uom_id)
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Add multiple selling units with different prices
          </p>
        </div>
        <Button type="button" onClick={() => handleOpenDialog()} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Selling Unit
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : sellingUnits.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No additional selling units. The primary unit is set in the base settings above.
        </p>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unit</TableHead>
                <TableHead>Conversion</TableHead>
                <TableHead>Markup</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sellingUnits.map((unit) => (
                <TableRow key={unit.id}>
                  <TableCell className="font-medium">
                    {unit.uom?.name || 'Unknown'}
                    {unit.is_primary && (
                      <Badge variant="default" className="ml-2">
                        <Star className="h-3 w-3 mr-1" />
                        Primary
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {unit.conversion_factor} {unit.uom?.name} per 1 base unit
                  </TableCell>
                  <TableCell>{unit.markup_percentage}%</TableCell>
                  <TableCell>{formatCurrency(unit.selling_price)}</TableCell>
                  <TableCell>
                    <Badge variant={unit.is_active ? 'default' : 'secondary'}>
                      {unit.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {!unit.is_primary && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSetPrimary(unit.id)}
                          title="Set as primary"
                        >
                          <Star className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDialog(unit)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(unit.id, unit.uom_id)}
                        disabled={unit.uom_id === sellingUomId}
                        title={unit.uom_id === sellingUomId ? "Cannot delete the primary selling unit" : "Delete unit"}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingUnit ? 'Edit Selling Unit' : 'Add Selling Unit'}
            </DialogTitle>
            <DialogDescription>
              Define pricing for this unit. Product COGS: {formatCurrency(productCOGS)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Unit of Measure *</Label>
              <Select
                value={formData.uom_id}
                onValueChange={(value) => setFormData(prev => ({ ...prev, uom_id: value }))}
                disabled={!!editingUnit}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  {availableUnits.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.name} ({unit.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Conversion Factor *</Label>
              <Input
                type="number"
                step="0.0001"
                placeholder="1"
                value={formData.conversion_factor}
                onChange={(e) => handleConversionChange(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                How many of this unit equals 1 base unit<br />
                Example: 1 m³ = 20 sacks → enter 20
              </p>
            </div>

            <div className="space-y-2">
              <Label>Markup % *</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="20"
                value={formData.markup_percentage}
                onChange={(e) => handleMarkupChange(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Selling Price *</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.selling_price}
                onChange={(e) => handlePriceChange(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Auto-calculated from COGS, conversion, and markup. Can be edited.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!formData.uom_id || createUnit.isPending || updateUnit.isPending}
            >
              {editingUnit ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
