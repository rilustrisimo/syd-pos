'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { usePOSStore } from '@/lib/stores/posStore'
import { useAuthStore } from '@/lib/stores/auth'
import { usePOSProductSearch, useCreateTransaction, useTodaysSummary } from '@/hooks/useTransactions'
import { getCustomerDeliveryPhones } from '@/lib/supabase/queries/transactions'
import { getClient } from '@/lib/supabase/client'
import { useSearchCustomers, useAllActiveCustomers, useCreateCustomer } from '@/hooks/useCustomers'
import { useAllActiveReferrers } from '@/hooks/useReferrers'
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
  ClipboardCheck,
  UserPlus,
  Percent,
  Tag,
  Handshake,
  Ban,
  BadgeCheck,
  Eye,
  EyeOff,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PrintDialog } from '@/components/print/print-dialog'
import type { InvoiceData } from '@/components/print/invoice-template'
import type { ReceiptData } from '@/lib/utils/usb-thermal-print'
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
import dynamic from 'next/dynamic'
import type { MapSuggestResult } from '@/components/pos/delivery-map-picker'

const DeliveryMapPicker = dynamic(
  () => import('@/components/pos/delivery-map-picker').then(m => ({ default: m.DeliveryMapPicker })),
  { ssr: false, loading: () => <div className="w-full h-52 rounded-xl bg-slate-100 animate-pulse border border-slate-200" /> }
)

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
  // Censored by default — this card sits at the top of the screen the
  // cashier faces the customer across, resets to hidden on every visit.
  const [showTodaysSales, setShowTodaysSales] = useState(false)
  const [isCustomerOpen, setIsCustomerOpen] = useState(false)
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [mapExpanded, setMapExpanded] = useState(false)
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
  const [referrerId, setReferrerId] = useState<string | null>(null)
  const [referrerCommissionRate, setReferrerCommissionRate] = useState<string>('')
  const [referrerSearch, setReferrerSearch] = useState('')
  const [isReferrerOpen, setIsReferrerOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [pendingOnlineOrderId, setPendingOnlineOrderId] = useState<string | null>(null)
  const [pendingOnlineOrderFulfillment, setPendingOnlineOrderFulfillment] = useState<'delivery' | 'pickup' | null>(null)
  const [isUnitSelectorOpen, setIsUnitSelectorOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<any>(null)
  const [selectedUnitId, setSelectedUnitId] = useState<string>('')
  const [deliveryPhoneHistory, setDeliveryPhoneHistory] = useState<string[]>([])
  const [deliveryPhoneHistoryLoading, setDeliveryPhoneHistoryLoading] = useState(false)
  const [deliveryCoords, setDeliveryCoords] = useState<{ lat: number; lng: number; distanceKm: number; roadBased: boolean } | null>(null)
  const [deliveryGeocodedAddress, setDeliveryGeocodedAddress] = useState<string | null>(null)
  const [deliveryFeeConfirmed, setDeliveryFeeConfirmed] = useState(false)

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
    manualInvoiceNumber,
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
    setManualInvoiceNumber,
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
  const { data: allReferrers = [] } = useAllActiveReferrers()
  const { data: searchedProducts, isLoading: isSearchingProducts } = usePOSProductSearch(
    productSearch,
    branchId || ''
  )
  const { data: todaysSummary } = useTodaysSummary(branchId || undefined)
  const { data: sellingUnits = [], isLoading: isLoadingUnits } = useProductSellingUnits(selectedProduct?.id)

  const createTransaction = useCreateTransaction()
  const createCustomer = useCreateCustomer()

  // Walk-in Customer from database (hardcoded to avoid API calls)
  const WALK_IN_CUSTOMER = {
    id: '446961e1-fcce-40bb-9f5a-3ea10cf976ea',
    name: 'Walk-in Customer',
    phone: null,
    customer_type: 'cash' as const,
    credit_limit: 0,
    outstanding_balance: 0,
  }

  // Load delivery phone history when customer or delivery type changes
  useEffect(() => {
    if (deliveryType !== 'delivery' || !customer?.id || customer.id === WALK_IN_CUSTOMER.id) {
      setDeliveryPhoneHistory([])
      return
    }
    setDeliveryPhoneHistoryLoading(true)
    getCustomerDeliveryPhones(customer.id)
      .then(setDeliveryPhoneHistory)
      .catch(() => setDeliveryPhoneHistory([]))
      .finally(() => setDeliveryPhoneHistoryLoading(false))
  }, [customer?.id, deliveryType])

  // Quick-pick phone numbers: customer primary + up to 5 recent delivery phones
  const quickPickNumbers = useMemo(() => {
    const seen = new Set<string>()
    const result: { number: string; label: string }[] = []
    if (customer?.phone && customer.id !== WALK_IN_CUSTOMER.id) {
      seen.add(customer.phone)
      result.push({ number: customer.phone, label: 'Primary' })
    }
    for (const p of deliveryPhoneHistory) {
      if (!seen.has(p) && result.length < 6) {
        seen.add(p)
        result.push({ number: p, label: 'Recent' })
      }
    }
    return result
  }, [customer?.phone, customer?.id, deliveryPhoneHistory])

  // Filter referrers based on search
  const filteredReferrers = useMemo(() => {
    if (!referrerSearch.trim()) return allReferrers
    const q = referrerSearch.toLowerCase()
    return allReferrers.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.profession?.toLowerCase().includes(q)
    )
  }, [allReferrers, referrerSearch])

  const selectedReferrer = useMemo(() =>
    allReferrers.find(r => r.id === referrerId) ?? null,
    [allReferrers, referrerId]
  )

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

  // Get authenticated user
  const { user } = useAuthStore()
  const [isPrintOpen, setIsPrintOpen] = useState(false)
  const [pendingInvoice, setPendingInvoice] = useState<InvoiceData | null>(null)
  const [pendingReceipt, setPendingReceipt] = useState<ReceiptData | null>(null)

  // Set mounted state and initialize date (client-side only to avoid hydration errors)
  useEffect(() => {
    setIsMounted(true)
    // Initialize sale date to today in Philippine timezone
    setSaleDate(getTodayPH())
  }, [])

  // Pre-fill cart from an online order when ?from_order=<id> is in the URL
  const fromOrderHandled = useRef(false)
  useEffect(() => {
    const fromOrderId = new URLSearchParams(window.location.search).get('from_order')
    if (!fromOrderId || fromOrderHandled.current || !isMounted) return
    fromOrderHandled.current = true

    async function prefillFromOrder() {
      const supabase = getClient()

      // Fetch the online order with lines and customer
      const { data: order, error } = await supabase
        .from('online_orders')
        .select('*, lines:online_order_lines(*)')
        .eq('id', fromOrderId)
        .single()

      if (error || !order) {
        toast.error('Could not load online order')
        return
      }

      // Set the linked customer (if matched) or walk-in
      if (order.customer_id) {
        const { data: customer } = await supabase
          .from('customers')
          .select('id, name, phone, customer_type, credit_limit, outstanding_balance')
          .eq('id', order.customer_id)
          .single()

        if (customer) {
          setCustomer({
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            customer_type: customer.customer_type as any,
            credit_limit: Number(customer.credit_limit ?? 0),
            outstanding_balance: Number(customer.outstanding_balance ?? 0),
          })
        }
      }

      // Carry over fulfillment + fees from the online order — not just the
      // items and total. Delivery fee still needs the cashier's explicit
      // "Confirm" click (deliveryFeeConfirmed stays false) even though the
      // value is pre-filled correctly, same safety gate as manual entry.
      setDeliveryType(order.fulfillment)
      if (order.fulfillment === 'delivery') {
        setDeliveryAddress(order.address || '')
        setDeliveryPhone(order.customer_phone || '')
        setDeliveryFee(Number(order.delivery_fee) || 0)
        if (order.latitude != null && order.longitude != null) {
          setDeliveryCoords({
            lat: Number(order.latitude),
            lng: Number(order.longitude),
            distanceKm: Number(order.distance_km) || 0,
            roadBased: true,
          })
        }
      }

      // Fetch product details for each line to get uom_id, cogs, etc.
      const lines: any[] = order.lines ?? []
      const productIds = lines.map((l: any) => l.product_id).filter(Boolean)

      let productMap = new Map<string, any>()
      if (productIds.length > 0) {
        const { data: products } = await supabase
          .from('products')
          .select('id, selling_uom_id, base_uom_id, latest_cogs, markup_percentage, units_of_measure!products_base_uom_id_fkey(name, code)')
          .in('id', productIds)

        // Also fetch selling UOM names
        const sellingUomIds = (products ?? []).map((p: any) => p.selling_uom_id).filter(Boolean)
        let sellingUomMap = new Map<string, any>()
        if (sellingUomIds.length > 0) {
          const { data: uoms } = await supabase
            .from('units_of_measure')
            .select('id, name, code')
            .in('id', sellingUomIds)
          sellingUomMap = new Map((uoms ?? []).map((u: any) => [u.id, u]))
        }

        productMap = new Map((products ?? []).map((p: any) => {
          const sellingUom = sellingUomMap.get(p.selling_uom_id)
          return [p.id, { ...p, sellingUom }]
        }))
      }

      // Add each line to the cart
      for (const line of lines) {
        const product = productMap.get(line.product_id)
        addItem({
          product_id: line.product_id ?? line.product_code,
          product_code: line.product_code,
          product_name: line.product_name,
          variant_id: null,
          variant_name: null,
          quantity: Number(line.quantity),
          uom_id: product?.selling_uom_id ?? product?.base_uom_id ?? '',
          uom_name: product?.sellingUom?.code ?? product?.sellingUom?.name ?? line.unit_label,
          unit_price: Number(line.unit_price),
          cogs_per_unit: Number(product?.latest_cogs ?? 0),
          markup_percentage: Number(product?.markup_percentage ?? 0),
          discount_amount: 0,
          available_stock: 9999,
        })
      }

      setPendingOnlineOrderId(fromOrderId)
      setPendingOnlineOrderFulfillment(order.fulfillment)
      toast.success(`Loaded order ${order.order_number} — review and complete the transaction`)
    }

    prefillFromOrder()
  }, [isMounted, addItem, setCustomer])

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
      // First, try to find a primary unit in product_selling_units
      const primaryUnit = sellingUnits.find(su => su.is_primary && su.is_active)
      if (primaryUnit) {
        setSelectedUnitId(primaryUnit.uom_id)
      } else {
        // If no primary in selling units, check if product has a selling_uom_id
        // that's different from the selling units (meaning it's an additional option)
        const hasProductPrimaryOption = selectedProduct.selling_uom_id && 
          !sellingUnits.some(su => su.uom_id === selectedProduct.selling_uom_id && su.is_active)
        
        if (hasProductPrimaryOption) {
          // Select the product's primary selling unit
          setSelectedUnitId(selectedProduct.selling_uom_id)
        } else {
          // Fallback to first active unit from selling units
          const firstActive = sellingUnits.find(su => su.is_active)
          if (firstActive) {
            setSelectedUnitId(firstActive.uom_id)
          }
        }
      }
    }
  }, [sellingUnits, selectedUnitId, selectedProduct])

  // Products currently being added — guards against a rapid double
  // click/tap firing two overlapping handleAddProduct calls for the same
  // product, which would otherwise both resolve and double the quantity
  // (addItem merges by product_id, summing quantity).
  const addingProductsRef = useRef<Set<string>>(new Set())

  // Handle product selection
  const handleAddProduct = useCallback(async (product: any) => {
    // Prevent adding out of stock items
    if (product.available_stock <= 0) {
      toast.error(`${product.name} is out of stock`)
      return
    }

    if (addingProductsRef.current.has(product.id)) return
    addingProductsRef.current.add(product.id)

    // Fetch selling units for this product
    try {
      const units = await getProductSellingUnits(product.id)
      const activeUnits = units.filter(u => u.is_active)
      
      // Check if we should show unit selector:
      // - If there are multiple active selling units in product_selling_units, OR
      // - If there's at least 1 active selling unit AND it's different from the product's selling UOM
      //   (meaning the product can be sold in both its primary UOM and additional units)
      const hasMultipleOptions = activeUnits.length > 1 || 
        (activeUnits.length === 1 && activeUnits[0].uom_id !== product.selling_uom_id)
      
      if (!hasMultipleOptions) {
        // Only 0 or 1 option total - add directly without showing dialog
        const unit = activeUnits[0]
        
        if (!unit) {
          // No selling units configured — use the product's selling UOM
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
          // Use the single active unit.
          // Guard against stale product_selling_units entries: if the only active
          // unit references the base UOM but the product's selling_uom_id differs,
          // the entry is stale (e.g. from migration 00019 before selling UOM was
          // changed). Fall back to the product-level selling UOM in that case.
          const unitIsStaleBaseEntry =
            unit.uom_id === product.uom_id &&
            product.selling_uom_id &&
            product.selling_uom_id !== product.uom_id

          // Calculate COGS: only apply conversion if the unit's UOM differs from base UOM
          // Don't divide if selling the same unit as base (even if conversion_factor exists)
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
        // Multiple units available, show selector dialog
        setSelectedProduct(product)
        setIsUnitSelectorOpen(true)
      }
    } catch (error) {
      console.error('Error fetching selling units:', error)
      // Fallback — still prefer selling UOM over base UOM
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
    } finally {
      addingProductsRef.current.delete(product.id)
    }
  }, [addItem])

  // Handle adding product with selected unit
  const handleAddWithUnit = useCallback(() => {
    if (!selectedProduct || !selectedUnitId) return
    
    // Find the selected selling unit from product_selling_units
    const sellingUnit = sellingUnits.find(su => su.uom_id === selectedUnitId)
    
    // If not found in selling units, user selected the product's primary selling unit
    if (!sellingUnit) {
      // User selected the product's primary/default selling unit
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
    
    // Calculate COGS: only apply conversion if the unit's UOM differs from base UOM
    // Don't divide if selling the same unit as base (even if conversion_factor exists)
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
    if (deliveryType === 'delivery' && !deliveryPhone && cust.phone) {
      setDeliveryPhone(cust.phone)
    }
    setIsCustomerOpen(false)
    setCustomerSearch('')
  }, [setCustomer, deliveryType, deliveryPhone, setDeliveryPhone])

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

  // Helper: always derive markup from actual pricing data, not cached field
  const getItemMarkup = useCallback((item: { cogs_per_unit: number; unit_price: number; markup_percentage: number }) => {
    return item.cogs_per_unit > 0
      ? ((item.unit_price / item.cogs_per_unit - 1) * 100)
      : (item.markup_percentage ?? 0)
  }, [])

  // Handle discount type change — clears previous discounts then applies new one
  const handleDiscountTypeChange = useCallback((type: typeof discountType) => {
    // Clear previous discounts
    setDiscountAmount(0)
    setDiscountPercentage(0)
    items.forEach((item) => updateItemDiscount(item.id, 0))
    setDiscountInput('')
    setDiscountType(type)

    // Auto-apply standard discount immediately
    if (type === 'standard') {
      items.forEach((item) => {
        const markup = getItemMarkup(item)
        const discPct = getStandardDiscountForMarkup(discountRules, markup)
        const discAmt = (item.quantity * item.unit_price * discPct) / 100
        updateItemDiscount(item.id, discAmt)
      })
    }

    // At-cost discount: discount away the entire markup so customer pays COGS
    if (type === 'cost') {
      items.forEach((item) => {
        const discAmt = item.quantity * Math.max(0, item.unit_price - item.cogs_per_unit)
        updateItemDiscount(item.id, discAmt)
      })
    }
  }, [discountRules, items, getItemMarkup, setDiscountAmount, setDiscountPercentage, setDiscountType, updateItemDiscount])

  // Keep per-item "Standard"/"At Cost" discounts in sync with the cart.
  // handleDiscountTypeChange only computes discount_amount once, at the
  // moment the discount type is picked — it goes stale the instant a
  // quantity changes or a new item is added (new items start at 0). This
  // recomputes and corrects any item whose stored discount no longer
  // matches what the rules say it should be, whenever the cart changes.
  // The tolerance check is what keeps this from looping: the store always
  // returns a fresh array reference, but once corrected the effect no
  // longer needs to write, so it settles after one extra pass.
  useEffect(() => {
    if (discountType === 'standard') {
      items.forEach((item) => {
        const markup = getItemMarkup(item)
        const discPct = getStandardDiscountForMarkup(discountRules, markup)
        const discAmt = (item.quantity * item.unit_price * discPct) / 100
        if (Math.abs(discAmt - item.discount_amount) > 0.005) {
          updateItemDiscount(item.id, discAmt)
        }
      })
    } else if (discountType === 'cost') {
      items.forEach((item) => {
        const discAmt = item.quantity * Math.max(0, item.unit_price - item.cogs_per_unit)
        if (Math.abs(discAmt - item.discount_amount) > 0.005) {
          updateItemDiscount(item.id, discAmt)
        }
      })
    }
  }, [items, discountType, discountRules, getItemMarkup, updateItemDiscount])

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

  // Sync discountInput when checkout modal opens (so fixed/percentage shows its current value);
  // reset delivery fee confirmation so it must be re-confirmed on every checkout attempt
  useEffect(() => {
    if (isCheckoutOpen) {
      if (discountType === 'fixed' && discountAmount > 0) {
        setDiscountInput(discountAmount.toString())
      } else if (discountType === 'percentage' && discountPercentage > 0) {
        setDiscountInput(discountPercentage.toString())
      }
      setDeliveryFeeConfirmed(false)
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

    // Use walk-in customer as fallback if none selected
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

    if (deliveryType === 'delivery') {
      if (!deliveryAddress.trim()) {
        toast.error('Please enter delivery address')
        return
      }
      if (!deliveryPhone.trim()) {
        toast.error('Contact number is required for delivery orders')
        return
      }
      if (!deliveryFeeConfirmed) {
        toast.error('Please confirm the delivery fee (enter 0 if none).')
        return
      }
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
      // Store current values before reset
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
      const currentDeliveryCoords = deliveryCoords
      const currentDeliveryGeocodedAddress = deliveryGeocodedAddress

      const result = await createTransaction.mutateAsync({
        input: {
          branch_id: branchId,
          customer_id: checkoutCustomer.id,
          transaction_type: 'sale',
          delivery_type: deliveryType,
          delivery_address: deliveryAddress || null,
          delivery_phone: deliveryPhone.trim() || null,
          delivery_fee: deliveryFee || 0,
          delivery_latitude: deliveryCoords?.lat ?? null,
          delivery_longitude: deliveryCoords?.lng ?? null,
          delivery_distance_km: deliveryCoords?.distanceKm ?? null,
          delivery_geocoded_address: deliveryGeocodedAddress ?? null,
          other_fees: otherFees || 0,
          other_fees_notes: otherFeesNotes || null,
          discount_amount: getTotalDiscount(),
          discount_percentage: discountPercentage,
          notes: notes || null,
          manual_invoice_number: manualInvoiceNumber.trim() || null,
          transaction_date: createTimestampPH(saleDate),
          referrer_id: referrerId || null,
          commission_rate: referrerId && referrerCommissionRate ? Number(referrerCommissionRate) : null,
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

      setIsCheckoutOpen(false)

      // Mark linked online order as fulfilled
      if (pendingOnlineOrderId) {
        const supabase = getClient()
        await supabase
          .from('online_orders')
          .update({
            transaction_id: result.id,
            status: pendingOnlineOrderFulfillment === 'pickup' ? 'picked_up' : 'delivered',
          })
          .eq('id', pendingOnlineOrderId)
        setPendingOnlineOrderId(null)
        setPendingOnlineOrderFulfillment(null)
      }

      // Reset POS immediately so the next transaction can start
      resetAll()
      setDeliveryCoords(null)
      setDeliveryGeocodedAddress(null)
      setSaleDate(getTodayPH())
      setDiscountInput('')
      setCustomer(WALK_IN_CUSTOMER)
      setReferrerId(null)
      setReferrerCommissionRate('')
      setReferrerSearch('')

      // Build the internal sales summary (A4) from captured values
      const invoiceData: InvoiceData = {
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
            total: Math.round(item.quantity * item.unit_price * 100) / 100,
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

      // Build the delivery slip payload — printed on demand only, never
      // automatically. No pricing beyond the cash-to-collect figure the
      // printer derives itself; nothing here functions as a receipt.
      const receiptData: ReceiptData = {
        transaction_number: result.transaction_number,
        date: new Date(result.transaction_date || Date.now()).toLocaleDateString('en-PH'),
        time: new Date(result.transaction_date || Date.now()).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
        cashier: user?.fullName || user?.email || 'Staff',
        branch: currentBranch?.name || 'Main Branch',
        customer: {
          name: currentCustomer?.name || 'Walk-in Customer',
          phone: currentDeliveryPhone?.trim() || currentCustomer?.phone || null,
        },
        delivery_type: currentDeliveryType,
        delivery_address: currentDeliveryAddress || null,
        delivery_geocoded_address: currentDeliveryGeocodedAddress || null,
        delivery_distance_km: currentDeliveryCoords?.distanceKm ?? null,
        delivery_road_based: currentDeliveryCoords?.roadBased ?? null,
        items: currentItems.map((item) => ({
          name: item.product_name,
          quantity: item.quantity,
          uom: item.uom_name,
          unit_price: item.unit_price,
          discount: item.discount_amount,
          total: Math.round(item.quantity * item.unit_price * 100) / 100,
        })),
        subtotal: currentSubtotal,
        discount: currentTotalDiscount,
        delivery_fee: currentDeliveryFee > 0 ? currentDeliveryFee : undefined,
        other_fees: currentOtherFees > 0 ? currentOtherFees : undefined,
        other_fees_notes: currentOtherFeesNotes || null,
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

      setPendingInvoice(invoiceData)
      setPendingReceipt(receiptData)
      toast.success('Transaction completed successfully!', {
        action: { label: 'Print', onClick: () => setIsPrintOpen(true) },
      })
    } catch (error: any) {
      toast.error(error.message || 'Failed to complete transaction')
    }
  }

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
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Today's Sales</div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 -mr-1.5 -mt-1"
                onClick={() => setShowTodaysSales((v) => !v)}
                title={showTodaysSales ? 'Hide sales' : 'Show sales'}
              >
                {showTodaysSales ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <div className="text-xl sm:text-2xl font-bold">
              {showTodaysSales ? formatCurrency(todaysSummary?.netSales || 0) : '₱ ••••••'}
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
                      <CommandGroup>
                        <CommandItem
                          onSelect={() => setIsNewCustomerOpen(true)}
                          className="cursor-pointer"
                        >
                          <UserPlus className="mr-2 h-4 w-4" />
                          <span>Add New Customer</span>
                        </CommandItem>
                      </CommandGroup>
                      <Separator />
                      <CommandGroup heading={customerSearch ? 'Search Results' : 'All Customers'}>
                        {/* Walk-in Customer - Always on top */}
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
                        {/* Other customers */}
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
                            {/* Product Image */}
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
                            {/* Product Info */}
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
                      <div className="font-medium text-sm line-clamp-2">
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
                          {formatCurrency(Math.round(item.quantity * item.unit_price * 100) / 100 - item.discount_amount)}
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
            <ClipboardCheck className="mr-2 h-5 w-5" />
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
                      <div className="font-medium text-sm line-clamp-2">
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
                          {formatCurrency(Math.round(item.quantity * item.unit_price * 100) / 100 - item.discount_amount)}
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
            <ClipboardCheck className="mr-2 h-5 w-5" />
            Checkout
          </Button>
        </CardFooter>
      </Card>

      {/* Checkout Dialog */}
      <Dialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen}>
        <DialogContent className={`${mapExpanded ? 'sm:max-w-[95vw] max-h-[98vh]' : 'sm:max-w-4xl max-h-[95vh]'} overflow-y-auto p-6`}>
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

            {/* Referrer Section */}
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Referrer <span className="text-sm font-normal text-muted-foreground">(optional)</span></h3>
              <div className="flex gap-2">
                <Popover open={isReferrerOpen} onOpenChange={setIsReferrerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="flex-1 justify-start">
                      <Handshake className="mr-2 h-4 w-4 text-muted-foreground" />
                      {selectedReferrer ? (
                        <span>{selectedReferrer.name}{selectedReferrer.profession ? ` · ${selectedReferrer.profession}` : ''}</span>
                      ) : (
                        <span className="text-muted-foreground">Select referrer...</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search by name or profession..."
                        value={referrerSearch}
                        onValueChange={setReferrerSearch}
                      />
                      <CommandList>
                        <CommandEmpty>No referrers found.</CommandEmpty>
                        <CommandGroup>
                          {referrerId && (
                            <CommandItem
                              onSelect={() => {
                                setReferrerId(null)
                                setReferrerCommissionRate('')
                                setIsReferrerOpen(false)
                              }}
                              className="cursor-pointer text-muted-foreground"
                            >
                              <X className="mr-2 h-4 w-4" />
                              Clear referrer
                            </CommandItem>
                          )}
                          {filteredReferrers.map((r) => (
                            <CommandItem
                              key={r.id}
                              onSelect={() => {
                                setReferrerId(r.id)
                                setReferrerCommissionRate(r.default_commission_rate.toString())
                                setIsReferrerOpen(false)
                                setReferrerSearch('')
                              }}
                              className="cursor-pointer"
                            >
                              <Handshake className="mr-2 h-4 w-4" />
                              <div className="flex-1">
                                <div className="font-medium">{r.name}</div>
                                {r.profession && (
                                  <div className="text-xs text-muted-foreground">{r.profession}</div>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground ml-2">{r.default_commission_rate}%</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {referrerId && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Input
                      type="number"
                      value={referrerCommissionRate}
                      onChange={(e) => setReferrerCommissionRate(e.target.value)}
                      className="w-20 text-right"
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder="0"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                )}
              </div>
              {referrerId && (
                <p className="text-xs text-muted-foreground">
                  Commission of <span className="font-semibold">{referrerCommissionRate}%</span> will be recorded for <span className="font-semibold">{selectedReferrer?.name}</span> on this sale.
                </p>
              )}
            </div>

            {/* Discount Section */}
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Discount</h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {(['none', 'fixed', 'percentage', 'standard', 'cost'] as const).map((type) => (
                  <Button
                    key={type}
                    variant={discountType === type ? 'default' : 'outline'}
                    className="h-7 text-[10px] gap-1 px-2"
                    onClick={() => handleDiscountTypeChange(type)}
                  >
                    {type === 'none' && <><Ban className="h-3 w-3 shrink-0" />None</>}
                    {type === 'fixed' && <><Tag className="h-3 w-3 shrink-0" />Fixed</>}
                    {type === 'percentage' && <><Percent className="h-3 w-3 shrink-0" />Percent</>}
                    {type === 'standard' && <><BadgeCheck className="h-3 w-3 shrink-0" />Standard</>}
                    {type === 'cost' && <><Package className="h-3 w-3 shrink-0" />At Cost</>}
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
                <Input
                  placeholder="Delivery Address"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="h-12"
                />
                {/* Quick-pick phone chips */}
                {quickPickNumbers.length > 0 && customer?.id !== WALK_IN_CUSTOMER.id && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Quick pick:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {quickPickNumbers.map(({ number, label }) => (
                        <button
                          key={number}
                          type="button"
                          onClick={() => setDeliveryPhone(number)}
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                            deliveryPhone === number
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border bg-background hover:bg-accent hover:text-accent-foreground'
                          }`}
                        >
                          {label === 'Primary' && <span>★</span>}
                          {number}
                          {label === 'Primary' && <span className="text-[10px] opacity-70">Primary</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <Input
                  placeholder="Contact Phone *"
                  value={deliveryPhone}
                  onChange={(e) => setDeliveryPhone(e.target.value)}
                  className="h-12"
                />
                {/* Delivery map — pin customer location for auto-calculated fee */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Pin Delivery Location</Label>
                  <DeliveryMapPicker
                    key={mapExpanded ? 'expanded' : 'collapsed'}
                    initialCoords={deliveryCoords}
                    initialExpanded={mapExpanded}
                    onSuggest={(result: MapSuggestResult | null) => {
                      if (result) {
                        setDeliveryFee(result.fee)
                        setDeliveryFeeConfirmed(true)
                        setDeliveryCoords({ lat: result.lat, lng: result.lng, distanceKm: result.distanceKm, roadBased: result.roadBased })
                        setDeliveryGeocodedAddress(result.geocodedAddress)
                      } else {
                        setDeliveryCoords(null)
                        setDeliveryGeocodedAddress(null)
                      }
                    }}
                    onExpandChange={setMapExpanded}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Delivery Fee <span className="text-red-500">*</span> <span className="text-xs font-normal text-muted-foreground">(auto-filled · editable)</span></Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={deliveryFee === 0 && !deliveryFeeConfirmed ? '' : deliveryFee}
                      onChange={(e) => {
                        setDeliveryFee(Number(e.target.value) || 0)
                        setDeliveryFeeConfirmed(false)
                      }}
                      className={`h-12 flex-1 ${!deliveryFeeConfirmed ? 'border-amber-400' : 'border-green-400'}`}
                    />
                    <Button
                      type="button"
                      variant={deliveryFeeConfirmed ? 'default' : 'outline'}
                      className={`h-12 px-4 shrink-0 ${deliveryFeeConfirmed ? 'bg-green-600 hover:bg-green-700 text-white' : 'border-amber-400 text-amber-700'}`}
                      onClick={() => setDeliveryFeeConfirmed(true)}
                    >
                      {deliveryFeeConfirmed ? '✓ Confirmed' : 'Confirm'}
                    </Button>
                  </div>
                  {!deliveryFeeConfirmed && (
                    <p className="text-xs text-amber-600">Please confirm the delivery fee before proceeding</p>
                  )}
                </div>
              </div>
            )}

            {/* Other Fees */}
            <div className="space-y-3 bg-amber-50 rounded-lg p-4 border border-amber-200">
              <h3 className="font-semibold">Additional Fees (optional)</h3>
              <div className="space-y-2">
                <Label>Fee Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={otherFees || ''}
                  onChange={(e) => setOtherFees(Number(e.target.value) || 0)}
                  className="h-12"
                />
              </div>
              <div className="space-y-2">
                <Label>Fee Description</Label>
                <Input
                  placeholder="e.g., Service charge, Processing fee"
                  value={otherFeesNotes}
                  onChange={(e) => setOtherFeesNotes(e.target.value)}
                  className="h-12"
                  disabled={!otherFees || otherFees === 0}
                />
              </div>
            </div>

            {/* Sale Date */}
            <div className="space-y-2">
              <Label className="text-base font-semibold">Sale Date</Label>
              <Input
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                max={isMounted ? getTodayPH() : ''}
                className="h-11"
              />
              {isMounted && saleDate && !isTodayPH(saleDate) && (
                <p className="text-xs text-amber-600 font-medium">
                  Backdated sale — recording as {new Date(saleDate + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              )}
            </div>

            {/* Notes Section */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">Order Notes (optional)</Label>
              <Textarea
                placeholder="Add any special instructions..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="text-base"
              />
            </div>

            {/* Manual Invoice/OR # — cross-reference to the paper booklet, optional */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">Invoice/OR # (optional)</Label>
              <Input
                placeholder="e.g. 00231 — from paper booklet"
                value={manualInvoiceNumber}
                onChange={(e) => setManualInvoiceNumber(e.target.value)}
                className="h-11 text-base"
              />
            </div>

            {/* Payment Section */}
            <div className="space-y-4 border-t pt-6">
              <h3 className="font-semibold text-lg">Payment</h3>

              {/* Payment Method Selection - Grid for better touch targets */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {paymentMethods.map((method) => (
                  <Button
                    key={method.value}
                    variant={selectedPaymentMethod === method.value ? 'default' : 'outline'}
                    className="h-12 text-base"
                    onClick={() => { setSelectedPaymentMethod(method.value); setPaymentReference('') }}
                  >
                    <method.icon className="mr-2 h-5 w-5" />
                    <span className="hidden sm:inline">{method.label}</span>
                    <span className="sm:hidden text-xs">{method.label}</span>
                  </Button>
                ))}
              </div>

              {/* Payment Amount Input */}
              <div className="space-y-3">
                <Label className="text-base">Payment Amount</Label>
                <div className="flex gap-3">
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    min="0"
                    step="0.01"
                    className="flex-1 h-12 text-lg"
                  />
                  <Button onClick={handleAddPayment} className="h-12 px-6 text-base">
                    Add Payment
                  </Button>
                </div>

                {(selectedPaymentMethod === 'gcash' ||
                  selectedPaymentMethod === 'maya' ||
                  selectedPaymentMethod === 'bank_transfer') && (
                  <div className="space-y-2">
                    <Label className="text-sm">Reference Number</Label>
                    <Input
                      placeholder="e.g., Transaction or Reference ID"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      className="h-10"
                    />
                  </div>
                )}

                {/* Credit Limit Info */}
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

              {/* Quick Amount Buttons */}
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="secondary"
                  className="h-10 text-sm"
                  onClick={() => setPaymentAmount(balance.toFixed(2))}
                >
                  Exact
                </Button>
                <Button
                  variant="secondary"
                  className="h-10 text-sm"
                  onClick={() => setPaymentAmount((Math.ceil(total / 100) * 100).toString())}
                >
                  Round Up
                </Button>
                <Button
                  variant="secondary"
                  className="h-10 text-sm"
                  onClick={() => setPaymentAmount((Math.ceil(total / 500) * 500).toString())}
                >
                  +500
                </Button>
              </div>

              {/* Payments List */}
              {payments.length > 0 && (
                <div className="border rounded-lg p-4 space-y-3 bg-amber-50">
                  <h4 className="font-semibold text-base">Payment Methods Added</h4>
                  {payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between p-3 bg-white rounded-lg border"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-base py-1 px-2">{payment.payment_method.toUpperCase()}</Badge>
                          {payment.reference_number && (
                            <span className="text-sm text-muted-foreground">
                              #{payment.reference_number}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-lg">{formatCurrency(payment.amount)}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-red-100"
                          onClick={() => removePayment(payment.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Payment Summary */}
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

          <p className="text-sm text-muted-foreground text-center mt-4">
            Don&apos;t forget to issue the paper Invoice/OR.
          </p>

          <DialogFooter className="gap-3 mt-2 pt-6 border-t">
            <Button variant="outline" onClick={() => setIsCheckoutOpen(false)} className="h-12 text-base flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleCheckout}
              disabled={createTransaction.isPending || balance > 0.01}
              className="h-12 text-base flex-1"
            >
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

      {/* Print dialog — opened on demand via the "Print" toast action, never automatically */}
      <PrintDialog
        open={isPrintOpen}
        onOpenChange={setIsPrintOpen}
        deliverySlipData={pendingReceipt}
        invoiceData={pendingInvoice}
        onComplete={() => { setPendingInvoice(null); setPendingReceipt(null) }}
      />

      {/* Unit Selector Dialog */}
      <Dialog open={isUnitSelectorOpen} onOpenChange={(open) => {
        setIsUnitSelectorOpen(open)
        if (!open) {
          setSelectedProduct(null)
          setSelectedUnitId('')
        }
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
                {/* Show product's primary selling unit first (if not already in selling units) */}
                {selectedProduct && !sellingUnits.some(su => su.uom_id === selectedProduct.selling_uom_id && su.is_active) && (
                  <Button
                    key="primary"
                    type="button"
                    variant={selectedUnitId === selectedProduct.selling_uom_id ? 'default' : 'outline'}
                    className="w-full justify-start h-auto py-3"
                    onClick={() => setSelectedUnitId(selectedProduct.selling_uom_id)}
                  >
                    <div className="flex flex-col items-start w-full">
                      <div className="flex items-center justify-between w-full">
                        <span className="font-medium">
                          {selectedProduct.selling_uom_name || selectedProduct.uom_name} ({selectedProduct.selling_uom_abbreviation || selectedProduct.uom_abbreviation})
                          <Badge variant="secondary" className="ml-2">Primary</Badge>
                        </span>
                        <span className="font-bold">
                          {formatCurrency(selectedProduct.unit_price)}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Product default selling unit
                      </div>
                    </div>
                  </Button>
                )}
                
                {/* Show additional selling units */}
                {sellingUnits
                  .filter(su => su.is_active)
                  .map((unit) => (
                    <Button
                      key={unit.id}
                      type="button"
                      variant={selectedUnitId === unit.uom_id ? 'default' : 'outline'}
                      className="w-full justify-start h-auto py-3"
                      onClick={() => setSelectedUnitId(unit.uom_id)}
                    >
                      <div className="flex flex-col items-start w-full">
                        <div className="flex items-center justify-between w-full">
                          <span className="font-medium">
                            {unit.uom?.name} ({unit.uom?.code})
                            {unit.is_primary && (
                              <Badge variant="secondary" className="ml-2">Primary</Badge>
                            )}
                          </span>
                          <span className="font-bold">
                            {formatCurrency(unit.selling_price)}
                          </span>
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
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsUnitSelectorOpen(false)
                setSelectedProduct(null)
                setSelectedUnitId('')
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleAddWithUnit}
              disabled={!selectedUnitId || isLoadingUnits}
            >
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

    </div>
  )
}
