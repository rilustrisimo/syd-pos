'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCreatePurchaseOrder } from '@/hooks/usePurchases'
import { useSuppliers } from '@/hooks/useSuppliers'
import { useBranches } from '@/hooks/useInventory'
import { useProducts } from '@/hooks/useProducts'
import { formatCurrency } from '@/lib/utils/formatting'
import { useAuthStore } from '@/lib/stores/auth'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Plus,
  Trash2,
  Search,
  Loader2,
  Package,
  Building2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

interface POLine {
  product_id: string
  product_code: string
  product_name: string
  uom_id: string
  uom_code: string
  quantity_ordered: number
  unit_cost: number
}

export default function NewPurchaseOrderPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const createMutation = useCreatePurchaseOrder()

  const [supplierId, setSupplierId] = useState('')
  const [branchId, setBranchId] = useState('')
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<POLine[]>([])

  const [productSearchOpen, setProductSearchOpen] = useState(false)
  const [productSearchQuery, setProductSearchQuery] = useState('')

  const { data: suppliersData, isLoading: suppliersLoading } = useSuppliers({ limit: 100 })
  const { data: branches, isLoading: branchesLoading } = useBranches()
  const { data: productsData, isLoading: productsLoading } = useProducts({
    search: productSearchQuery || undefined,
    limit: 20,
  })

  const suppliers = suppliersData?.data || []
  const products = productsData?.data || []
  const branchesList = branches as any[] || []

  // Set default branch when loaded
  useEffect(() => {
    if (branchesList && branchesList.length > 0 && !branchId) {
      setBranchId(branchesList[0].id)
    }
  }, [branchesList, branchId])

  const handleAddProduct = (product: any) => {
    // Check if already added
    if (lines.some((l) => l.product_id === product.id)) {
      toast.error('Product already added')
      return
    }

    setLines([
      ...lines,
      {
        product_id: product.id,
        product_code: product.code,
        product_name: product.name,
        uom_id: product.base_uom?.id || product.base_uom_id,
        uom_code: product.base_uom?.code || 'PC',
        quantity_ordered: 1,
        unit_cost: product.latest_cogs || 0,
      },
    ])
    setProductSearchOpen(false)
    setProductSearchQuery('')
  }

  const handleUpdateLine = (index: number, updates: Partial<POLine>) => {
    const newLines = [...lines]
    newLines[index] = { ...newLines[index], ...updates }
    setLines(newLines)
  }

  const handleRemoveLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index))
  }

  const calculateTotal = () => {
    return lines.reduce((sum, line) => sum + line.quantity_ordered * line.unit_cost, 0)
  }

  const handleSubmit = async () => {
    if (!supplierId) {
      toast.error('Please select a supplier')
      return
    }

    if (!branchId) {
      toast.error('Please select a branch')
      return
    }

    if (lines.length === 0) {
      toast.error('Please add at least one product')
      return
    }

    if (!user?.id) {
      toast.error('User not authenticated')
      return
    }

    try {
      const po = await createMutation.mutateAsync({
        po: {
          supplier_id: supplierId,
          branch_id: branchId,
          po_date: new Date().toISOString().split('T')[0],
          expected_delivery_date: expectedDeliveryDate || null,
          actual_delivery_date: null,
          status: 'draft',
          notes: notes || null,
          created_by: user.id,
          total_amount: calculateTotal(),
        },
        lines: lines.map((line, index) => ({
          product_id: line.product_id,
          variant_id: null,
          uom_id: line.uom_id,
          quantity_ordered: line.quantity_ordered,
          quantity_received: 0,
          unit_cost: line.unit_cost,
          line_number: index + 1,
          notes: null,
        })),
      })

      toast.success('Purchase order saved. You can now print and send it to the supplier.')
      router.push(`/purchases/${(po as any).id}`)
    } catch (error: any) {
      toast.error(error.message || 'Failed to create purchase order')
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Purchase Order</h1>
          <p className="text-muted-foreground">
            Create a new purchase order for your supplier
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Details */}
          <Card>
            <CardHeader>
              <CardTitle>Order Details</CardTitle>
              <CardDescription>
                Select the supplier and branch for this order
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="supplier">Supplier *</Label>
                  <Select value={supplierId} onValueChange={setSupplierId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select supplier..." />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.id}>
                          <span className="flex items-center gap-2">
                            <Building2 className="h-4 w-4" />
                            {supplier.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="branch">Receiving Branch *</Label>
                  <Select value={branchId} onValueChange={setBranchId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select branch..." />
                    </SelectTrigger>
                    <SelectContent>
                      {branchesList.map((branch: any) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expectedDelivery">Expected Delivery Date</Label>
                  <Input
                    id="expectedDelivery"
                    type="date"
                    value={expectedDeliveryDate}
                    onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Products</CardTitle>
                  <CardDescription>Add products to your purchase order</CardDescription>
                </div>
                <Popover open={productSearchOpen} onOpenChange={setProductSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Product
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="end">
                    <Command>
                      <CommandInput
                        placeholder="Search products..."
                        value={productSearchQuery}
                        onValueChange={setProductSearchQuery}
                      />
                      <CommandList>
                        <CommandEmpty>No products found</CommandEmpty>
                        <CommandGroup>
                          {products.map((product) => (
                            <CommandItem
                              key={product.id}
                              value={product.code + product.name}
                              onSelect={() => handleAddProduct(product)}
                            >
                              <div className="flex flex-col">
                                <span className="font-medium">{product.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {product.code} | Last Cost:{' '}
                                  {formatCurrency(product.latest_cogs)}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </CardHeader>
            <CardContent>
              {lines.length === 0 ? (
                <div className="text-center py-8">
                  <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    No products added yet. Click "Add Product" to start.
                  </p>
                </div>
              ) : (
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>UOM</TableHead>
                        <TableHead className="w-[120px]">Quantity</TableHead>
                        <TableHead className="w-[150px]">Unit Cost</TableHead>
                        <TableHead className="text-right w-[120px]">Line Total</TableHead>
                        <TableHead className="w-[60px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line, index) => (
                        <TableRow key={line.product_id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{line.product_name}</div>
                              <div className="text-xs text-muted-foreground font-mono">
                                {line.product_code}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{line.uom_code}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="1"
                              value={line.quantity_ordered}
                              onChange={(e) =>
                                handleUpdateLine(index, {
                                  quantity_ordered: parseFloat(e.target.value) || 1,
                                })
                              }
                              className="w-full"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.unit_cost}
                              onChange={(e) =>
                                handleUpdateLine(index, {
                                  unit_cost: parseFloat(e.target.value) || 0,
                                })
                              }
                              className="w-full"
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            {formatCurrency(line.quantity_ordered * line.unit_cost)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveLine(index)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Add any notes or special instructions..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </CardContent>
          </Card>
        </div>

        {/* Summary Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Items</span>
                <span>{lines.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Quantity</span>
                <span>
                  {lines.reduce((sum, l) => sum + l.quantity_ordered, 0).toLocaleString()}
                </span>
              </div>
              <div className="border-t pt-4">
                <div className="flex justify-between font-semibold text-lg">
                  <span>Total</span>
                  <span className="font-mono">{formatCurrency(calculateTotal())}</span>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={createMutation.isPending || lines.length === 0}
              >
                {createMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save Purchase Order
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
            </CardFooter>
          </Card>

          {/* Selected Supplier Info */}
          {supplierId && suppliers.find((s) => s.id === supplierId) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Supplier Details</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                {(() => {
                  const supplier = suppliers.find((s) => s.id === supplierId)
                  return supplier ? (
                    <>
                      <div>
                        <span className="font-medium">{supplier.name}</span>
                      </div>
                      {supplier.contact_person && (
                        <div className="text-muted-foreground">
                          Contact: {supplier.contact_person}
                        </div>
                      )}
                      {supplier.phone && (
                        <div className="text-muted-foreground">
                          Phone: {supplier.phone}
                        </div>
                      )}
                      {supplier.payment_terms && (
                        <div className="text-muted-foreground">
                          Terms: {supplier.payment_terms}
                        </div>
                      )}
                    </>
                  ) : null
                })()}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
