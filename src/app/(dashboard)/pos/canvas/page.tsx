'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useCanvasStore } from '@/lib/stores/canvasStore'
import { usePOSStore } from '@/lib/stores/posStore'
import { useAuthStore } from '@/lib/stores/auth'
import { usePOSProductSearch } from '@/hooks/useTransactions'
import { useAllActiveCustomers, useCreateCustomer } from '@/hooks/useCustomers'
import { useBranches } from '@/hooks/useInventory'
import { useDiscountRules } from '@/hooks/useDiscountRules'
import { useCanvases, useCreateCanvas, useDeleteCanvas } from '@/hooks/useCanvases'
import { getProductSellingUnits } from '@/lib/supabase/queries/product-selling-units'
import { getStandardDiscountForMarkup } from '@/lib/supabase/queries/discount-rules'
import { getTodayPH, createTimestampPH } from '@/lib/utils/datetime'
import { toast } from 'sonner'
import {
  Search,
  ShoppingCart,
  User,
  Trash2,
  Plus,
  Minus,
  X,
  Loader2,
  ClipboardList,
  Save,
  Tag,
  UserPlus,
  ChevronRight,
  FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const WALK_IN_CUSTOMER = {
  id: '446961e1-fcce-40bb-9f5a-3ea10cf976ea',
  name: 'Walk-in Customer',
  phone: null,
  customer_type: 'cash' as const,
  credit_limit: 0,
  outstanding_balance: 0,
}

export default function CanvasPage() {
  const router = useRouter()
  const { user } = useAuthStore()

  // ── Canvas store ─────────────────────────────────────────────────────────
  const {
    items,
    customer,
    branchId,
    deliveryFee,
    otherFees,
    otherFeesNotes,
    discountAmount,
    discountPercentage,
    discountType,
    notes,
    title,
    addItem,
    updateItemQuantity,
    updateItemDiscount,
    removeItem,
    clearCanvas,
    setCustomer,
    setBranchId,
    setDeliveryFee,
    setOtherFees,
    setOtherFeesNotes,
    setDiscountType,
    setDiscountAmount,
    setDiscountPercentage,
    setNotes,
    setTitle,
    resetAll,
    getSubtotal,
    getTotalDiscount,
    getTotal,
    getItemCount,
  } = useCanvasStore()

  // For "Convert to Sale" — load into POS store
  const posStore = usePOSStore()

  // ── Local UI state ────────────────────────────────────────────────────────
  const [productSearch, setProductSearch] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [isCustomerOpen, setIsCustomerOpen] = useState(false)
  const [isSaveOpen, setIsSaveOpen] = useState(false)
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isNewCustomerOpen, setIsNewCustomerOpen] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [newCustomerType, setNewCustomerType] = useState<'cash' | 'credit'>('cash')
  const [canvasDate, setCanvasDate] = useState('')
  const [isMounted, setIsMounted] = useState(false)
  const [discountInput, setDiscountInput] = useState('')
  const [isUnitSelectorOpen, setIsUnitSelectorOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<any>(null)
  const [selectedUnitId, setSelectedUnitId] = useState<string>('')
  const [listPage, setListPage] = useState(1)

  // Local string state for fee inputs — allows intermediate typing like "1." or "150.5"
  const [deliveryFeeStr, setDeliveryFeeStr] = useState('')
  const [otherFeesStr, setOtherFeesStr] = useState('')

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: branches } = useBranches()
  const { data: discountRules = [] } = useDiscountRules()
  const { data: allCustomers = [] } = useAllActiveCustomers()
  const { data: searchedProducts, isLoading: isSearchingProducts } = usePOSProductSearch(
    productSearch,
    branchId || ''
  )
  const { data: canvasesPage, isLoading: isLoadingCanvases } = useCanvases(listPage, 10)
  const createCanvas = useCreateCanvas()
  const deleteCanvas = useDeleteCanvas()
  const createCustomer = useCreateCustomer()

  // Selling units for selected product (for multi-unit dialog)
  const [sellingUnits, setSellingUnits] = useState<any[]>([])
  const [isLoadingUnits, setIsLoadingUnits] = useState(false)

  useEffect(() => {
    if (!selectedProduct) return
    setIsLoadingUnits(true)
    getProductSellingUnits(selectedProduct.id)
      .then(setSellingUnits)
      .catch(() => setSellingUnits([]))
      .finally(() => setIsLoadingUnits(false))
  }, [selectedProduct?.id])

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    setIsMounted(true)
    setCanvasDate(getTodayPH())
  }, [])

  useEffect(() => {
    const branchesList = (branches as any[]) || []
    if (branchesList.length > 0 && !branchId) {
      setBranchId(branchesList[0].id)
    }
  }, [branches, branchId, setBranchId])

  useEffect(() => {
    if (!customer) setCustomer(WALK_IN_CUSTOMER)
  }, [customer, setCustomer])

  // Sync fee string inputs when the store value changes externally (e.g., after save/reset)
  useEffect(() => {
    setDeliveryFeeStr(deliveryFee > 0 ? String(deliveryFee) : '')
  }, [deliveryFee])

  useEffect(() => {
    setOtherFeesStr(otherFees > 0 ? String(otherFees) : '')
  }, [otherFees])

  // ── Computed ──────────────────────────────────────────────────────────────
  const subtotal = getSubtotal()
  const totalDiscount = getTotalDiscount()
  const total = getTotal()

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return allCustomers
    const q = customerSearch.toLowerCase()
    return allCustomers.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q))
    )
  }, [allCustomers, customerSearch])

  const currentBranch = useMemo(() => {
    const list = (branches as any[]) || []
    return list.find((b: any) => b.id === branchId) || null
  }, [branches, branchId])

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getItemMarkup = useCallback(
    (item: { cogs_per_unit: number; unit_price: number; markup_percentage: number }) =>
      item.cogs_per_unit > 0
        ? (item.unit_price / item.cogs_per_unit - 1) * 100
        : (item.markup_percentage ?? 0),
    []
  )

  // ── Handlers: products ────────────────────────────────────────────────────
  const handleAddProduct = useCallback(
    async (product: any) => {
      try {
        const units = await getProductSellingUnits(product.id)
        const activeUnits = units.filter((u) => u.is_active)

        if (activeUnits.length <= 1) {
          const unit = activeUnits[0]
          if (!unit) {
            addItem({
              product_id: product.id,
              product_code: product.code,
              product_name: product.name,
              variant_id: null,
              variant_name: null,
              quantity: 1,
              uom_id: product.selling_uom_id || product.uom_id,
              uom_name:
                product.selling_uom_abbreviation || product.uom_abbreviation || product.uom_name,
              unit_price: product.unit_price,
              cogs_per_unit: product.cogs,
              markup_percentage: product.markup_percentage ?? 0,
              discount_amount: 0,
              available_stock: product.available_stock ?? 0,
            })
          } else {
            const stale =
              unit.uom_id === product.uom_id &&
              product.selling_uom_id &&
              product.selling_uom_id !== product.uom_id
            addItem({
              product_id: product.id,
              product_code: product.code,
              product_name: product.name,
              variant_id: null,
              variant_name: null,
              quantity: 1,
              uom_id: stale ? product.selling_uom_id : unit.uom_id,
              uom_name: stale
                ? product.selling_uom_abbreviation || product.selling_uom_name || ''
                : unit.uom?.code || unit.uom?.name || '',
              unit_price: stale ? product.unit_price : unit.selling_price,
              cogs_per_unit: stale ? product.cogs : product.cogs / unit.conversion_factor,
              markup_percentage: stale
                ? (product.markup_percentage ?? 0)
                : unit.markup_percentage,
              discount_amount: 0,
              available_stock: product.available_stock ?? 0,
            })
          }
          setProductSearch('')
          toast.success(`Added ${product.name}`)
        } else {
          setSelectedProduct(product)
          setIsUnitSelectorOpen(true)
        }
      } catch {
        addItem({
          product_id: product.id,
          product_code: product.code,
          product_name: product.name,
          variant_id: null,
          variant_name: null,
          quantity: 1,
          uom_id: product.selling_uom_id || product.uom_id,
          uom_name: product.selling_uom_abbreviation || product.uom_abbreviation || '',
          unit_price: product.unit_price,
          cogs_per_unit: product.cogs,
          markup_percentage: product.markup_percentage ?? 0,
          discount_amount: 0,
          available_stock: product.available_stock ?? 0,
        })
        setProductSearch('')
        toast.success(`Added ${product.name}`)
      }
    },
    [addItem]
  )

  const handleAddWithUnit = useCallback(() => {
    if (!selectedProduct || !selectedUnitId) return
    const su = sellingUnits.find((u) => u.uom_id === selectedUnitId)
    if (!su) { toast.error('Please select a unit'); return }
    addItem({
      product_id: selectedProduct.id,
      product_code: selectedProduct.code,
      product_name: selectedProduct.name,
      variant_id: null,
      variant_name: null,
      quantity: 1,
      uom_id: su.uom_id,
      uom_name: su.uom?.code || su.uom?.name || '',
      unit_price: su.selling_price,
      cogs_per_unit: selectedProduct.cogs / su.conversion_factor,
      markup_percentage: su.markup_percentage,
      discount_amount: 0,
      available_stock: selectedProduct.available_stock ?? 0,
    })
    setProductSearch('')
    setIsUnitSelectorOpen(false)
    setSelectedProduct(null)
    setSelectedUnitId('')
    toast.success(`Added ${selectedProduct.name}`)
  }, [selectedProduct, selectedUnitId, sellingUnits, addItem])

  // ── Handlers: discount ────────────────────────────────────────────────────
  const handleDiscountTypeChange = useCallback(
    (type: typeof discountType) => {
      setDiscountAmount(0)
      setDiscountPercentage(0)
      items.forEach((item) => updateItemDiscount(item.id, 0))
      setDiscountInput('')
      setDiscountType(type)

      if (type === 'standard') {
        items.forEach((item) => {
          const markup = getItemMarkup(item)
          const pct = getStandardDiscountForMarkup(discountRules, markup)
          updateItemDiscount(item.id, (item.quantity * item.unit_price * pct) / 100)
        })
      }
      if (type === 'cost') {
        items.forEach((item) => {
          updateItemDiscount(item.id, item.quantity * Math.max(0, item.unit_price - item.cogs_per_unit))
        })
      }
    },
    [discountRules, items, getItemMarkup, setDiscountAmount, setDiscountPercentage, setDiscountType, updateItemDiscount]
  )

  const handleApplyOrderDiscount = useCallback(
    (value: string) => {
      setDiscountInput(value)
      const num = parseFloat(value) || 0
      if (discountType === 'fixed') setDiscountAmount(num)
      if (discountType === 'percentage') setDiscountPercentage(Math.min(100, num))
    },
    [discountType, setDiscountAmount, setDiscountPercentage]
  )

  // ── Handlers: customer ────────────────────────────────────────────────────
  const handleSelectCustomer = useCallback(
    (cust: any) => {
      setCustomer({
        id: cust.id,
        name: cust.name,
        phone: cust.phone,
        customer_type: cust.customer_type,
        credit_limit: cust.credit_limit || 0,
        outstanding_balance: cust.outstanding_balance || 0,
      })
      setIsCustomerOpen(false)
      setCustomerSearch('')
    },
    [setCustomer]
  )

  const handleCreateCustomer = useCallback(async () => {
    if (!newCustomerName.trim()) { toast.error('Customer name is required'); return }
    try {
      const result = await createCustomer.mutateAsync({
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim() || null,
        customer_type: newCustomerType,
      })
      setCustomer({
        id: (result as any).id,
        name: (result as any).name,
        phone: (result as any).phone,
        customer_type: (result as any).customer_type,
        credit_limit: (result as any).credit_limit || 0,
        outstanding_balance: (result as any).outstanding_balance || 0,
      })
      toast.success(`Customer "${newCustomerName.trim()}" created`)
      setIsNewCustomerOpen(false)
      setIsCustomerOpen(false)
      setNewCustomerName('')
      setNewCustomerPhone('')
      setNewCustomerType('cash')
    } catch (err: any) {
      toast.error(err.message || 'Failed to create customer')
    }
  }, [newCustomerName, newCustomerPhone, newCustomerType, createCustomer, setCustomer])

  // ── Handlers: save canvas ─────────────────────────────────────────────────
  const handleSaveCanvas = async () => {
    if (!branchId) { toast.error('No branch selected'); return }
    if (items.length === 0) { toast.error('Canvas is empty'); return }
    if (!user?.id) { toast.error('Authentication error. Please login again.'); return }

    try {
      await createCanvas.mutateAsync({
        input: {
          branch_id:          branchId,
          customer_id:        customer?.id === WALK_IN_CUSTOMER.id ? null : (customer?.id ?? null),
          title:              title || null,
          notes:              notes || null,
          subtotal,
          discount_amount:    totalDiscount,
          discount_percentage: discountPercentage,
          delivery_fee:       deliveryFee,
          other_fees:         otherFees,
          other_fees_notes:   otherFeesNotes || null,
          total_amount:       total,
          canvas_date:        isMounted ? createTimestampPH(canvasDate) : new Date().toISOString(),
        },
        lines: items.map((item) => ({
          product_id:      item.product_id,
          quantity:        item.quantity,
          uom_id:          item.uom_id,
          unit_price:      item.unit_price,
          cogs_per_unit:   item.cogs_per_unit,
          discount_amount: item.discount_amount,
        })),
        userId: user.id,
      })

      toast.success('Canvas saved!')
      setIsSaveOpen(false)
      resetAll()
      setCanvasDate(getTodayPH())
      setCustomer(WALK_IN_CUSTOMER)
      setDiscountInput('')
      setDeliveryFeeStr('')
      setOtherFeesStr('')
    } catch (err: any) {
      toast.error(err.message || 'Failed to save canvas')
    }
  }

  // ── Handlers: convert to sale ─────────────────────────────────────────────
  const handleConvertToSale = useCallback(
    (canvas: any) => {
      posStore.resetAll()
      if (canvas.customer) {
        posStore.setCustomer({
          id: canvas.customer.id,
          name: canvas.customer.name,
          phone: canvas.customer.phone,
          customer_type: canvas.customer.customer_type || 'cash',
          credit_limit: canvas.customer.credit_limit || 0,
          outstanding_balance: canvas.customer.outstanding_balance || 0,
        })
      }
      if (branchId) posStore.setBranchId(branchId)

      canvas.lines?.forEach((line: any) => {
        posStore.addItem({
          product_id:        line.product_id,
          product_code:      line.product?.code || '',
          product_name:      line.product?.name || line.product_id,
          variant_id:        null,
          variant_name:      null,
          quantity:          line.quantity,
          uom_id:            line.uom_id,
          uom_name:          line.uom?.code || line.uom?.name || 'pc',
          unit_price:        line.unit_price,
          cogs_per_unit:     line.cogs_per_unit,
          markup_percentage: line.cogs_per_unit > 0
            ? ((line.unit_price / line.cogs_per_unit - 1) * 100)
            : 0,
          discount_amount:   line.discount_amount,
          available_stock:   9999,
        })
      })

      if (canvas.delivery_fee > 0) posStore.setDeliveryFee(canvas.delivery_fee)
      if (canvas.other_fees > 0) {
        posStore.setOtherFees(canvas.other_fees)
        if (canvas.other_fees_notes) posStore.setOtherFeesNotes(canvas.other_fees_notes)
      }
      if (canvas.notes) posStore.setNotes(canvas.notes)

      toast.success('Canvas loaded into POS — complete the sale!')
      router.push('/pos')
    },
    [posStore, branchId, router]
  )

  // ── renderCart — a render function, NOT a component ───────────────────────
  // Called as {renderCart()} so React reconciles its output as part of the
  // parent fiber tree. This prevents Select/Popover/Input from losing state
  // or focus on every re-render (which happened when it was `<CartContent />`).
  const renderCart = () => (
    <div className="flex flex-col h-full">
      {/* Customer */}
      <div className="p-3 border-b">
        <Popover open={isCustomerOpen} onOpenChange={setIsCustomerOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start gap-2 h-9">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="truncate text-sm">{customer?.name || 'Walk-in Customer'}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search customers..."
                value={customerSearch}
                onValueChange={setCustomerSearch}
              />
              <CommandList>
                <CommandEmpty>No customers found</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    onSelect={() => handleSelectCustomer(WALK_IN_CUSTOMER)}
                    className="cursor-pointer"
                  >
                    <User className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span>Walk-in Customer</span>
                  </CommandItem>
                  {filteredCustomers.slice(0, 30).map((c) => (
                    <CommandItem
                      key={c.id}
                      onSelect={() => handleSelectCustomer(c)}
                      className="cursor-pointer"
                    >
                      <User className="h-4 w-4 mr-2 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span className="text-sm">{c.name}</span>
                        {c.phone && (
                          <span className="text-xs text-muted-foreground">{c.phone}</span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandGroup>
                  <CommandItem
                    onSelect={() => { setIsCustomerOpen(false); setIsNewCustomerOpen(true) }}
                    className="cursor-pointer text-blue-600"
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add New Customer
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Items */}
      <ScrollArea className="flex-1 min-h-0">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <ClipboardList className="h-10 w-10 mb-2 opacity-30" />
            <p className="text-sm">Canvas is empty</p>
            <p className="text-xs mt-1">Search and add products</p>
          </div>
        ) : (
          <div className="divide-y">
            {items.map((item) => (
              <div key={item.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight truncate">{item.product_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(item.unit_price)} / {item.uom_name}
                    </p>
                    {item.discount_amount > 0 && (
                      <p className="text-xs text-green-600">
                        Disc: -{formatCurrency(item.discount_amount)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => updateItemQuantity(item.id, item.quantity - 1)}
                      disabled={item.quantity <= 0.01}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={(e) =>
                        updateItemQuantity(item.id, parseFloat(e.target.value) || 0.01)
                      }
                      className="w-16 h-6 text-center text-sm p-1"
                      min="0.01"
                      step="any"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => updateItemQuantity(item.id, item.quantity + 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={() => removeItem(item.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="flex justify-end mt-1">
                  <span className="text-sm font-medium">
                    {formatCurrency(item.quantity * item.unit_price - item.discount_amount)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Discount + Fees */}
      {items.length > 0 && (
        <div className="p-3 border-t space-y-2">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <Select value={discountType} onValueChange={handleDiscountTypeChange as any}>
              <SelectTrigger className="h-8 flex-1">
                <SelectValue placeholder="Discount" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Discount</SelectItem>
                <SelectItem value="fixed">Fixed Amount</SelectItem>
                <SelectItem value="percentage">Percentage</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="cost">At Cost</SelectItem>
              </SelectContent>
            </Select>
            {(discountType === 'fixed' || discountType === 'percentage') && (
              <Input
                type="number"
                step="0.01"
                className="h-8 w-24"
                placeholder={discountType === 'percentage' ? '%' : '₱'}
                value={discountInput}
                onChange={(e) => handleApplyOrderDiscount(e.target.value)}
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Delivery Fee</Label>
              <Input
                type="number"
                step="0.01"
                className="h-8"
                placeholder="0.00"
                value={deliveryFeeStr}
                onChange={(e) => {
                  setDeliveryFeeStr(e.target.value)
                  const num = parseFloat(e.target.value)
                  if (!isNaN(num) && e.target.value !== '') setDeliveryFee(Math.max(0, num))
                  else if (e.target.value === '') setDeliveryFee(0)
                }}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Other Fees</Label>
              <Input
                type="number"
                step="0.01"
                className="h-8"
                placeholder="0.00"
                value={otherFeesStr}
                onChange={(e) => {
                  setOtherFeesStr(e.target.value)
                  const num = parseFloat(e.target.value)
                  if (!isNaN(num) && e.target.value !== '') setOtherFees(Math.max(0, num))
                  else if (e.target.value === '') setOtherFees(0)
                }}
              />
            </div>
          </div>
          {otherFees > 0 && (
            <Input
              className="h-8 text-xs"
              placeholder="Other fees description..."
              value={otherFeesNotes}
              onChange={(e) => setOtherFeesNotes(e.target.value)}
            />
          )}
        </div>
      )}

      {/* Totals */}
      {items.length > 0 && (
        <div className="p-3 border-t space-y-1 bg-slate-50">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {totalDiscount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Discount</span>
              <span>-{formatCurrency(totalDiscount)}</span>
            </div>
          )}
          {deliveryFee > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Delivery Fee</span>
              <span>{formatCurrency(deliveryFee)}</span>
            </div>
          )}
          {otherFees > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Other Fees</span>
              <span>{formatCurrency(otherFees)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between font-bold text-base">
            <span>Total</span>
            <span className="text-blue-600">{formatCurrency(total)}</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="p-3 border-t flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => {
            clearCanvas()
            setDiscountType('none')
            setDiscountAmount(0)
            setDiscountPercentage(0)
            setDeliveryFee(0)
            setOtherFees(0)
            setOtherFeesNotes('')
            setDiscountInput('')
            setDeliveryFeeStr('')
            setOtherFeesStr('')
          }}
          disabled={items.length === 0}
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Clear
        </Button>
        <Button
          size="sm"
          className="flex-1 bg-blue-600 hover:bg-blue-700"
          onClick={() => setIsSaveOpen(true)}
          disabled={items.length === 0}
        >
          <Save className="h-4 w-4 mr-1" />
          Save Canvas
        </Button>
      </div>
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-5rem)] gap-4 overflow-hidden">
      {/* ── Left: product search ─────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-3 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search products by name or code..."
              className="pl-9"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
          </div>
          {/* Mobile cart toggle */}
          <Button
            variant="outline"
            className="lg:hidden relative"
            onClick={() => setIsCartOpen(true)}
          >
            <ShoppingCart className="h-5 w-5" />
            {items.length > 0 && (
              <Badge className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs bg-blue-600">
                {items.length}
              </Badge>
            )}
          </Button>
        </div>

        {/* Product grid */}
        <ScrollArea className="flex-1">
          {productSearch.length < 2 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Search className="h-12 w-12 mb-3 opacity-20" />
              <p className="text-sm">Type at least 2 characters to search</p>
            </div>
          ) : isSearchingProducts ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !searchedProducts || searchedProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <ProductIcon className="h-12 w-12 mb-3 opacity-20" />
              <p className="text-sm">No products found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 p-1">
              {(searchedProducts as any[]).map((product) => (
                <Card
                  key={product.id}
                  className="cursor-pointer hover:border-blue-500 hover:shadow-md transition-all"
                  onClick={() => handleAddProduct(product)}
                >
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground font-mono">{product.code}</p>
                    <p className="text-sm font-medium leading-tight mt-0.5 line-clamp-2">
                      {product.name}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm font-bold text-blue-600">
                        {formatCurrency(product.unit_price)}
                      </span>
                      {product.available_stock !== undefined && (
                        <Badge
                          variant={product.available_stock > 0 ? 'secondary' : 'destructive'}
                          className="text-xs"
                        >
                          {product.available_stock > 0
                            ? `${product.available_stock} ${product.selling_uom_abbreviation || ''}`
                            : 'Out of stock'}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* ── Saved canvases list ───────────────────────────────────────── */}
        <div className="border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Saved Canvases
            </h3>
            {canvasesPage && canvasesPage.total > 10 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setListPage((p) => Math.max(1, p - 1))}
                  disabled={listPage === 1}
                >
                  Prev
                </Button>
                <span>
                  {listPage} / {Math.ceil(canvasesPage.total / 10)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setListPage((p) => p + 1)}
                  disabled={listPage >= Math.ceil(canvasesPage.total / 10)}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="w-36">Canvas #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-center">Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-48">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingCanvases ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : !canvasesPage?.data.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-sm">
                      No saved canvases yet
                    </TableCell>
                  </TableRow>
                ) : (
                  canvasesPage.data.map((canvas) => (
                    <TableRow key={canvas.id} className="text-sm">
                      <TableCell className="font-mono text-xs">{canvas.canvas_number}</TableCell>
                      <TableCell className="text-xs">{formatDate(canvas.canvas_date)}</TableCell>
                      <TableCell className="text-xs">
                        {canvas.title
                          ? <span className="text-blue-700 font-medium">{canvas.title}</span>
                          : canvas.customer?.name || 'Walk-in'}
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        {canvas.lines?.length ?? 0}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(canvas.total_amount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs px-2 text-blue-600 border-blue-200 hover:bg-blue-50"
                            onClick={() => handleConvertToSale(canvas)}
                          >
                            <ChevronRight className="h-3 w-3 mr-1" />
                            Convert to Sale
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:bg-red-50"
                            onClick={async () => {
                              if (!confirm('Delete this canvas?')) return
                              try {
                                await deleteCanvas.mutateAsync(canvas.id)
                                toast.success('Canvas deleted')
                              } catch {
                                toast.error('Failed to delete')
                              }
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* ── Right: cart panel (desktop) ──────────────────────────────────── */}
      <Card className="hidden lg:flex w-80 xl:w-96 flex-col overflow-hidden">
        <CardHeader className="py-3 px-4 border-b">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Canvas Cart
            {items.length > 0 && (
              <Badge variant="secondary" className="ml-auto">
                {getItemCount()} items
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 flex-1 overflow-hidden flex flex-col">
          {renderCart()}
        </CardContent>
      </Card>

      {/* ── Mobile cart sheet ────────────────────────────────────────────── */}
      <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
        <SheetContent side="right" className="w-80 p-0 flex flex-col">
          <div className="flex items-center justify-between p-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Canvas Cart
            </SheetTitle>
          </div>
          <div className="flex-1 overflow-hidden flex flex-col">
            {renderCart()}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Unit selector dialog ─────────────────────────────────────────── */}
      <Dialog open={isUnitSelectorOpen} onOpenChange={setIsUnitSelectorOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Select Unit</DialogTitle>
            <DialogDescription>
              {selectedProduct?.name} — choose how you want to sell it
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {isLoadingUnits ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : (
              sellingUnits
                .filter((u) => u.is_active)
                .map((unit) => (
                  <div
                    key={unit.uom_id}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedUnitId === unit.uom_id
                        ? 'border-blue-500 bg-blue-50'
                        : 'hover:bg-slate-50'
                    }`}
                    onClick={() => setSelectedUnitId(unit.uom_id)}
                  >
                    <div>
                      <p className="text-sm font-medium">{unit.uom?.name || unit.uom_id}</p>
                      <p className="text-xs text-muted-foreground">
                        {unit.conversion_factor > 1
                          ? `1 ${unit.uom?.code || ''} = ${unit.conversion_factor} ${selectedProduct?.selling_uom_abbreviation || ''}`
                          : unit.uom?.code}
                      </p>
                    </div>
                    <span className="font-bold text-blue-600">
                      {formatCurrency(unit.selling_price)}
                    </span>
                  </div>
                ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsUnitSelectorOpen(false); setSelectedProduct(null) }}>
              Cancel
            </Button>
            <Button onClick={handleAddWithUnit} disabled={!selectedUnitId}>
              Add to Canvas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Save canvas dialog ───────────────────────────────────────────── */}
      <Dialog open={isSaveOpen} onOpenChange={setIsSaveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save Canvas</DialogTitle>
            <DialogDescription>
              Add an optional title and date, then save the price quotation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="canvas-title">Title (optional)</Label>
              <Input
                id="canvas-title"
                placeholder="e.g. Juan – roofing materials"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="canvas-date">Canvas Date</Label>
              <Input
                id="canvas-date"
                type="date"
                value={canvasDate}
                max={isMounted ? getTodayPH() : ''}
                onChange={(e) => setCanvasDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="canvas-notes">Notes (optional)</Label>
              <Textarea
                id="canvas-notes"
                placeholder="Any notes for this quotation..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            {/* Summary */}
            <div className="rounded-lg bg-slate-50 p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer</span>
                <span>{customer?.id === WALK_IN_CUSTOMER.id ? 'Walk-in' : customer?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Items</span>
                <span>{items.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {totalDiscount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount</span>
                  <span>-{formatCurrency(totalDiscount)}</span>
                </div>
              )}
              {deliveryFee > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delivery Fee</span>
                  <span>{formatCurrency(deliveryFee)}</span>
                </div>
              )}
              {otherFees > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Other Fees</span>
                  <span>{formatCurrency(otherFees)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between font-bold text-base">
                <span>Total</span>
                <span className="text-blue-600">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSaveOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveCanvas}
              disabled={createCanvas.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {createCanvas.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
              ) : (
                <><Save className="h-4 w-4 mr-2" />Save Canvas</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── New customer dialog ──────────────────────────────────────────── */}
      <Dialog open={isNewCustomerOpen} onOpenChange={setIsNewCustomerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                placeholder="Customer name"
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={newCustomerPhone}
                onChange={(e) => setNewCustomerPhone(e.target.value)}
                placeholder="09xx-xxx-xxxx"
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={newCustomerType} onValueChange={(v) => setNewCustomerType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewCustomerOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateCustomer} disabled={createCustomer.isPending}>
              {createCustomer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ProductIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m7.5 4.27 9 5.15M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
      <path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>
    </svg>
  )
}
