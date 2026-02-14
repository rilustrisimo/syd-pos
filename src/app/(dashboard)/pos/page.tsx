'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { usePOSStore } from '@/lib/stores/posStore'
import { useAuthStore } from '@/lib/stores/auth'
import { usePOSProductSearch, useCreateTransaction, useTodaysSummary } from '@/hooks/useTransactions'
import { useSearchCustomers, useWalkInCustomer, useCreateCustomer } from '@/hooks/useCustomers'
import { useBranches } from '@/hooks/useInventory'
import { toast } from 'sonner'
import {
  Search,
  ShoppingCart,
  User,
  Truck,
  Package,
  Trash2,
  Plus,
  Minus,
  CreditCard,
  Banknote,
  Smartphone,
  Building2,
  X,
  Check,
  Loader2,
  Receipt,
  Printer,
  UserPlus,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PrintDialog } from '@/components/print/print-dialog'
import type { ReceiptData } from '@/components/print/receipt-template'
import type { InvoiceData } from '@/components/print/invoice-template'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(amount)
}

const paymentMethods = [
  { value: 'cash', label: 'Cash', icon: Banknote },
  { value: 'gcash', label: 'GCash', icon: Smartphone },
  { value: 'maya', label: 'Maya', icon: Smartphone },
  { value: 'bank_transfer', label: 'Bank Transfer', icon: Building2 },
  { value: 'credit', label: 'Credit/AR', icon: CreditCard },
] as const

export default function POSPage() {
  const [productSearch, setProductSearch] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [isCustomerOpen, setIsCustomerOpen] = useState(false)
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('cash')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false)
  const [completedTransaction, setCompletedTransaction] = useState<any>(null)
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isNewCustomerOpen, setIsNewCustomerOpen] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [newCustomerType, setNewCustomerType] = useState<'cash' | 'credit'>('cash')

  // Store
  const {
    items,
    customer,
    branchId,
    deliveryType,
    deliveryAddress,
    deliveryPhone,
    discountAmount,
    discountPercentage,
    notes,
    payments,
    addItem,
    updateItemQuantity,
    removeItem,
    setCustomer,
    setBranchId,
    setDeliveryType,
    setDeliveryAddress,
    setDeliveryPhone,
    setDiscountAmount,
    setDiscountPercentage,
    setNotes,
    addPayment,
    removePayment,
    clearPayments,
    resetAll,
    getSubtotal,
    getTotalDiscount,
    getTotal,
    getTotalPaid,
    getBalance,
    getItemCount,
    getCreditPaymentTotal,
    getAvailableCredit,
    wouldExceedCreditLimit,
  } = usePOSStore()

  // Queries
  const { data: branches } = useBranches()
  const { data: walkInCustomer } = useWalkInCustomer()
  const { data: searchedProducts, isLoading: isSearchingProducts } = usePOSProductSearch(
    productSearch,
    branchId || ''
  )
  const { data: searchedCustomers } = useSearchCustomers(customerSearch, 10)
  const { data: todaysSummary } = useTodaysSummary(branchId || undefined)

  const createTransaction = useCreateTransaction()
  const createCustomer = useCreateCustomer()

  // Get authenticated user
  const { user } = useAuthStore()

  // Set default branch and walk-in customer
  useEffect(() => {
    const branchesList = branches as any[] || []
    if (branchesList.length > 0 && !branchId) {
      setBranchId(branchesList[0].id)
    }
  }, [branches, branchId, setBranchId])

  useEffect(() => {
    if (walkInCustomer && !customer) {
      setCustomer({
        id: walkInCustomer.id,
        name: walkInCustomer.name,
        phone: walkInCustomer.phone,
        customer_type: walkInCustomer.customer_type,
        credit_limit: walkInCustomer.credit_limit,
        outstanding_balance: walkInCustomer.outstanding_balance,
      })
    }
  }, [walkInCustomer, customer, setCustomer])

  // Handle product selection
  const handleAddProduct = useCallback((product: any) => {
    addItem({
      product_id: product.id,
      product_code: product.code,
      product_name: product.name,
      variant_id: null,
      variant_name: null,
      quantity: 1,
      uom_id: product.uom_id,
      uom_name: product.uom_abbreviation || product.uom_name,
      unit_price: product.unit_price,
      cogs_per_unit: product.cogs,
      discount_amount: 0,
      available_stock: product.available_stock,
    })
    setProductSearch('')
    toast.success(`Added ${product.name} to cart`)
  }, [addItem])

  // Handle customer selection
  const handleSelectCustomer = useCallback((cust: any) => {
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
  }, [setCustomer])

  // Handle new customer creation
  const handleCreateCustomer = useCallback(async () => {
    if (!newCustomerName.trim()) {
      toast.error('Customer name is required')
      return
    }

    try {
      const result = await createCustomer.mutateAsync({
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim() || null,
        customer_type: newCustomerType,
      })

      // Auto-select the newly created customer
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
    } catch (error: any) {
      toast.error(error.message || 'Failed to create customer')
    }
  }, [newCustomerName, newCustomerPhone, newCustomerType, createCustomer, setCustomer])

  // Handle add payment
  const handleAddPayment = useCallback(() => {
    const amount = parseFloat(paymentAmount)
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    // Credit limit enforcement
    if (selectedPaymentMethod === 'credit' && customer) {
      if (wouldExceedCreditLimit(amount)) {
        const availableCredit = getAvailableCredit() - getCreditPaymentTotal()
        toast.error(`Credit limit exceeded. Available credit: ${formatCurrency(Math.max(0, availableCredit))}`)
        return
      }
    }

    addPayment({
      payment_method: selectedPaymentMethod as any,
      amount,
      reference_number: paymentReference || null,
    })

    setPaymentAmount('')
    setPaymentReference('')
  }, [paymentAmount, selectedPaymentMethod, paymentReference, customer, addPayment, wouldExceedCreditLimit, getAvailableCredit, getCreditPaymentTotal])

  // Get current branch for printing
  const currentBranch = useMemo(() => {
    const branchesList = branches as any[] || []
    return branchesList.find((b: any) => b.id === branchId) || null
  }, [branches, branchId])

  // Handle checkout
  const handleCheckout = async () => {
    if (!branchId) {
      toast.error('Please select a branch')
      return
    }

    // Use walk-in customer as fallback if none selected
    const checkoutCustomer = customer || (walkInCustomer ? {
      id: walkInCustomer.id,
      name: walkInCustomer.name,
      phone: walkInCustomer.phone,
      customer_type: walkInCustomer.customer_type,
      credit_limit: walkInCustomer.credit_limit,
      outstanding_balance: walkInCustomer.outstanding_balance,
    } : null)

    if (!checkoutCustomer) {
      toast.error('No customer available')
      return
    }

    if (items.length === 0) {
      toast.error('Cart is empty')
      return
    }

    const balance = getBalance()
    if (balance > 0.01) {
      toast.error(`Payment incomplete. Remaining: ${formatCurrency(balance)}`)
      return
    }

    if (deliveryType === 'delivery' && !deliveryAddress) {
      toast.error('Please enter delivery address')
      return
    }

    // Final credit limit check
    if (wouldExceedCreditLimit()) {
      const availableCredit = getAvailableCredit()
      const creditUsed = getCreditPaymentTotal()
      toast.error(`Credit limit exceeded! Available: ${formatCurrency(availableCredit)}, Used: ${formatCurrency(creditUsed)}`)
      return
    }

    // Validate user is authenticated
    if (!user || !user.id) {
      toast.error('Authentication error. Please login again.')
      return
    }

    try {
      // Store current items and payments before reset
      const currentItems = [...items]
      const currentPayments = [...payments]
      const currentCustomer = checkoutCustomer
      const currentSubtotal = subtotal
      const currentTotalDiscount = totalDiscount
      const currentTotal = total
      const currentTotalPaid = totalPaid

      const result = await createTransaction.mutateAsync({
        input: {
          branch_id: branchId,
          customer_id: checkoutCustomer.id,
          transaction_type: 'sale',
          delivery_type: deliveryType,
          delivery_address: deliveryAddress || null,
          delivery_phone: deliveryPhone || null,
          discount_amount: getTotalDiscount(),
          notes: notes || null,
        },
        lines: items.map((item) => ({
          product_id: item.product_id,
          variant_id: item.variant_id,
          quantity: item.quantity,
          uom_id: item.uom_id,
          unit_price: item.unit_price,
          cogs_per_unit: item.cogs_per_unit,
          discount_amount: item.discount_amount,
        })),
        payments: payments.map((p) => ({
          payment_method: p.payment_method,
          amount: p.amount,
          reference_number: p.reference_number,
        })),
        userId: user.id,
      })

      // Store completed transaction for printing
      setCompletedTransaction({
        ...result,
        _localData: {
          items: currentItems,
          payments: currentPayments,
          customer: currentCustomer,
          subtotal: currentSubtotal,
          discount: currentTotalDiscount,
          total: currentTotal,
          totalPaid: currentTotalPaid,
          change: Math.max(0, currentTotalPaid - currentTotal),
          branch: currentBranch,
          deliveryType,
          deliveryAddress,
          deliveryPhone,
          notes,
        }
      })

      toast.success('Transaction completed successfully!')
      setIsCheckoutOpen(false)

      // Show print dialog
      setIsPrintDialogOpen(true)
    } catch (error: any) {
      toast.error(error.message || 'Failed to complete transaction')
    }
  }

  // Handle print dialog complete
  const handlePrintComplete = () => {
    setCompletedTransaction(null)
    resetAll()

    // Re-set default customer
    if (walkInCustomer) {
      setCustomer({
        id: walkInCustomer.id,
        name: walkInCustomer.name,
        phone: walkInCustomer.phone,
        customer_type: walkInCustomer.customer_type,
        credit_limit: walkInCustomer.credit_limit,
        outstanding_balance: walkInCustomer.outstanding_balance,
      })
    }
  }

  // Prepare receipt data for printing
  const receiptData: ReceiptData | null = useMemo(() => {
    if (!completedTransaction) return null
    const local = completedTransaction._localData
    const txnDate = new Date(completedTransaction.transaction_date || new Date())

    return {
      transaction_number: completedTransaction.transaction_number,
      date: txnDate.toLocaleDateString('en-PH'),
      time: txnDate.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
      cashier: 'Staff', // TODO: Get from auth
      branch: local.branch?.name || 'Main Branch',
      customer: {
        name: local.customer?.name || 'Walk-in Customer',
        phone: local.customer?.phone || null,
      },
      delivery_type: local.deliveryType,
      delivery_address: local.deliveryAddress,
      items: local.items.map((item: any) => ({
        name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        uom: item.uom_name,
        discount: item.discount_amount,
        total: item.quantity * item.unit_price - item.discount_amount,
      })),
      subtotal: local.subtotal,
      discount: local.discount,
      tax: 0,
      total: local.total,
      payments: local.payments.map((p: any) => ({
        method: p.payment_method,
        amount: p.amount,
        reference: p.reference_number,
      })),
      amount_paid: local.totalPaid,
      change: local.change,
      notes: local.notes,
    }
  }, [completedTransaction])

  // Prepare invoice data for printing
  const invoiceData: InvoiceData | null = useMemo(() => {
    if (!completedTransaction) return null
    const local = completedTransaction._localData

    return {
      invoice_number: completedTransaction.transaction_number.replace('TXN', 'INV'),
      transaction_number: completedTransaction.transaction_number,
      date: completedTransaction.transaction_date || new Date().toISOString(),
      due_date: null,
      branch: {
        name: local.branch?.name || 'Main Branch',
        address: local.branch?.address || '',
        phone: local.branch?.phone || '',
        email: local.branch?.email || null,
      },
      customer: {
        name: local.customer?.name || 'Walk-in Customer',
        address: local.customer?.address || null,
        phone: local.customer?.phone || null,
        email: local.customer?.email || null,
      },
      delivery_type: local.deliveryType,
      delivery_address: local.deliveryAddress,
      delivery_phone: local.deliveryPhone,
      items: local.items.map((item: any) => ({
        code: item.product_code,
        name: item.product_name,
        quantity: item.quantity,
        uom: item.uom_name,
        unit_price: item.unit_price,
        discount: item.discount_amount,
        total: item.quantity * item.unit_price - item.discount_amount,
      })),
      subtotal: local.subtotal,
      discount: local.discount,
      tax: 0,
      total: local.total,
      amount_paid: local.totalPaid,
      balance_due: Math.max(0, local.total - local.totalPaid),
      payments: local.payments.map((p: any) => ({
        method: p.payment_method,
        amount: p.amount,
        reference: p.reference_number,
        date: new Date().toISOString(),
      })),
      notes: local.notes,
      prepared_by: 'Staff', // TODO: Get from auth
    }
  }, [completedTransaction])

  const subtotal = getSubtotal()
  const totalDiscount = getTotalDiscount()
  const total = getTotal()
  const totalPaid = getTotalPaid()
  const balance = getBalance()
  const itemCount = getItemCount()

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col lg:flex-row gap-4">
      {/* Left Panel - Product Search & List */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Today's Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4">
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Today's Sales</div>
            <div className="text-xl sm:text-2xl font-bold">
              {formatCurrency(todaysSummary?.netSales || 0)}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Transactions</div>
            <div className="text-xl sm:text-2xl font-bold">
              {todaysSummary?.totalTransactions || 0}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Unpaid</div>
            <div className="text-xl sm:text-2xl font-bold text-orange-600">
              {todaysSummary?.unpaidTransactions || 0}
            </div>
          </Card>
        </div>

        {/* Branch & Customer Selection */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-4">
          <Select value={branchId || ''} onValueChange={setBranchId}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Select Branch" />
            </SelectTrigger>
            <SelectContent>
              {(branches as any[] || []).map((branch: any) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover open={isCustomerOpen} onOpenChange={setIsCustomerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="flex-1 justify-start">
                <User className="mr-2 h-4 w-4" />
                {customer?.name || 'Select Customer'}
                {customer?.customer_type === 'credit' && (
                  <Badge variant="secondary" className="ml-2">
                    Credit
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(400px,calc(100vw-2rem))] p-0" align="start">
              <Command>
                <CommandInput
                  placeholder="Search customers by name or phone..."
                  value={customerSearch}
                  onValueChange={setCustomerSearch}
                />
                <CommandList>
                  <CommandEmpty>
                    No customers found. Try a different search or add a new customer.
                  </CommandEmpty>
                  <CommandGroup heading={customerSearch ? 'Search Results' : 'All Customers'}>
                    {walkInCustomer && (
                      <CommandItem
                        onSelect={() => handleSelectCustomer(walkInCustomer)}
                        className="cursor-pointer"
                      >
                        <User className="mr-2 h-4 w-4" />
                        <span>{walkInCustomer.name}</span>
                        <Badge variant="outline" className="ml-auto">
                          Default
                        </Badge>
                      </CommandItem>
                    )}
                    {searchedCustomers?.map((cust) => (
                      <CommandItem
                        key={cust.id}
                        onSelect={() => handleSelectCustomer(cust)}
                        className="cursor-pointer"
                      >
                        <User className="mr-2 h-4 w-4" />
                        <div className="flex-1">
                          <div>{cust.name}</div>
                          {cust.phone && (
                            <div className="text-xs text-muted-foreground">
                              {cust.phone}
                            </div>
                          )}
                        </div>
                        <Badge
                          variant={
                            cust.customer_type === 'credit' ? 'secondary' : 'outline'
                          }
                        >
                          {cust.customer_type}
                        </Badge>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  <Separator />
                  <CommandGroup>
                    <CommandItem
                      onSelect={() => setIsNewCustomerOpen(true)}
                      className="cursor-pointer"
                    >
                      <UserPlus className="mr-2 h-4 w-4" />
                      <span>Add New Customer</span>
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Product Search */}
        <Card className="flex-1 flex flex-col">
          <CardHeader className="pb-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search products by code or name..."
                className="pl-8"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                autoFocus
              />
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              {isSearchingProducts ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : productSearch.length >= 2 ? (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {searchedProducts?.map((product: any) => (
                    <Card
                      key={product.id}
                      className="cursor-pointer hover:bg-accent transition-colors"
                      onClick={() => handleAddProduct(product)}
                    >
                      <CardContent className="p-3">
                        <div className="font-mono text-xs text-muted-foreground">
                          {product.code}
                        </div>
                        <div className="font-medium text-sm line-clamp-2">
                          {product.name}
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="font-bold text-primary">
                            {formatCurrency(product.unit_price)}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {product.available_stock} {product.uom_abbreviation}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {searchedProducts?.length === 0 && (
                    <div className="col-span-full text-center py-8 text-muted-foreground">
                      No products found matching "{productSearch}"
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Package className="h-16 w-16 mb-4" />
                  <p>Start typing to search products</p>
                  <p className="text-sm">Search by product code or name</p>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Floating Cart Button - Mobile Only */}
      <div className="fixed bottom-20 right-4 z-30 lg:hidden">
        <Button
          size="lg"
          className="h-14 w-14 rounded-full shadow-lg relative"
          onClick={() => setIsCartOpen(true)}
        >
          <ShoppingCart className="h-6 w-6" />
          {itemCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0 flex items-center justify-center text-xs"
            >
              {itemCount}
            </Badge>
          )}
        </Button>
      </div>

      {/* Mobile Cart Sheet */}
      <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
        <SheetContent side="right" className="w-full sm:w-[400px] flex flex-col p-4">
          <SheetTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Cart
            {itemCount > 0 && (
              <Badge variant="secondary" className="ml-auto">
                {itemCount} items
              </Badge>
            )}
          </SheetTitle>

          <ScrollArea className="flex-1 -mx-4 px-4">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <ShoppingCart className="h-12 w-12 mb-2" />
                <p>Cart is empty</p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 p-3 rounded-lg border"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-xs text-muted-foreground">
                        {item.product_code}
                      </div>
                      <div className="font-medium text-sm truncate">
                        {item.product_name}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatCurrency(item.unit_price)} / {item.uom_name}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() =>
                            updateItemQuantity(item.id, item.quantity - 1)
                          }
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) =>
                            updateItemQuantity(item.id, parseFloat(e.target.value) || 1)
                          }
                          className="w-16 h-7 text-center"
                          min="0.01"
                          step="1"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() =>
                            updateItemQuantity(item.id, item.quantity + 1)
                          }
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">
                          {formatCurrency(item.quantity * item.unit_price - item.discount_amount)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => removeItem(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <Separator />

          <div className="space-y-2 py-2">
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {totalDiscount > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Discount</span>
                <span>-{formatCurrency(totalDiscount)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>

          <div className="flex gap-2 mb-3">
            <Button
              variant={deliveryType === 'pickup' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setDeliveryType('pickup')}
            >
              <Package className="mr-2 h-4 w-4" />
              Pickup
            </Button>
            <Button
              variant={deliveryType === 'delivery' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setDeliveryType('delivery')}
            >
              <Truck className="mr-2 h-4 w-4" />
              Delivery
            </Button>
          </div>

          <Button
            className="w-full"
            size="lg"
            disabled={items.length === 0}
            onClick={() => {
              setIsCartOpen(false)
              setIsCheckoutOpen(true)
            }}
          >
            <Receipt className="mr-2 h-5 w-5" />
            Checkout
          </Button>
        </SheetContent>
      </Sheet>

      {/* Right Panel - Cart (Desktop Only) */}
      <Card className="hidden lg:flex w-[400px] flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Cart
            {itemCount > 0 && (
              <Badge variant="secondary" className="ml-auto">
                {itemCount} items
              </Badge>
            )}
          </CardTitle>
        </CardHeader>

        <CardContent className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <ShoppingCart className="h-12 w-12 mb-2" />
                <p>Cart is empty</p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 p-3 rounded-lg border"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-xs text-muted-foreground">
                        {item.product_code}
                      </div>
                      <div className="font-medium text-sm truncate">
                        {item.product_name}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatCurrency(item.unit_price)} / {item.uom_name}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() =>
                            updateItemQuantity(item.id, item.quantity - 1)
                          }
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) =>
                            updateItemQuantity(item.id, parseFloat(e.target.value) || 1)
                          }
                          className="w-16 h-7 text-center"
                          min="0.01"
                          step="1"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() =>
                            updateItemQuantity(item.id, item.quantity + 1)
                          }
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">
                          {formatCurrency(item.quantity * item.unit_price - item.discount_amount)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => removeItem(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>

        <Separator />

        {/* Cart Summary */}
        <div className="p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {totalDiscount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Discount</span>
              <span>-{formatCurrency(totalDiscount)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between text-lg font-bold">
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>
        </div>

        {/* Delivery Options */}
        <div className="px-4 pb-4">
          <div className="flex gap-2 mb-3">
            <Button
              variant={deliveryType === 'pickup' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setDeliveryType('pickup')}
            >
              <Package className="mr-2 h-4 w-4" />
              Pickup
            </Button>
            <Button
              variant={deliveryType === 'delivery' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setDeliveryType('delivery')}
            >
              <Truck className="mr-2 h-4 w-4" />
              Delivery
            </Button>
          </div>
        </div>

        <CardFooter className="pt-0">
          <Button
            className="w-full"
            size="lg"
            disabled={items.length === 0}
            onClick={() => setIsCheckoutOpen(true)}
          >
            <Receipt className="mr-2 h-5 w-5" />
            Checkout
          </Button>
        </CardFooter>
      </Card>

      {/* Checkout Dialog */}
      <Dialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Checkout</DialogTitle>
            <DialogDescription>
              Complete the transaction for {customer?.name || 'Walk-in Customer'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Order Summary */}
            <div className="space-y-4">
              <h3 className="font-semibold">Order Summary</h3>
              <div className="border rounded-lg p-3 space-y-2 max-h-[200px] overflow-y-auto">
                {items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span>
                      {item.product_name} x {item.quantity}
                    </span>
                    <span>{formatCurrency(item.quantity * item.unit_price)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {totalDiscount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span>-{formatCurrency(totalDiscount)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>

              {/* Delivery Details */}
              {deliveryType === 'delivery' && (
                <div className="space-y-3">
                  <h3 className="font-semibold">Delivery Details</h3>
                  <div className="space-y-2">
                    <Input
                      placeholder="Delivery Address"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                    />
                    <Input
                      placeholder="Contact Phone"
                      value={deliveryPhone}
                      onChange={(e) => setDeliveryPhone(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  placeholder="Order notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </div>

            {/* Right: Payments */}
            <div className="space-y-4">
              <h3 className="font-semibold">Payment</h3>

              {/* Payment Method Selection */}
              <div className="grid grid-cols-2 gap-2">
                {paymentMethods.map((method) => (
                  <Button
                    key={method.value}
                    variant={selectedPaymentMethod === method.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedPaymentMethod(method.value)}
                  >
                    <method.icon className="mr-2 h-4 w-4" />
                    {method.label}
                  </Button>
                ))}
              </div>

              {/* Payment Amount */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Amount"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    min="0"
                    step="0.01"
                  />
                  <Button onClick={handleAddPayment}>Add</Button>
                </div>
                {(selectedPaymentMethod === 'gcash' ||
                  selectedPaymentMethod === 'maya' ||
                  selectedPaymentMethod === 'bank_transfer') && (
                  <Input
                    placeholder="Reference Number"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                  />
                )}
                {/* Credit Limit Info */}
                {selectedPaymentMethod === 'credit' && customer && (
                  <div className={`text-sm p-2 rounded-lg ${
                    wouldExceedCreditLimit() ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
                  }`}>
                    <div className="flex justify-between">
                      <span>Credit Limit:</span>
                      <span className="font-medium">{formatCurrency(customer.credit_limit)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Outstanding:</span>
                      <span className="font-medium">{formatCurrency(customer.outstanding_balance)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>This Order:</span>
                      <span className="font-medium">{formatCurrency(getCreditPaymentTotal())}</span>
                    </div>
                    <div className="flex justify-between border-t pt-1 mt-1">
                      <span>Available:</span>
                      <span className={`font-bold ${wouldExceedCreditLimit() ? 'text-red-700' : 'text-green-600'}`}>
                        {formatCurrency(Math.max(0, getAvailableCredit() - getCreditPaymentTotal()))}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Amount Buttons */}
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPaymentAmount(balance.toFixed(2))}
                >
                  Exact
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPaymentAmount((Math.ceil(total / 100) * 100).toString())}
                >
                  Round Up
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPaymentAmount((Math.ceil(total / 500) * 500).toString())}
                >
                  +500
                </Button>
              </div>

              {/* Payments List */}
              {payments.length > 0 && (
                <div className="border rounded-lg p-3 space-y-2">
                  <h4 className="text-sm font-medium">Payments Added</h4>
                  {payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{payment.payment_method}</Badge>
                        {payment.reference_number && (
                          <span className="text-xs text-muted-foreground">
                            #{payment.reference_number}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span>{formatCurrency(payment.amount)}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => removePayment(payment.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Payment Summary */}
              <div className="border rounded-lg p-3 space-y-2">
                <div className="flex justify-between">
                  <span>Total</span>
                  <span className="font-semibold">{formatCurrency(total)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Paid</span>
                  <span className="text-green-600">{formatCurrency(totalPaid)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold">
                  <span>{balance >= 0 ? 'Balance Due' : 'Change'}</span>
                  <span className={balance > 0 ? 'text-orange-600' : 'text-green-600'}>
                    {formatCurrency(Math.abs(balance))}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCheckoutOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCheckout}
              disabled={createTransaction.isPending || balance > 0.01}
            >
              {createTransaction.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Complete Transaction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Customer Dialog */}
      <Dialog open={isNewCustomerOpen} onOpenChange={setIsNewCustomerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
            <DialogDescription>
              Create a new customer to use in this transaction.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="customer-name">
                Customer Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="customer-name"
                placeholder="e.g., Juan Dela Cruz"
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-phone">Phone Number</Label>
              <Input
                id="customer-phone"
                placeholder="e.g., 09171234567"
                value={newCustomerPhone}
                onChange={(e) => setNewCustomerPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Customer Type</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={newCustomerType === 'cash' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  onClick={() => setNewCustomerType('cash')}
                >
                  <Banknote className="mr-2 h-4 w-4" />
                  Cash
                </Button>
                <Button
                  type="button"
                  variant={newCustomerType === 'credit' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  onClick={() => setNewCustomerType('credit')}
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  Credit
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewCustomerOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateCustomer}
              disabled={createCustomer.isPending || !newCustomerName.trim()}
            >
              {createCustomer.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="mr-2 h-4 w-4" />
              )}
              Create Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Dialog */}
      <PrintDialog
        open={isPrintDialogOpen}
        onOpenChange={setIsPrintDialogOpen}
        receiptData={receiptData}
        invoiceData={invoiceData}
        onComplete={handlePrintComplete}
      />
    </div>
  )
}
