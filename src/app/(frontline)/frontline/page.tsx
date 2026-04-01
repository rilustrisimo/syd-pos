'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { usePOSStore } from '@/lib/stores/posStore'
import { useAuthStore } from '@/lib/stores/auth'
import { usePOSProductSearch, useCreateTransaction, useTransactions, useUpdateTransactionDeliveryType } from '@/hooks/useTransactions'
import { getTransaction } from '@/lib/supabase/queries/transactions'
import { useSearchCustomers, useAllActiveCustomers, useCreateCustomer } from '@/hooks/useCustomers'
import { useBranches } from '@/hooks/useInventory'
import { useDiscountRules } from '@/hooks/useDiscountRules'
import { useProductSellingUnits } from '@/hooks/useProductSellingUnits'
import { getProductSellingUnits } from '@/lib/supabase/queries/product-selling-units'
import { getStandardDiscountForMarkup } from '@/lib/supabase/queries/discount-rules'
import { getTodayPH, createTimestampPH, isTodayPH } from '@/lib/utils/datetime'
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
  UserPlus,
  Percent,
  Tag,
  History,
  Printer,
  Edit,
  PackageCheck,
} from 'lucide-react'
import type { ReceiptData } from '@/components/print/receipt-template'
import { buildReceiptBytes } from '@/lib/utils/usb-thermal-print'
import { usePrinterStore } from '@/lib/stores/printer'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PrintDialog } from '@/components/print/print-dialog'
import type { InvoiceData } from '@/components/print/invoice-template'
import {
  Card,
  CardContent,
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

export default function FrontlinePOSPage() {
  const [productSearch, setProductSearch] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [isCustomerOpen, setIsCustomerOpen] = useState(false)
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('cash')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isNewCustomerOpen, setIsNewCustomerOpen] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [newCustomerType, setNewCustomerType] = useState<'cash' | 'credit'>('cash')
  const [saleDate, setSaleDate] = useState('')
  const [discountInput, setDiscountInput] = useState('')
  const [isMounted, setIsMounted] = useState(false)
  const [isUnitSelectorOpen, setIsUnitSelectorOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<any>(null)
  const [selectedUnitId, setSelectedUnitId] = useState<string>('')

  // Store
  const {
    items,
    customer,
    branchId,
    deliveryType,
    deliveryAddress,
    deliveryPhone,
    deliveryFee,
    otherFees,
    otherFeesNotes,
    discountAmount,
    discountPercentage,
    notes,
    payments,
    addItem,
    updateItemQuantity,
    updateItemDiscount,
    removeItem,
    setCustomer,
    setBranchId,
    setDeliveryType,
    setDeliveryAddress,
    setDeliveryPhone,
    setDeliveryFee,
    setOtherFees,
    setOtherFeesNotes,
    discountType,
    setDiscountType,
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
  const { data: discountRules = [] } = useDiscountRules()
  const { data: allCustomers = [], isLoading: isLoadingCustomers } = useAllActiveCustomers()
  const { data: searchedProducts, isLoading: isSearchingProducts } = usePOSProductSearch(
    productSearch,
    branchId || ''
  )
  const { data: sellingUnits = [], isLoading: isLoadingUnits } = useProductSellingUnits(selectedProduct?.id)

  const createTransaction = useCreateTransaction()
  const createCustomer = useCreateCustomer()
  const updateDeliveryType = useUpdateTransactionDeliveryType()

  // ── History panel state ────────────────────────────────────────────────
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [historyPage, setHistoryPage] = useState(1)
  const [historyDateFrom, setHistoryDateFrom] = useState(getTodayPH())
  const [historyDateTo, setHistoryDateTo] = useState(getTodayPH())
  const [reprintReceiptData, setReprintReceiptData] = useState<ReceiptData | null>(null)
  const [isReprintOpen, setIsReprintOpen] = useState(false)
  const [reprintingId, setReprintingId] = useState<string | null>(null)
  const [historyDetailTxn, setHistoryDetailTxn] = useState<any | null>(null)
  const [isEditDeliveryOpen, setIsEditDeliveryOpen] = useState(false)
  const [editDeliveryType, setEditDeliveryType] = useState<'pickup' | 'delivery'>('pickup')
  const [editDeliveryAddress, setEditDeliveryAddress] = useState('')
  const [editDeliveryPhone, setEditDeliveryPhone] = useState('')
  const [savingDelivery, setSavingDelivery] = useState(false)

  const { data: historyData, isLoading: isLoadingHistory, refetch: refetchHistory } = useTransactions({
    branch_id: branchId || undefined,
    search: historySearch || undefined,
    date_from: historyDateFrom || undefined,
    date_to: historyDateTo || undefined,
    page: historyPage,
    limit: 20,
  })
  const historyTransactions = historyData?.transactions || []
  const historyTotalPages = historyData?.totalPages || 1

  // Walk-in Customer from database (hardcoded to avoid API calls)
  const WALK_IN_CUSTOMER = {
    id: '446961e1-fcce-40bb-9f5a-3ea10cf976ea',
    name: 'Walk-in Customer',
    phone: null,
    customer_type: 'cash' as const,
    credit_limit: 0,
    outstanding_balance: 0,
  }

  // Filter customers based on search
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) {
      return allCustomers
    }
    const searchLower = customerSearch.toLowerCase()
    return allCustomers.filter(c =>
      c.name.toLowerCase().includes(searchLower) ||
      (c.phone && c.phone.toLowerCase().includes(searchLower))
    )
  }, [allCustomers, customerSearch])

  // Printer settings
  const { btPortPath } = usePrinterStore()

  // Auto-print to Bluetooth thermal printer if configured (fire-and-forget)
  const autoPrintBluetooth = useCallback(async (receipt: ReceiptData) => {
    if (!btPortPath || typeof window === 'undefined' || !window.electronBluetooth) return
    try {
      const bytes = buildReceiptBytes(receipt)
      let binary  = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      const result = await window.electronBluetooth.printBytes(btPortPath, btoa(binary))
      if (!result.success) toast.error(`Thermal print failed: ${result.error}`)
    } catch (err: any) {
      toast.error(`Thermal print error: ${err?.message}`)
    }
  }, [btPortPath])

  // Get authenticated user
  const { user } = useAuthStore()
  const [isPrintOpen, setIsPrintOpen] = useState(false)
  const [pendingInvoice, setPendingInvoice] = useState<InvoiceData | null>(null)
  const [pendingReceipt, setPendingReceipt] = useState<ReceiptData | null>(null)

  // Set mounted state and initialize date (client-side only to avoid hydration errors)
  useEffect(() => {
    setIsMounted(true)
    setSaleDate(getTodayPH())
  }, [])

  // Set default branch and walk-in customer
  useEffect(() => {
    const branchesList = branches as any[] || []
    if (branchesList.length > 0 && !branchId) {
      setBranchId(branchesList[0].id)
    }
  }, [branches, branchId, setBranchId])

  useEffect(() => {
    if (!customer) {
      setCustomer(WALK_IN_CUSTOMER)
    }
  }, [customer, setCustomer])

  // Auto-select primary unit when selling units are loaded
  useEffect(() => {
    if (sellingUnits.length > 0 && !selectedUnitId && selectedProduct) {
      const primaryUnit = sellingUnits.find(su => su.is_primary && su.is_active)
      if (primaryUnit) {
        setSelectedUnitId(primaryUnit.uom_id)
      } else {
        const hasProductPrimaryOption = selectedProduct.selling_uom_id &&
          !sellingUnits.some(su => su.uom_id === selectedProduct.selling_uom_id && su.is_active)

        if (hasProductPrimaryOption) {
          setSelectedUnitId(selectedProduct.selling_uom_id)
        } else {
          const firstActive = sellingUnits.find(su => su.is_active)
          if (firstActive) {
            setSelectedUnitId(firstActive.uom_id)
          }
        }
      }
    }
  }, [sellingUnits, selectedUnitId, selectedProduct])

  // Handle product selection
  const handleAddProduct = useCallback(async (product: any) => {
    if (product.available_stock <= 0) {
      toast.error(`${product.name} is out of stock`)
      return
    }

    try {
      const units = await getProductSellingUnits(product.id)
      const activeUnits = units.filter(u => u.is_active)

      const hasMultipleOptions = activeUnits.length > 1 ||
        (activeUnits.length === 1 && activeUnits[0].uom_id !== product.selling_uom_id)

      if (!hasMultipleOptions) {
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
            uom_name: product.selling_uom_abbreviation || product.uom_abbreviation || product.uom_name,
            unit_price: product.unit_price,
            cogs_per_unit: product.cogs,
            markup_percentage: product.markup_percentage ?? 0,
            discount_amount: 0,
            available_stock: product.available_stock,
          })
        } else {
          const unitIsStaleBaseEntry =
            unit.uom_id === product.uom_id &&
            product.selling_uom_id &&
            product.selling_uom_id !== product.uom_id

          const cogsCost = unitIsStaleBaseEntry
            ? product.cogs
            : (unit.uom_id !== product.uom_id && unit.conversion_factor && unit.conversion_factor !== 1)
              ? product.cogs / unit.conversion_factor
              : product.cogs

          addItem({
            product_id: product.id,
            product_code: product.code,
            product_name: product.name,
            variant_id: null,
            variant_name: null,
            quantity: 1,
            uom_id: unitIsStaleBaseEntry ? product.selling_uom_id : unit.uom_id,
            uom_name: unitIsStaleBaseEntry
              ? (product.selling_uom_abbreviation || product.selling_uom_name || product.uom_abbreviation || '')
              : (unit.uom?.code || unit.uom?.name || product.selling_uom_abbreviation || product.uom_abbreviation || ''),
            unit_price: unitIsStaleBaseEntry ? product.unit_price : unit.selling_price,
            cogs_per_unit: cogsCost,
            markup_percentage: unitIsStaleBaseEntry ? (product.markup_percentage ?? 0) : unit.markup_percentage,
            discount_amount: 0,
            available_stock: product.available_stock,
          })
        }

        setProductSearch('')
        toast.success(`Added ${product.name} to cart`)
      } else {
        setSelectedProduct(product)
        setIsUnitSelectorOpen(true)
      }
    } catch (error) {
      console.error('Error fetching selling units:', error)
      addItem({
        product_id: product.id,
        product_code: product.code,
        product_name: product.name,
        variant_id: null,
        variant_name: null,
        quantity: 1,
        uom_id: product.selling_uom_id || product.uom_id,
        uom_name: product.selling_uom_abbreviation || product.uom_abbreviation || product.uom_name,
        unit_price: product.unit_price,
        cogs_per_unit: product.cogs,
        markup_percentage: product.markup_percentage ?? 0,
        discount_amount: 0,
        available_stock: product.available_stock,
      })
      setProductSearch('')
      toast.success(`Added ${product.name} to cart`)
    }
  }, [addItem])

  // Handle adding product with selected unit
  const handleAddWithUnit = useCallback(() => {
    if (!selectedProduct || !selectedUnitId) return

    const sellingUnit = sellingUnits.find(su => su.uom_id === selectedUnitId)

    if (!sellingUnit) {
      if (selectedUnitId === selectedProduct.selling_uom_id) {
        addItem({
          product_id: selectedProduct.id,
          product_code: selectedProduct.code,
          product_name: selectedProduct.name,
          variant_id: null,
          variant_name: null,
          quantity: 1,
          uom_id: selectedProduct.selling_uom_id || selectedProduct.uom_id,
          uom_name: selectedProduct.selling_uom_abbreviation || selectedProduct.uom_abbreviation || selectedProduct.uom_name,
          unit_price: selectedProduct.unit_price,
          cogs_per_unit: selectedProduct.cogs,
          markup_percentage: selectedProduct.markup_percentage ?? 0,
          discount_amount: 0,
          available_stock: selectedProduct.available_stock,
        })

        setProductSearch('')
        setIsUnitSelectorOpen(false)
        setSelectedProduct(null)
        setSelectedUnitId('')
        toast.success(`Added ${selectedProduct.name} to cart`)
      } else {
        toast.error('Please select a valid unit')
      }
      return
    }

    const cogsCost = (sellingUnit.uom_id !== selectedProduct.uom_id &&
                      sellingUnit.conversion_factor &&
                      sellingUnit.conversion_factor !== 1)
      ? selectedProduct.cogs / sellingUnit.conversion_factor
      : selectedProduct.cogs

    addItem({
      product_id: selectedProduct.id,
      product_code: selectedProduct.code,
      product_name: selectedProduct.name,
      variant_id: null,
      variant_name: null,
      quantity: 1,
      uom_id: sellingUnit.uom_id,
      uom_name: sellingUnit.uom?.code || sellingUnit.uom?.name || '',
      unit_price: sellingUnit.selling_price,
      cogs_per_unit: cogsCost,
      markup_percentage: sellingUnit.markup_percentage,
      discount_amount: 0,
      available_stock: selectedProduct.available_stock,
    })

    setProductSearch('')
    setIsUnitSelectorOpen(false)
    setSelectedProduct(null)
    setSelectedUnitId('')
    toast.success(`Added ${selectedProduct.name} to cart`)
  }, [selectedProduct, selectedUnitId, sellingUnits, addItem])

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

  // Helper: always derive markup from actual pricing data, not cached field
  const getItemMarkup = useCallback((item: { cogs_per_unit: number; unit_price: number; markup_percentage: number }) => {
    return item.cogs_per_unit > 0
      ? ((item.unit_price / item.cogs_per_unit - 1) * 100)
      : (item.markup_percentage ?? 0)
  }, [])

  // Handle discount type change
  const handleDiscountTypeChange = useCallback((type: typeof discountType) => {
    setDiscountAmount(0)
    setDiscountPercentage(0)
    items.forEach((item) => updateItemDiscount(item.id, 0))
    setDiscountInput('')
    setDiscountType(type)

    if (type === 'standard') {
      items.forEach((item) => {
        const markup = getItemMarkup(item)
        const discPct = getStandardDiscountForMarkup(discountRules, markup)
        const discAmt = (item.quantity * item.unit_price * discPct) / 100
        updateItemDiscount(item.id, discAmt)
      })
    }

    if (type === 'cost') {
      items.forEach((item) => {
        const discAmt = item.quantity * Math.max(0, item.unit_price - item.cogs_per_unit)
        updateItemDiscount(item.id, discAmt)
      })
    }
  }, [discountRules, items, getItemMarkup, setDiscountAmount, setDiscountPercentage, setDiscountType, updateItemDiscount])

  // Apply fixed / percentage order discount when input changes
  const handleApplyOrderDiscount = useCallback((value: string) => {
    setDiscountInput(value)
    const num = parseFloat(value) || 0
    if (discountType === 'fixed') setDiscountAmount(num)
    if (discountType === 'percentage') setDiscountPercentage(Math.min(100, num))
  }, [discountType, setDiscountAmount, setDiscountPercentage])

  // Handle add payment
  const handleAddPayment = useCallback(() => {
    const amount = parseFloat(paymentAmount)
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

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

  // Sync discountInput when checkout modal opens
  useEffect(() => {
    if (isCheckoutOpen) {
      if (discountType === 'fixed' && discountAmount > 0) {
        setDiscountInput(discountAmount.toString())
      } else if (discountType === 'percentage' && discountPercentage > 0) {
        setDiscountInput(discountPercentage.toString())
      }
    }
  }, [isCheckoutOpen]) // eslint-disable-line react-hooks/exhaustive-deps

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

    const checkoutCustomer = customer || WALK_IN_CUSTOMER

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

    if (wouldExceedCreditLimit()) {
      const availableCredit = getAvailableCredit()
      const creditUsed = getCreditPaymentTotal()
      toast.error(`Credit limit exceeded! Available: ${formatCurrency(availableCredit)}, Used: ${formatCurrency(creditUsed)}`)
      return
    }

    if (!user || !user.id) {
      toast.error('Authentication error. Please login again.')
      return
    }

    try {
      const currentItems = [...items]
      const currentPayments = [...payments]
      const currentCustomer = checkoutCustomer
      const currentSubtotal = subtotal
      const currentTotalDiscount = totalDiscount
      const currentTotal = total
      const currentTotalPaid = totalPaid
      const currentDeliveryType = deliveryType
      const currentDeliveryAddress = deliveryAddress
      const currentDeliveryPhone = deliveryPhone
      const currentDeliveryFee = deliveryFee
      const currentOtherFees = otherFees
      const currentOtherFeesNotes = otherFeesNotes
      const currentNotes = notes

      const result = await createTransaction.mutateAsync({
        input: {
          branch_id: branchId,
          customer_id: checkoutCustomer.id,
          transaction_type: 'sale',
          delivery_type: deliveryType,
          delivery_address: deliveryAddress || null,
          delivery_phone: deliveryPhone || null,
          delivery_fee: deliveryFee || 0,
          other_fees: otherFees || 0,
          other_fees_notes: otherFeesNotes || null,
          discount_amount: getTotalDiscount(),
          notes: notes || null,
          transaction_date: createTimestampPH(saleDate),
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

      toast.success('Transaction completed successfully!')
      setIsCheckoutOpen(false)

      resetAll()
      setSaleDate(getTodayPH())
      setDiscountInput('')
      setCustomer(WALK_IN_CUSTOMER)

      const invoiceData: InvoiceData = {
        invoice_number: result.transaction_number.replace('TXN', 'INV'),
        transaction_number: result.transaction_number,
        date: result.transaction_date || new Date().toISOString(),
        branch: {
          name: currentBranch?.name || 'Main Branch',
          address: (currentBranch as any)?.address || '',
          phone: (currentBranch as any)?.phone || '',
          email: (currentBranch as any)?.email || null,
        },
        customer: {
          name: currentCustomer?.name || 'Walk-in Customer',
          phone: currentCustomer?.phone || null,
          address: null,
          email: null,
        },
        delivery_type: currentDeliveryType,
        delivery_address: currentDeliveryAddress || null,
        delivery_phone: currentDeliveryPhone || null,
        items: [
          ...currentItems.map((item) => ({
            code: item.product_code,
            name: item.product_name,
            quantity: item.quantity,
            uom: item.uom_name,
            unit_price: item.unit_price,
            discount: item.discount_amount,
            total: Math.round(item.quantity * item.unit_price * 100) / 100 - item.discount_amount,
          })),
          ...(currentDeliveryFee > 0 ? [{
            code: 'FEE-DEL',
            name: 'Delivery Fee',
            quantity: 1,
            uom: 'service',
            unit_price: currentDeliveryFee,
            discount: 0,
            total: currentDeliveryFee,
          }] : []),
          ...(currentOtherFees > 0 ? [{
            code: 'FEE-OTHER',
            name: currentOtherFeesNotes || 'Other Fees',
            quantity: 1,
            uom: 'service',
            unit_price: currentOtherFees,
            discount: 0,
            total: currentOtherFees,
          }] : []),
        ],
        subtotal: currentSubtotal,
        discount: currentTotalDiscount,
        tax: 0,
        total: currentTotal,
        amount_paid: currentTotalPaid,
        balance_due: Math.max(0, currentTotal - currentTotalPaid),
        payments: currentPayments.map((p) => ({
          method: p.payment_method,
          amount: p.amount,
          reference: p.reference_number,
          date: result.transaction_date || new Date().toISOString(),
        })),
        notes: currentNotes || null,
        prepared_by: user?.fullName || user?.email || 'Staff',
      }
      const receiptData: ReceiptData = {
        transaction_number: result.transaction_number,
        date: new Date(result.transaction_date || Date.now()).toLocaleDateString('en-PH'),
        time: new Date(result.transaction_date || Date.now()).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
        cashier: user?.fullName || user?.email || 'Staff',
        branch: currentBranch?.name || 'Main Branch',
        customer: {
          name: currentCustomer?.name || 'Walk-in Customer',
          phone: currentCustomer?.phone || null,
        },
        delivery_type: currentDeliveryType,
        delivery_address: currentDeliveryAddress || null,
        items: currentItems.map((item) => ({
          name: item.product_name,
          quantity: item.quantity,
          uom: item.uom_name,
          unit_price: item.unit_price,
          discount: item.discount_amount,
          total: Math.round(item.quantity * item.unit_price * 100) / 100 - item.discount_amount,
        })),
        subtotal: currentSubtotal,
        discount: currentTotalDiscount,
        tax: 0,
        total: currentTotal,
        payments: currentPayments.map((p) => ({
          method: p.payment_method,
          amount: p.amount,
          reference: p.reference_number,
        })),
        amount_paid: currentTotalPaid,
        change: Math.max(0, currentTotalPaid - currentTotal),
        notes: currentNotes || null,
      }
      setPendingReceipt(receiptData)
      setPendingInvoice(invoiceData)
      // Auto-print thermal receipt immediately, then open dialog for A4 invoice
      autoPrintBluetooth(receiptData)
      setIsPrintOpen(true)
    } catch (error: any) {
      toast.error(error.message || 'Failed to complete transaction')
    }
  }

  // ── History handlers ───────────────────────────────────────────────────

  const handleReprintTransaction = async (txnId: string) => {
    setReprintingId(txnId)
    const toastId = toast.loading('Loading transaction…')
    try {
      const txn = await getTransaction(txnId)
      const txnDate = new Date(txn.transaction_date)
      const receipt: ReceiptData = {
        transaction_number: txn.transaction_number,
        date: txnDate.toLocaleDateString('en-PH'),
        time: txnDate.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
        cashier: 'Staff',
        branch: (txn.branch as any)?.name || 'Main Branch',
        customer: {
          name: (txn.customer as any)?.name || 'Walk-in Customer',
          phone: (txn.customer as any)?.phone || null,
        },
        delivery_type: txn.delivery_type,
        delivery_address: txn.delivery_address,
        items: (txn.lines || []).map((line: any) => ({
          name: line.product?.name || 'Product',
          quantity: Number(line.quantity),
          unit_price: Number(line.unit_price),
          uom: line.uom?.abbreviation || line.uom?.code || line.uom?.name || 'pc',
          discount: Number(line.discount_amount) || 0,
          total: Number(line.line_total) || Number(line.quantity) * Number(line.unit_price) - (Number(line.discount_amount) || 0),
        })),
        subtotal: Number(txn.subtotal),
        discount: Number(txn.discount_amount),
        tax: Number(txn.tax_amount),
        total: Number(txn.total_amount),
        payments: (txn.payments || []).map((p: any) => ({
          method: p.payment_method,
          amount: Number(p.amount),
          reference: p.reference_number,
        })),
        amount_paid: Number(txn.amount_paid),
        change: Math.max(0, Number(txn.amount_paid) - Number(txn.total_amount)),
        notes: txn.notes,
      }
      toast.dismiss(toastId)
      // If Bluetooth printer is configured, print immediately without opening dialog
      if (btPortPath && typeof window !== 'undefined' && window.electronBluetooth) {
        autoPrintBluetooth(receipt)
        toast.success('Sent to thermal printer')
      } else {
        setReprintReceiptData(receipt)
        setIsReprintOpen(true)
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load transaction', { id: toastId })
    } finally {
      setReprintingId(null)
    }
  }

  const handleOpenEditDelivery = async (txnId: string) => {
    const toastId = toast.loading('Loading…')
    try {
      const txn = await getTransaction(txnId)
      setHistoryDetailTxn(txn)
      setEditDeliveryType(txn.delivery_type)
      setEditDeliveryAddress(txn.delivery_address || '')
      setEditDeliveryPhone(txn.delivery_phone || '')
      toast.dismiss(toastId)
      setIsEditDeliveryOpen(true)
    } catch {
      toast.error('Failed to load transaction', { id: toastId })
    }
  }

  const handleSaveDeliveryType = async () => {
    if (!historyDetailTxn) return
    setSavingDelivery(true)
    const toastId = toast.loading('Saving…')
    try {
      await updateDeliveryType.mutateAsync({
        transactionId: historyDetailTxn.id,
        deliveryType: editDeliveryType,
        deliveryAddress: editDeliveryType === 'delivery' ? editDeliveryAddress : null,
        deliveryPhone: editDeliveryType === 'delivery' ? editDeliveryPhone : null,
      })
      toast.success('Delivery type updated', { id: toastId })
      setIsEditDeliveryOpen(false)
      setHistoryDetailTxn(null)
      refetchHistory()
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update', { id: toastId })
    } finally {
      setSavingDelivery(false)
    }
  }

  // ───────────────────────────────────────────────────────────────────────

  const subtotal = getSubtotal()
  const totalDiscount = getTotalDiscount()
  const total = getTotal()
  const totalPaid = getTotalPaid()
  const balance = getBalance()
  const itemCount = getItemCount()

  return (
    <div className="h-full flex flex-col lg:flex-row gap-4">
      {/* Left Panel - Product Search & List */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Branch & Customer Selection + History */}
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
                  {isLoadingCustomers ? (
                    <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading...
                    </div>
                  ) : (
                    <>
                      <CommandEmpty>
                        No customers found. Try a different search or add a new customer.
                      </CommandEmpty>
                      <CommandGroup heading={customerSearch ? 'Search Results' : 'All Customers'}>
                        <CommandItem
                          onSelect={() => handleSelectCustomer(WALK_IN_CUSTOMER)}
                          className="cursor-pointer"
                        >
                          <User className="mr-2 h-4 w-4" />
                          <span>{WALK_IN_CUSTOMER.name}</span>
                          <Badge variant="outline" className="ml-auto">
                            Default
                          </Badge>
                        </CommandItem>
                        {filteredCustomers?.map((cust) => (
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
                    </>
                  )}
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

          <Button
            variant="outline"
            className="sm:w-auto shrink-0"
            onClick={() => setIsHistoryOpen(true)}
          >
            <History className="mr-2 h-4 w-4" />
            History
          </Button>
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
                  {searchedProducts?.map((product: any) => {
                    const isOutOfStock = product.available_stock <= 0
                    return (
                      <Card
                        key={product.id}
                        className={`transition-colors ${
                          isOutOfStock
                            ? 'opacity-60 cursor-not-allowed'
                            : 'cursor-pointer hover:bg-accent'
                        }`}
                        onClick={() => !isOutOfStock && handleAddProduct(product)}
                      >
                        <CardContent className="p-3">
                          <div className="flex gap-3">
                            <div className="w-16 h-16 flex-shrink-0 rounded-md overflow-hidden bg-muted flex items-center justify-center">
                              {product.image_url ? (
                                <img
                                  src={product.image_url}
                                  alt={product.name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement
                                    target.style.display = 'none'
                                    target.parentElement!.innerHTML = '<svg class="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>'
                                  }}
                                />
                              ) : (
                                <Package className="w-8 h-8 text-muted-foreground" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-mono text-xs text-muted-foreground truncate">
                                {product.code}
                              </div>
                              <div className="font-medium text-sm line-clamp-2">
                                {product.name}
                              </div>
                              <div className="flex items-center justify-between mt-1">
                                <span className="font-bold text-primary text-sm">
                                  {formatCurrency(product.unit_price)}
                                </span>
                                {isOutOfStock ? (
                                  <Badge variant="destructive" className="text-xs">
                                    Out of Stock
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs">
                                    {product.available_stock} {product.uom_abbreviation}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
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
      <div className="fixed bottom-4 right-4 z-30 lg:hidden">
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
                  <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg border">
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-xs text-muted-foreground">
                        {item.product_code}
                      </div>
                      <div className="font-medium text-sm line-clamp-2">
                        {item.product_name}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatCurrency(item.unit_price)} / {item.uom_name}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon" className="h-7 w-7"
                          onClick={() => updateItemQuantity(item.id, item.quantity - 1)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input type="number" value={item.quantity}
                          onChange={(e) => updateItemQuantity(item.id, parseFloat(e.target.value) || 1)}
                          className="w-16 h-7 text-center" min="0.01" step="1" />
                        <Button variant="outline" size="icon" className="h-7 w-7"
                          onClick={() => updateItemQuantity(item.id, item.quantity + 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">
                          {formatCurrency(Math.round(item.quantity * item.unit_price * 100) / 100 - item.discount_amount)}
                        </span>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                          onClick={() => removeItem(item.id)}>
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
            <Button variant={deliveryType === 'pickup' ? 'default' : 'outline'} size="sm" className="flex-1"
              onClick={() => setDeliveryType('pickup')}>
              <Package className="mr-2 h-4 w-4" />Pickup
            </Button>
            <Button variant={deliveryType === 'delivery' ? 'default' : 'outline'} size="sm" className="flex-1"
              onClick={() => setDeliveryType('delivery')}>
              <Truck className="mr-2 h-4 w-4" />Delivery
            </Button>
          </div>

          <Button className="w-full" size="lg" disabled={items.length === 0}
            onClick={() => { setIsCartOpen(false); setIsCheckoutOpen(true) }}>
            <Receipt className="mr-2 h-5 w-5" />Checkout
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
                  <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg border">
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-xs text-muted-foreground">
                        {item.product_code}
                      </div>
                      <div className="font-medium text-sm line-clamp-2">
                        {item.product_name}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatCurrency(item.unit_price)} / {item.uom_name}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon" className="h-7 w-7"
                          onClick={() => updateItemQuantity(item.id, item.quantity - 1)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input type="number" value={item.quantity}
                          onChange={(e) => updateItemQuantity(item.id, parseFloat(e.target.value) || 1)}
                          className="w-16 h-7 text-center" min="0.01" step="1" />
                        <Button variant="outline" size="icon" className="h-7 w-7"
                          onClick={() => updateItemQuantity(item.id, item.quantity + 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">
                          {formatCurrency(Math.round(item.quantity * item.unit_price * 100) / 100 - item.discount_amount)}
                        </span>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                          onClick={() => removeItem(item.id)}>
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
          {deliveryFee > 0 && (
            <div className="flex justify-between text-sm text-blue-600">
              <span>Delivery Fee</span>
              <span>+{formatCurrency(deliveryFee)}</span>
            </div>
          )}
          {otherFees > 0 && (
            <div className="flex justify-between text-sm text-amber-600">
              <span>Other Fees</span>
              <span>+{formatCurrency(otherFees)}</span>
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
            <Button variant={deliveryType === 'pickup' ? 'default' : 'outline'} size="sm" className="flex-1"
              onClick={() => setDeliveryType('pickup')}>
              <Package className="mr-2 h-4 w-4" />Pickup
            </Button>
            <Button variant={deliveryType === 'delivery' ? 'default' : 'outline'} size="sm" className="flex-1"
              onClick={() => setDeliveryType('delivery')}>
              <Truck className="mr-2 h-4 w-4" />Delivery
            </Button>
          </div>
        </div>

        <CardFooter className="pt-0">
          <Button className="w-full" size="lg" disabled={items.length === 0}
            onClick={() => setIsCheckoutOpen(true)}>
            <Receipt className="mr-2 h-5 w-5" />Checkout
          </Button>
        </CardFooter>
      </Card>

      {/* Checkout Dialog */}
      <Dialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen}>
        <DialogContent className="max-w-3xl max-h-[95vh] overflow-y-auto p-6">
          <DialogHeader className="pb-4 border-b">
            <DialogTitle className="text-2xl">Checkout</DialogTitle>
            <DialogDescription className="text-base">
              Complete the transaction for {customer?.name || 'Walk-in Customer'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Order Summary Section */}
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Order Summary</h3>
              <div className="border rounded-lg p-4 space-y-3 max-h-[240px] overflow-y-auto bg-muted/30">
                {items.map((item) => (
                  <div key={item.id} className="flex justify-between items-center pb-3 border-b last:border-0 last:pb-0">
                    <div className="flex-1">
                      <p className="font-medium">{item.product_name}</p>
                      <p className="text-sm text-muted-foreground">{item.quantity} unit(s)</p>
                    </div>
                    <span className="font-semibold text-lg">{formatCurrency(Math.round(item.quantity * item.unit_price * 100) / 100)}</span>
                  </div>
                ))}
              </div>

              <div className="bg-slate-50 rounded-lg p-4 space-y-3 border">
                <div className="flex justify-between text-base">
                  <span>Subtotal</span>
                  <span className="font-medium">{formatCurrency(subtotal)}</span>
                </div>
                {totalDiscount > 0 && (
                  <div className="flex justify-between text-base text-green-600">
                    <span>Discount</span>
                    <span className="font-medium">-{formatCurrency(totalDiscount)}</span>
                  </div>
                )}
                {deliveryFee > 0 && (
                  <div className="flex justify-between text-base text-blue-600">
                    <span>Delivery Fee</span>
                    <span className="font-medium">+{formatCurrency(deliveryFee)}</span>
                  </div>
                )}
                {otherFees > 0 && (
                  <div className="flex justify-between text-base text-amber-600">
                    <span>Other Fees {otherFeesNotes && `(${otherFeesNotes})`}</span>
                    <span className="font-medium">+{formatCurrency(otherFees)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-xl font-bold">
                  <span>Total</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>
            </div>

            {/* Discount Section */}
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Discount</h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {(['none', 'fixed', 'percentage', 'standard', 'cost'] as const).map((type) => (
                  <Button
                    key={type}
                    variant={discountType === type ? 'default' : 'outline'}
                    className="h-10 text-sm"
                    onClick={() => handleDiscountTypeChange(type)}
                  >
                    {type === 'none' && 'No Discount'}
                    {type === 'fixed' && <><Tag className="mr-1 h-4 w-4" />Fixed</>}
                    {type === 'percentage' && <><Percent className="mr-1 h-4 w-4" />Percentage</>}
                    {type === 'standard' && 'Standard'}
                    {type === 'cost' && 'At Cost'}
                  </Button>
                ))}
              </div>

              {(discountType === 'fixed' || discountType === 'percentage') && (
                <div className="flex gap-3 items-center">
                  <Input
                    type="number"
                    min="0"
                    step={discountType === 'percentage' ? '0.1' : '1'}
                    max={discountType === 'percentage' ? '100' : undefined}
                    placeholder={discountType === 'fixed' ? 'Amount (₱)' : 'Percentage (%)'}
                    value={discountInput}
                    onChange={(e) => handleApplyOrderDiscount(e.target.value)}
                    className="flex-1 h-11"
                  />
                  <span className="text-muted-foreground font-medium">
                    {discountType === 'percentage' ? '%' : '₱'}
                  </span>
                </div>
              )}

              {discountType === 'standard' && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
                  <p className="font-medium text-muted-foreground">Applied per item based on markup:</p>
                  {items.map((item) => {
                    const markup = getItemMarkup(item)
                    const discPct = getStandardDiscountForMarkup(discountRules, markup)
                    const discAmt = (item.quantity * item.unit_price * discPct) / 100
                    return (
                      <div key={item.id} className="flex justify-between">
                        <span className="truncate flex-1 mr-2">{item.product_name}</span>
                        <span className="text-muted-foreground">
                          {discPct}% off
                          {discAmt > 0 && <span className="text-green-600 ml-1">(-{formatCurrency(discAmt)})</span>}
                          {discAmt === 0 && <span className="text-muted-foreground ml-1">(no rule)</span>}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}

              {discountType === 'cost' && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
                  <p className="font-medium text-muted-foreground">Customer pays cost price only:</p>
                  {items.map((item) => {
                    const discAmt = item.quantity * Math.max(0, item.unit_price - item.cogs_per_unit)
                    const costTotal = item.quantity * item.cogs_per_unit
                    return (
                      <div key={item.id} className="flex justify-between">
                        <span className="truncate flex-1 mr-2">{item.product_name}</span>
                        <span className="text-muted-foreground">
                          Cost: {formatCurrency(costTotal)}
                          {discAmt > 0 && <span className="text-green-600 ml-1">(-{formatCurrency(discAmt)})</span>}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}

              {getTotalDiscount() > 0 && (
                <p className="text-sm text-green-700 font-medium">
                  Total discount: -{formatCurrency(getTotalDiscount())}
                </p>
              )}
            </div>

            {/* Delivery Details */}
            {deliveryType === 'delivery' && (
              <div className="space-y-3 bg-blue-50 rounded-lg p-4 border border-blue-200">
                <h3 className="font-semibold">Delivery Details</h3>
                <Input placeholder="Delivery Address" value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)} className="h-12" />
                <Input placeholder="Contact Phone" value={deliveryPhone}
                  onChange={(e) => setDeliveryPhone(e.target.value)} className="h-12" />
                <div className="space-y-2">
                  <Label>Delivery Fee</Label>
                  <Input type="number" step="0.01" placeholder="0.00" value={deliveryFee || ''}
                    onChange={(e) => setDeliveryFee(Number(e.target.value) || 0)} className="h-12" />
                </div>
              </div>
            )}

            {/* Other Fees */}
            <div className="space-y-3 bg-amber-50 rounded-lg p-4 border border-amber-200">
              <h3 className="font-semibold">Additional Fees (optional)</h3>
              <div className="space-y-2">
                <Label>Fee Amount</Label>
                <Input type="number" step="0.01" placeholder="0.00" value={otherFees || ''}
                  onChange={(e) => setOtherFees(Number(e.target.value) || 0)} className="h-12" />
              </div>
              <div className="space-y-2">
                <Label>Fee Description</Label>
                <Input placeholder="e.g., Service charge, Processing fee" value={otherFeesNotes}
                  onChange={(e) => setOtherFeesNotes(e.target.value)} className="h-12"
                  disabled={!otherFees || otherFees === 0} />
              </div>
            </div>

            {/* Sale Date */}
            <div className="space-y-2">
              <Label className="text-base font-semibold">Sale Date</Label>
              <Input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)}
                max={isMounted ? getTodayPH() : ''} className="h-11" />
              {isMounted && saleDate && !isTodayPH(saleDate) && (
                <p className="text-xs text-amber-600 font-medium">
                  Backdated sale — recording as {new Date(saleDate + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              )}
            </div>

            {/* Notes Section */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">Order Notes (optional)</Label>
              <Textarea placeholder="Add any special instructions..." value={notes}
                onChange={(e) => setNotes(e.target.value)} rows={3} className="text-base" />
            </div>

            {/* Payment Section */}
            <div className="space-y-4 border-t pt-6">
              <h3 className="font-semibold text-lg">Payment</h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {paymentMethods.map((method) => (
                  <Button
                    key={method.value}
                    variant={selectedPaymentMethod === method.value ? 'default' : 'outline'}
                    className="h-12 text-base"
                    onClick={() => setSelectedPaymentMethod(method.value)}
                  >
                    <method.icon className="mr-2 h-5 w-5" />
                    <span className="hidden sm:inline">{method.label}</span>
                    <span className="sm:hidden text-xs">{method.label}</span>
                  </Button>
                ))}
              </div>

              <div className="space-y-3">
                <Label className="text-base">Payment Amount</Label>
                <div className="flex gap-3">
                  <Input type="number" placeholder="0.00" value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    min="0" step="0.01" className="flex-1 h-12 text-lg" />
                  <Button onClick={handleAddPayment} className="h-12 px-6 text-base">
                    Add Payment
                  </Button>
                </div>

                {(selectedPaymentMethod === 'gcash' ||
                  selectedPaymentMethod === 'maya' ||
                  selectedPaymentMethod === 'bank_transfer') && (
                  <div className="space-y-2">
                    <Label className="text-sm">Reference Number</Label>
                    <Input placeholder="e.g., Transaction or Reference ID" value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)} className="h-10" />
                  </div>
                )}

                {selectedPaymentMethod === 'credit' && customer && (
                  <div className={`rounded-lg p-4 space-y-2 ${
                    wouldExceedCreditLimit() ? 'bg-red-50 text-red-900 border-2 border-red-300' : 'bg-blue-50 text-blue-900 border-2 border-blue-300'
                  }`}>
                    <div className="flex justify-between text-base font-semibold">
                      <span>Credit Limit:</span>
                      <span>{formatCurrency(customer.credit_limit)}</span>
                    </div>
                    <div className="flex justify-between text-base">
                      <span>Outstanding Balance:</span>
                      <span>{formatCurrency(customer.outstanding_balance)}</span>
                    </div>
                    <div className="flex justify-between text-base">
                      <span>This Order:</span>
                      <span>{formatCurrency(getCreditPaymentTotal())}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2 mt-2 font-bold text-base">
                      <span>Available Credit:</span>
                      <span className={wouldExceedCreditLimit() ? 'text-red-700' : 'text-green-700'}>
                        {formatCurrency(Math.max(0, getAvailableCredit() - getCreditPaymentTotal()))}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Button variant="secondary" className="h-10 text-sm"
                  onClick={() => setPaymentAmount(balance.toFixed(2))}>
                  Exact
                </Button>
                <Button variant="secondary" className="h-10 text-sm"
                  onClick={() => setPaymentAmount((Math.ceil(total / 100) * 100).toString())}>
                  Round Up
                </Button>
                <Button variant="secondary" className="h-10 text-sm"
                  onClick={() => setPaymentAmount((Math.ceil(total / 500) * 500).toString())}>
                  +500
                </Button>
              </div>

              {payments.length > 0 && (
                <div className="border rounded-lg p-4 space-y-3 bg-amber-50">
                  <h4 className="font-semibold text-base">Payment Methods Added</h4>
                  {payments.map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-base py-1 px-2">{payment.payment_method.toUpperCase()}</Badge>
                          {payment.reference_number && (
                            <span className="text-sm text-muted-foreground">#{payment.reference_number}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-lg">{formatCurrency(payment.amount)}</span>
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-red-100"
                          onClick={() => removePayment(payment.id)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-yellow-50 rounded-lg p-4 space-y-4 border-2 border-yellow-300">
                <div className="flex justify-between text-lg">
                  <span>Total Amount:</span>
                  <span className="font-bold">{formatCurrency(total)}</span>
                </div>
                <div className="flex justify-between text-lg">
                  <span>Amount Paid:</span>
                  <span className="text-green-600 font-bold">{formatCurrency(totalPaid)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-xl font-bold">
                  <span>{balance > 0.01 ? 'Balance Due' : 'Change'}</span>
                  <span className={balance > 0.01 ? 'text-red-600' : 'text-green-600'}>
                    {formatCurrency(Math.abs(balance))}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-3 mt-6 pt-6 border-t">
            <Button variant="outline" onClick={() => setIsCheckoutOpen(false)} className="h-12 text-base flex-1">
              Cancel
            </Button>
            <Button onClick={handleCheckout} disabled={createTransaction.isPending || balance > 0.01}
              className="h-12 text-base flex-1">
              {createTransaction.isPending ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Check className="mr-2 h-5 w-5" />
              )}
              Complete Transaction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Post-checkout Print Dialog */}
      <PrintDialog
        open={isPrintOpen}
        onOpenChange={setIsPrintOpen}
        receiptData={pendingReceipt}
        invoiceData={pendingInvoice}
        onComplete={() => { setPendingReceipt(null); setPendingInvoice(null) }}
      />

      {/* History Reprint Dialog */}
      <PrintDialog
        open={isReprintOpen}
        onOpenChange={(open) => {
          setIsReprintOpen(open)
          if (!open) setReprintReceiptData(null)
        }}
        receiptData={reprintReceiptData}
        invoiceData={null}
      />

      {/* ── History Sheet ─────────────────────────────────────────────────── */}
      <Sheet open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col p-0">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <SheetTitle className="text-lg font-semibold flex items-center gap-2">
              <History className="h-5 w-5" />
              Transaction History
            </SheetTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { refetchHistory() }}
              title="Refresh"
            >
              <Receipt className="h-4 w-4" />
            </Button>
          </div>

          {/* Filters */}
          <div className="px-6 py-3 border-b space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by TXN# or customer…"
                className="pl-8 h-9"
                value={historySearch}
                onChange={(e) => { setHistorySearch(e.target.value); setHistoryPage(1) }}
              />
            </div>
            <div className="flex gap-2 items-center">
              <Input
                type="date"
                className="h-9 text-sm"
                value={historyDateFrom}
                onChange={(e) => { setHistoryDateFrom(e.target.value); setHistoryPage(1) }}
              />
              <span className="text-muted-foreground text-sm shrink-0">to</span>
              <Input
                type="date"
                className="h-9 text-sm"
                value={historyDateTo}
                onChange={(e) => { setHistoryDateTo(e.target.value); setHistoryPage(1) }}
              />
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  const today = getTodayPH()
                  setHistoryDateFrom(today)
                  setHistoryDateTo(today)
                  setHistorySearch('')
                  setHistoryPage(1)
                }}
              >
                Today
              </Button>
            </div>
          </div>

          {/* Transaction list */}
          <div className="flex-1 overflow-y-auto">
            {isLoadingHistory ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : historyTransactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Receipt className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">No transactions found</p>
              </div>
            ) : (
              <div className="divide-y">
                {historyTransactions.map((txn: any) => {
                  const txnDate = new Date(txn.transaction_date)
                  const todayStr = getTodayPH()
                  const isSameDay = historyDateFrom === historyDateTo && historyDateFrom === todayStr
                  const dateLabel = isSameDay
                    ? txnDate.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
                    : txnDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) + ' ' + txnDate.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
                  const isReprinting = reprintingId === txn.id
                  return (
                    <div key={txn.id} className="px-6 py-4 hover:bg-muted/40 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-semibold">{txn.transaction_number}</span>
                            <Badge
                              variant={txn.delivery_type === 'delivery' ? 'secondary' : 'outline'}
                              className="text-xs"
                            >
                              {txn.delivery_type === 'delivery' ? (
                                <><Truck className="mr-1 h-3 w-3" />Delivery</>
                              ) : (
                                <><Package className="mr-1 h-3 w-3" />Pickup</>
                              )}
                            </Badge>
                            <Badge
                              variant={
                                txn.payment_status === 'paid' ? 'default'
                                  : txn.payment_status === 'partial' ? 'secondary'
                                    : 'destructive'
                              }
                              className="text-xs"
                            >
                              {txn.payment_status}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground mt-0.5">
                            {(txn.customer as any)?.name || 'Walk-in Customer'}
                            <span className="mx-1.5">·</span>
                            {dateLabel}
                          </div>
                          {txn.delivery_type === 'delivery' && txn.delivery_address && (
                            <div className="text-xs text-muted-foreground mt-0.5 truncate">
                              {txn.delivery_address}
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-semibold text-sm">{formatCurrency(txn.total_amount)}</div>
                          <div className="flex items-center gap-1 mt-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              onClick={() => handleReprintTransaction(txn.id)}
                              disabled={isReprinting}
                            >
                              {isReprinting
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <Printer className="h-3 w-3" />
                              }
                              <span className="ml-1">Print</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              onClick={() => handleOpenEditDelivery(txn.id)}
                            >
                              <Edit className="h-3 w-3" />
                              <span className="ml-1">Delivery</span>
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Pagination */}
          {historyTotalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t text-sm">
              <span className="text-muted-foreground">Page {historyPage} of {historyTotalPages}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setHistoryPage(p => Math.max(1, p - 1))} disabled={historyPage === 1}>
                  Prev
                </Button>
                <Button size="sm" variant="outline" onClick={() => setHistoryPage(p => Math.min(historyTotalPages, p + 1))} disabled={historyPage === historyTotalPages}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Edit Delivery Type Dialog ─────────────────────────────────────── */}
      <Dialog open={isEditDeliveryOpen} onOpenChange={(open) => {
        setIsEditDeliveryOpen(open)
        if (!open) setHistoryDetailTxn(null)
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Edit Delivery Type
            </DialogTitle>
            <DialogDescription>
              {historyDetailTxn?.transaction_number} — change pickup/delivery and update address.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={editDeliveryType === 'pickup' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setEditDeliveryType('pickup')}
                >
                  <Package className="mr-2 h-4 w-4" />
                  Pickup
                </Button>
                <Button
                  type="button"
                  variant={editDeliveryType === 'delivery' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setEditDeliveryType('delivery')}
                >
                  <Truck className="mr-2 h-4 w-4" />
                  Delivery
                </Button>
              </div>
            </div>

            {editDeliveryType === 'delivery' && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-addr">Delivery Address</Label>
                  <Input
                    id="edit-addr"
                    placeholder="Full delivery address"
                    value={editDeliveryAddress}
                    onChange={(e) => setEditDeliveryAddress(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-phone">Contact Phone</Label>
                  <Input
                    id="edit-phone"
                    placeholder="09XX-XXX-XXXX"
                    value={editDeliveryPhone}
                    onChange={(e) => setEditDeliveryPhone(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDeliveryOpen(false)} disabled={savingDelivery}>
              Cancel
            </Button>
            <Button onClick={handleSaveDeliveryType} disabled={savingDelivery}>
              {savingDelivery ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-2 h-4 w-4" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unit Selector Dialog */}
      <Dialog open={isUnitSelectorOpen} onOpenChange={(open) => {
        setIsUnitSelectorOpen(open)
        if (!open) { setSelectedProduct(null); setSelectedUnitId('') }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Unit</DialogTitle>
            <DialogDescription>
              {selectedProduct?.name} can be sold in multiple units. Choose one:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {isLoadingUnits ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : sellingUnits.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">
                No selling units configured. Using default unit.
              </div>
            ) : (
              <div className="grid gap-2">
                {selectedProduct && !sellingUnits.some(su => su.uom_id === selectedProduct.selling_uom_id && su.is_active) && (
                  <Button key="primary" type="button"
                    variant={selectedUnitId === selectedProduct.selling_uom_id ? 'default' : 'outline'}
                    className="w-full justify-start h-auto py-3"
                    onClick={() => setSelectedUnitId(selectedProduct.selling_uom_id)}>
                    <div className="flex flex-col items-start w-full">
                      <div className="flex items-center justify-between w-full">
                        <span className="font-medium">
                          {selectedProduct.selling_uom_name || selectedProduct.uom_name} ({selectedProduct.selling_uom_abbreviation || selectedProduct.uom_abbreviation})
                          <Badge variant="secondary" className="ml-2">Primary</Badge>
                        </span>
                        <span className="font-bold">{formatCurrency(selectedProduct.unit_price)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">Product default selling unit</div>
                    </div>
                  </Button>
                )}
                {sellingUnits.filter(su => su.is_active).map((unit) => (
                  <Button key={unit.id} type="button"
                    variant={selectedUnitId === unit.uom_id ? 'default' : 'outline'}
                    className="w-full justify-start h-auto py-3"
                    onClick={() => setSelectedUnitId(unit.uom_id)}>
                    <div className="flex flex-col items-start w-full">
                      <div className="flex items-center justify-between w-full">
                        <span className="font-medium">
                          {unit.uom?.name} ({unit.uom?.code})
                          {unit.is_primary && <Badge variant="secondary" className="ml-2">Primary</Badge>}
                        </span>
                        <span className="font-bold">{formatCurrency(unit.selling_price)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {unit.conversion_factor} {unit.uom?.code} per base unit
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => {
              setIsUnitSelectorOpen(false); setSelectedProduct(null); setSelectedUnitId('')
            }}>Cancel</Button>
            <Button type="button" onClick={handleAddWithUnit} disabled={!selectedUnitId || isLoadingUnits}>
              Add to Cart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Customer Dialog */}
      <Dialog open={isNewCustomerOpen} onOpenChange={setIsNewCustomerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
            <DialogDescription>Create a new customer to use in this transaction.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="customer-name">Customer Name <span className="text-destructive">*</span></Label>
              <Input id="customer-name" placeholder="e.g., Juan Dela Cruz" value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-phone">Phone Number</Label>
              <Input id="customer-phone" placeholder="e.g., 09171234567" value={newCustomerPhone}
                onChange={(e) => setNewCustomerPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Customer Type</Label>
              <div className="flex gap-2">
                <Button type="button" variant={newCustomerType === 'cash' ? 'default' : 'outline'}
                  size="sm" className="flex-1" onClick={() => setNewCustomerType('cash')}>
                  <Banknote className="mr-2 h-4 w-4" />Cash
                </Button>
                <Button type="button" variant={newCustomerType === 'credit' ? 'default' : 'outline'}
                  size="sm" className="flex-1" onClick={() => setNewCustomerType('credit')}>
                  <CreditCard className="mr-2 h-4 w-4" />Credit
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewCustomerOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateCustomer} disabled={createCustomer.isPending || !newCustomerName.trim()}>
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
    </div>
  )
}
