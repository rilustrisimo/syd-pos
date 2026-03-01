import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import {
  useAuth,
  useCreateTransaction,
  useCustomers,
  useProductCategories,
  useUpsertCustomer,
  useWalkInCustomer,
} from '@syd/api'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '../../../store/auth'
import { usePosStore, CartItem } from '../../../store/pos'
import { usePrinterStore } from '../../../store/printer'
import { btPrinter } from '../../../lib/bt-printer'
import { useInventoryCache } from '../../../hooks/useInventoryCache'
import { SettingsModal } from '../../../components/SettingsModal'
import type { Customer, PaymentMethod, Product, ProductImage } from '@syd/api'
import type { ReceiptData } from '../../../lib/escpos-mobile'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
// Two-column grid fills the full screen width
const GRID_PADDING = 12
const GRID_GAP = 10
const CARD_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2

// ─────────────────────────────────────────────────────────────────────────────
// Image Gallery Modal
// ─────────────────────────────────────────────────────────────────────────────
interface ImageGalleryModalProps {
  product: Product | null
  onClose: () => void
}

function ImageGalleryModal({ product, onClose }: ImageGalleryModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  if (!product) return null

  const images: ProductImage[] = product.images
    ? [...product.images].sort((a, b) => a.sort_order - b.sort_order)
    : []

  if (images.length === 0) return null

  return (
    <Modal visible animationType="fade" statusBarTranslucent>
      <View style={styles.galleryContainer}>
        <SafeAreaView style={styles.galleryHeader}>
          <Text style={styles.galleryTitle} numberOfLines={1}>
            {product.name}
          </Text>
          <Text style={styles.galleryCounter}>
            {currentIndex + 1} / {images.length}
          </Text>
          <Pressable style={styles.galleryClose} onPress={onClose}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
        </SafeAreaView>

        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH)
            setCurrentIndex(idx)
          }}
        >
          {images.map((img) => (
            <View
              key={img.id}
              style={{ width: SCREEN_WIDTH, justifyContent: 'center', alignItems: 'center' }}
            >
              <Image
                source={{ uri: img.url }}
                style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH }}
                contentFit="contain"
                transition={200}
              />
              {img.alt_text ? (
                <Text style={styles.galleryAltText}>{img.alt_text}</Text>
              ) : null}
            </View>
          ))}
        </ScrollView>

        {images.length > 1 && (
          <View style={styles.dotsRow}>
            {images.map((_, i) => (
              <View key={i} style={[styles.dot, i === currentIndex && styles.dotActive]} />
            ))}
          </View>
        )}
      </View>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Product Card — full-width two-column grid card
// ─────────────────────────────────────────────────────────────────────────────
interface ProductCardProps {
  product: Product
  quantityInCart: number
  onAdd: (product: Product) => void
  onOpenGallery: (product: Product) => void
}

function ProductCard({ product, quantityInCart, onAdd, onOpenGallery }: ProductCardProps) {
  const images = product.images ?? []
  const primaryImage = images.find((i) => i.is_primary) ?? images[0]
  // available_stock is optional (only populated when inventory join is present)
  // Default to in-stock (1) if not provided; explicit 0 means truly OOS
  const isOutOfStock = product.available_stock !== undefined && product.available_stock <= 0

  return (
    <Pressable
      style={[styles.productCard, isOutOfStock && styles.productCardOOS]}
      onPress={() => !isOutOfStock && onAdd(product)}
      android_ripple={isOutOfStock ? undefined : { color: '#e0f2fe' }}
    >
      {/* Thumbnail */}
      <View style={styles.productThumb}>
        {primaryImage ? (
          <Image
            source={{ uri: primaryImage.url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={styles.productNoImage}>
            <Ionicons name="cube-outline" size={30} color="#cbd5e1" />
          </View>
        )}

        {/* Out of stock overlay */}
        {isOutOfStock && (
          <View style={styles.oosOverlay}>
            <Text style={styles.oosOverlayText}>Out of Stock</Text>
          </View>
        )}

        {/* Cart quantity badge */}
        {quantityInCart > 0 && !isOutOfStock && (
          <View style={styles.cartQtyBadge}>
            <Text style={styles.cartQtyBadgeText}>{quantityInCart}</Text>
          </View>
        )}

        {/* Photo badge */}
        {images.length > 0 && (
          <Pressable
            style={styles.photoBadge}
            onPress={(e) => {
              e.stopPropagation()
              onOpenGallery(product)
            }}
          >
            <Ionicons name="camera" size={11} color="#fff" />
            <Text style={styles.photoBadgeText}>{images.length}</Text>
          </Pressable>
        )}
      </View>

      {/* Info */}
      <View style={styles.productInfo}>
        <Text style={styles.productCode} numberOfLines={1}>
          {product.code}
        </Text>
        <Text style={styles.productName} numberOfLines={2}>
          {product.name}
        </Text>
        {product.available_stock !== undefined && (
          <Text style={[styles.productStock, product.available_stock <= 0 && styles.productStockOOS]}>
            {product.available_stock <= 0
              ? 'Out of stock'
              : `Stock: ${Number.isInteger(product.available_stock) ? product.available_stock : product.available_stock.toFixed(2)}`}
          </Text>
        )}
        <View style={styles.productFooter}>
          <Text style={styles.productPrice}>
            ₱
            {product.current_selling_price.toLocaleString('en-PH', {
              minimumFractionDigits: 2,
            })}
          </Text>
          <Pressable
            style={styles.addBtn}
            onPress={(e) => {
              e.stopPropagation()
              onAdd(product)
            }}
          >
            <Ionicons name="add" size={18} color="#fff" />
          </Pressable>
        </View>
      </View>
    </Pressable>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants & Types
// ─────────────────────────────────────────────────────────────────────────────
const PAYMENT_METHODS: { label: string; value: PaymentMethod }[] = [
  { label: 'Cash', value: 'cash' },
  { label: 'GCash', value: 'gcash' },
  { label: 'Maya', value: 'maya' },
  { label: 'Bank Transfer', value: 'bank_transfer' },
  { label: 'Credit', value: 'credit' },
]

type DiscountType = 'none' | 'fixed' | 'percentage' | 'standard' | 'at_cost'
const DISCOUNT_TYPES: { label: string; value: DiscountType }[] = [
  { label: 'None', value: 'none' },
  { label: 'Fixed ₱', value: 'fixed' },
  { label: '% Off', value: 'percentage' },
  { label: 'Standard', value: 'standard' },
  { label: 'At-Cost', value: 'at_cost' },
]

type PaymentEntry = { id: string; method: PaymentMethod; amount: string; reference: string }

// ─────────────────────────────────────────────────────────────────────────────
// Main Sales Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function SalesScreen() {
  const { data: authUser } = useAuth()
  const localBranchId = useAuthStore((s) => s.localBranchId)
  const effectiveBranchId = authUser?.branch_id ?? localBranchId

  // POS store
  const cart = usePosStore((s) => s.cart)
  const addItem = usePosStore((s) => s.addItem)
  const updateQuantity = usePosStore((s) => s.updateQuantity)
  const incrementItem = usePosStore((s) => s.incrementItem)
  const decrementItem = usePosStore((s) => s.decrementItem)
  const removeItem = usePosStore((s) => s.removeItem)
  const clearCart = usePosStore((s) => s.clearCart)

  // Local state
  const [customer, setCustomer] = useState<Customer | null>(null)

  // Data hooks
  const { data: customers = [], isLoading: customersLoading } = useCustomers()
  const { data: walkInCustomer } = useWalkInCustomer()

  // Default to walk-in customer on first load (use dedicated query or fall back to customers list)
  useEffect(() => {
    const effective =
      walkInCustomer ?? customers.find((c: Customer) => c.name === 'Walk-in Customer') ?? null
    if (effective && !customer) {
      setCustomer(effective)
    }
  }, [walkInCustomer, customers, customer])
  const { data: categories = [] } = useProductCategories()
  const { products, isLoading: productsLoading } = useInventoryCache()

  // Mutations
  const upsertCustomer = useUpsertCustomer()
  const createTransaction = useCreateTransaction()

  // UI state
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [productSearch, setProductSearch] = useState('')
  const [galleryProduct, setGalleryProduct] = useState<Product | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showCartModal, setShowCartModal] = useState(false)
  const [showCheckout, setShowCheckout] = useState(false)
  // Discount
  const [discountType, setDiscountType] = useState<DiscountType>('none')
  const [discountInput, setDiscountInput] = useState('')
  // Notes
  const [orderNotes, setOrderNotes] = useState('')
  // Multiple payments
  const [payments, setPayments] = useState<PaymentEntry[]>([
    { id: '1', method: 'cash', amount: '', reference: '' },
  ])

  // New customer form
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [newCustomerEmail, setNewCustomerEmail] = useState('')

  // ── Customer list (walk-in pinned to top) ─────────────────────────────────
  const filteredCustomers = useMemo(() => {
    const q = customerSearch.toLowerCase()
    // Use the dedicated walk-in query result, or fall back to the walk-in record
    // already present in the main customers list (avoids it disappearing during load)
    const effectiveWalkIn =
      walkInCustomer ?? customers.find((c: Customer) => c.name === 'Walk-in Customer') ?? null
    const regular = customers.filter(
      (c: Customer) =>
        c.name !== 'Walk-in Customer' &&
        (c.name.toLowerCase().includes(q) ||
          (c.phone ?? '').toLowerCase().includes(q) ||
          (c.email ?? '').toLowerCase().includes(q))
    )
    const walkIn =
      effectiveWalkIn && (q === '' || 'walk-in customer'.includes(q)) ? [effectiveWalkIn] : []
    return [...walkIn, ...regular]
  }, [customers, walkInCustomer, customerSearch])

  // ── Filtered products ─────────────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    let list = products as Product[]
    if (selectedCategoryId) {
      list = list.filter((p) => p.category_id === selectedCategoryId)
    }
    if (productSearch.trim()) {
      const q = productSearch.toLowerCase()
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
      )
    }
    return list
  }, [products, selectedCategoryId, productSearch])

  // ── Cart derived values ───────────────────────────────────────────────────
  const cartItemCount = cart.reduce((s: number, i: CartItem) => s + i.quantity, 0)
  const subtotal = useMemo(
    () => cart.reduce((s: number, i: CartItem) => s + i.price * i.quantity, 0),
    [cart]
  )
  const orderDiscount = useMemo(() => {
    const v = parseFloat(discountInput) || 0
    switch (discountType) {
      case 'fixed': return Math.min(v, subtotal)
      case 'percentage': return subtotal * Math.min(v, 100) / 100
      case 'at_cost':
        return cart.reduce((s: number, i: CartItem) =>
          s + Math.max(0, i.price - i.cogs_per_unit) * i.quantity, 0)
      case 'standard': {
        const markup = Math.max(0, v) / 100
        return cart.reduce((s: number, i: CartItem) => {
          const stdPrice = i.cogs_per_unit * (1 + markup)
          return s + Math.max(0, i.price - stdPrice) * i.quantity
        }, 0)
      }
      default: return 0
    }
  }, [discountType, discountInput, subtotal, cart])
  const total = Math.max(0, subtotal - orderDiscount)
  const totalPaid = useMemo(
    () => payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0),
    [payments]
  )
  const balanceDue = Math.max(0, total - totalPaid)
  const changeAmount = totalPaid > total ? totalPaid - total : 0

  // quick lookup for cart quantity per product
  const cartQtyMap = useMemo(() => {
    const map: Record<string, number> = {}
    cart.forEach((i: CartItem) => { map[i.productId] = i.quantity })
    return map
  }, [cart])

  // ── Checkout state ────────────────────────────────────────────────────────
  const [deliveryType, setDeliveryType] = useState<'pickup' | 'delivery'>('pickup')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [isPrinting, setIsPrinting] = useState(false)

  // Printer store (for paper width)
  const paperWidth = usePrinterStore((s) => s.paperWidth)

  // ── Payment helpers ───────────────────────────────────────────────────────
  function addPayment() {
    setPayments((prev) => [
      ...prev,
      { id: Date.now().toString(), method: 'cash', amount: '', reference: '' },
    ])
  }
  function removePayment(id: string) {
    setPayments((prev) => prev.filter((p) => p.id !== id))
  }
  function updatePayment(id: string, field: keyof PaymentEntry, value: string) {
    setPayments((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)))
  }
  function setFirstPaymentAmount(amount: string) {
    setPayments((prev) => {
      if (prev.length === 0) return prev
      return [{ ...prev[0], amount }, ...prev.slice(1)]
    })
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleSelectCustomer(c: Customer) {
    setCustomer(c)
    setShowCustomerModal(false)
    setShowNewCustomerForm(false)
    setCustomerSearch('')
  }

  async function handleCreateCustomer() {
    if (!newCustomerName.trim()) {
      Alert.alert('Name required', 'Please enter a customer name.')
      return
    }
    try {
      const created = await upsertCustomer.mutateAsync({
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim() || null,
        email: newCustomerEmail.trim() || null,
        customer_type: 'cash',
        credit_limit: 0,
        outstanding_balance: 0,
        is_active: true,
      })
      handleSelectCustomer(created)
      setNewCustomerName('')
      setNewCustomerPhone('')
      setNewCustomerEmail('')
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to create customer')
    }
  }

  function handleAddProduct(product: Product) {
    const existing = cart.find((c: CartItem) => c.productId === product.id)
    if (existing) {
      incrementItem(product.id)
    } else {
      addItem({
        productId: product.id,
        name: product.name,
        quantity: 1,
        price: product.current_selling_price,
        cogs_per_unit: product.latest_cogs ?? 0,
        discount: 0,
      })
    }
  }

  function handleCartBarPress() {
    if (cart.length === 0) return
    setShowCartModal(true)
  }

  function handleCheckoutPress() {
    if (!effectiveBranchId) {
      Alert.alert(
        'No Branch Selected',
        'You need to select a branch before completing a sale.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => setShowSettings(true) },
        ]
      )
      return
    }
    if (!customer) {
      Alert.alert('No Customer', 'Please select a customer.')
      return
    }
    if (cart.length === 0) {
      Alert.alert('Empty Cart', 'Please add at least one product.')
      return
    }
    setDiscountType('none')
    setDiscountInput('')
    setOrderNotes('')
    setPayments([{ id: '1', method: 'cash', amount: total.toFixed(2), reference: '' }])
    setDeliveryType('pickup')
    setDeliveryAddress('')
    setShowCartModal(false)
    setShowCheckout(true)
  }

  async function handleCompleteCheckout() {
    if (!effectiveBranchId || !customer || !authUser) return

    // Delivery requires both a phone number and address
    if (deliveryType === 'delivery') {
      if (!customer.phone) {
        Alert.alert(
          'Phone Required',
          'A customer phone number is required for delivery orders.\n\nPlease select a customer with a phone number, or add one via the customer modal.',
        )
        return
      }
      if (!deliveryAddress.trim()) {
        Alert.alert('Address Required', 'Please enter a delivery address.')
        return
      }
    }

    // Validate payments
    if (payments.some((p) => !(parseFloat(p.amount) > 0))) {
      Alert.alert('Invalid Payment', 'All payment entries must have a valid amount greater than zero.')
      return
    }
    // For non-credit customers, require full payment
    if (customer.customer_type !== 'credit' && balanceDue > 0.01) {
      Alert.alert('Insufficient Payment', `Balance due: ₱${balanceDue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`)
      return
    }

    try {
      // Distribute order-level discounts proportionally across lines
      const txLines = cart.map((item: CartItem) => {
        const product = (products as Product[]).find((p) => p.id === item.productId)
        let discountAmountPerLine = 0
        if (discountType === 'at_cost') {
          discountAmountPerLine = Math.max(0, item.price - item.cogs_per_unit) * item.quantity
        } else if (discountType === 'standard') {
          const markup = (parseFloat(discountInput) || 0) / 100
          const stdPrice = item.cogs_per_unit * (1 + markup)
          discountAmountPerLine = Math.max(0, item.price - stdPrice) * item.quantity
        } else if ((discountType === 'fixed' || discountType === 'percentage') && orderDiscount > 0) {
          const itemRaw = item.price * item.quantity
          const proportion = subtotal > 0 ? itemRaw / subtotal : 0
          discountAmountPerLine = orderDiscount * proportion
        }
        return {
          product_id: item.productId,
          quantity: item.quantity,
          uom_id: product?.selling_uom_id ?? '',
          unit_price: item.price,
          cogs_per_unit: item.cogs_per_unit,
          discount_amount: discountAmountPerLine,
        }
      })

      const paymentStatus =
        totalPaid >= total ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid'

      const tx = await createTransaction.mutateAsync({
        input: {
          branch_id: effectiveBranchId,
          customer_id: customer.id,
          transaction_type: 'sale',
          delivery_type: deliveryType,
          delivery_address: deliveryType === 'delivery' ? deliveryAddress.trim() : null,
          notes: orderNotes.trim() || null,
          subtotal,
          discount_amount: orderDiscount,
          total_amount: total,
          amount_paid: totalPaid,
          payment_status: paymentStatus,
        },
        lines: txLines,
        payments: payments.map((p) => ({
          payment_method: p.method,
          amount: parseFloat(p.amount) || 0,
          reference_number: p.reference.trim() || null,
        })),
        userId: authUser.id,
      })

      // ── Auto-print if printer is connected ──────────────────────────────
      if (btPrinter.isConnected()) {
        setIsPrinting(true)
        const now = new Date()
        const receiptData: ReceiptData = {
          transaction_number: tx?.transaction_number ?? '—',
          date: now.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }),
          time: now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
          cashier: authUser.email ?? 'Cashier',
          branch: authUser.branch_id ?? localBranchId ?? 'Main Branch',
          customer: { name: customer.name, phone: customer.phone ?? null },
          delivery_type: deliveryType,
          delivery_address: deliveryType === 'delivery' ? deliveryAddress.trim() : null,
          items: cart.map((item: CartItem) => ({
            name: item.name,
            quantity: item.quantity,
            unit_price: item.price,
            uom: 'pc',
            discount: 0,
            total: item.price * item.quantity,
          })),
          subtotal,
          discount: orderDiscount,
          tax: 0,
          total,
          payments: payments.map((p) => ({
            method: p.method,
            amount: parseFloat(p.amount) || 0,
            reference: p.reference.trim() || null,
          })),
          amount_paid: totalPaid,
          change: changeAmount,
          notes: orderNotes.trim() || null,
        }

        try {
          await btPrinter.printReceipt(receiptData, paperWidth)
          if (deliveryType === 'delivery') {
            await btPrinter.printDeliverySlip(receiptData, paperWidth)
          }
        } catch (printErr: unknown) {
          // Sale was saved — just warn about print failure
          Alert.alert(
            'Print Warning',
            'Sale saved but printing failed: ' +
              (printErr instanceof Error ? printErr.message : 'Unknown error'),
          )
        } finally {
          setIsPrinting(false)
        }
      }

      setShowCheckout(false)
      clearCart()
      setCustomer(null)

      const printNote = btPrinter.isConnected()
        ? (deliveryType === 'delivery' ? ' Receipt & delivery slip printed.' : ' Receipt printed.')
        : ''
      Alert.alert('Sale Complete', `Transaction saved successfully.${printNote}`)
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to complete sale')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      {/* ── Top header bar ──────────────────────────────────────────────────── */}
      <View style={styles.header}>
        {/* Customer selector */}
        <Pressable style={styles.headerCustomer} onPress={() => setShowCustomerModal(true)}>
          <Ionicons name="person-circle-outline" size={20} color="#3b82f6" />
          <Text style={styles.headerCustomerText} numberOfLines={1}>
            {customer?.name ?? 'Select customer'}
          </Text>
          <Ionicons name="chevron-down" size={14} color="#94a3b8" />
        </Pressable>

        {/* Branch warning dot + settings */}
        <View style={styles.headerRight}>
          {!effectiveBranchId && (
            <Pressable
              style={styles.branchWarningDot}
              onPress={() => setShowSettings(true)}
            >
              <Ionicons name="warning" size={14} color="#92400e" />
            </Pressable>
          )}
          <Pressable style={styles.settingsBtn} onPress={() => setShowSettings(true)}>
            <Ionicons name="settings-outline" size={22} color="#64748b" />
          </Pressable>
        </View>
      </View>

      {/* Branch warning banner */}
      {!effectiveBranchId && (
        <Pressable style={styles.branchBanner} onPress={() => setShowSettings(true)}>
          <Ionicons name="warning-outline" size={14} color="#92400e" />
          <Text style={styles.branchBannerText}>
            No branch selected — tap Settings to configure
          </Text>
        </Pressable>
      )}

      {/* ── Product search ──────────────────────────────────────────────────── */}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color="#94a3b8" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search products…"
          placeholderTextColor="#94a3b8"
          value={productSearch}
          onChangeText={setProductSearch}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>

      {/* ── Category pills — "All" pinned, rest scrollable ────────────────── */}
      <View style={styles.categoryRow}>
        {/* Pinned "All" pill — always visible */}
        <Pressable
          style={[styles.pill, styles.pillAll, selectedCategoryId === null && styles.pillActive]}
          onPress={() => setSelectedCategoryId(null)}
        >
          <Text style={[styles.pillText, selectedCategoryId === null && styles.pillTextActive]}>
            All
          </Text>
        </Pressable>

        {/* Thin separator */}
        <View style={styles.pillDivider} />

        {/* Scrollable category pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsContent}
          style={{ flex: 1 }}
        >
          {categories.map((cat) => (
            <Pressable
              key={cat.id}
              style={[styles.pill, selectedCategoryId === cat.id && styles.pillActive]}
              onPress={() => setSelectedCategoryId(cat.id)}
            >
              <Text
                style={[
                  styles.pillText,
                  selectedCategoryId === cat.id && styles.pillTextActive,
                ]}
              >
                {cat.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* ── Product grid (full-width, 2 columns) ────────────────────────────── */}
      {productsLoading ? (
        <View style={styles.loadingBox}>
          <Text style={styles.loadingText}>Loading products…</Text>
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={[
            styles.gridContent,
            // extra bottom padding so sticky cart bar doesn't overlap last row
            cart.length > 0 && { paddingBottom: 100 },
          ]}
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              quantityInCart={cartQtyMap[item.id] ?? 0}
              onAdd={handleAddProduct}
              onOpenGallery={setGalleryProduct}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="cube-outline" size={48} color="#e2e8f0" />
              <Text style={styles.emptyText}>No products found</Text>
            </View>
          }
        />
      )}

      {/* ── Sticky cart bar at bottom ────────────────────────────────────────── */}
      {cart.length > 0 && (
        <Pressable style={styles.cartBar} onPress={handleCartBarPress}>
          <View style={styles.cartBarLeft}>
            <View style={styles.cartBarBadge}>
              <Text style={styles.cartBarBadgeText}>{cartItemCount}</Text>
            </View>
            <Text style={styles.cartBarLabel}>View Cart</Text>
          </View>
          <Text style={styles.cartBarTotal}>
            ₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </Text>
          <Ionicons name="chevron-up" size={18} color="#fff" />
        </Pressable>
      )}

      {/* ── Customer Modal ──────────────────────────────────────────────────── */}
      <Modal
        visible={showCustomerModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setShowCustomerModal(false)
          setShowNewCustomerForm(false)
          setCustomerSearch('')
        }}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {showNewCustomerForm ? 'New Customer' : 'Select Customer'}
            </Text>
            <Pressable
              style={styles.modalClose}
              onPress={() => {
                setShowCustomerModal(false)
                setShowNewCustomerForm(false)
                setCustomerSearch('')
              }}
            >
              <Ionicons name="close" size={22} color="#64748b" />
            </Pressable>
          </View>

          {showNewCustomerForm ? (
            <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Name *</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="Full name"
                value={newCustomerName}
                onChangeText={setNewCustomerName}
                autoFocus
              />
              <Text style={styles.fieldLabel}>Phone</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="09xxxxxxxxx"
                value={newCustomerPhone}
                onChangeText={setNewCustomerPhone}
                keyboardType="phone-pad"
              />
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="email@example.com"
                value={newCustomerEmail}
                onChangeText={setNewCustomerEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <View style={styles.formActions}>
                <Pressable
                  style={styles.formCancelBtn}
                  onPress={() => setShowNewCustomerForm(false)}
                >
                  <Text style={styles.formCancelText}>Back</Text>
                </Pressable>
                <Pressable
                  style={[styles.formSaveBtn, upsertCustomer.isPending && { opacity: 0.6 }]}
                  onPress={handleCreateCustomer}
                  disabled={upsertCustomer.isPending}
                >
                  <Text style={styles.formSaveText}>
                    {upsertCustomer.isPending ? 'Saving…' : 'Save Customer'}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          ) : (
            <>
              <View style={styles.customerSearchRow}>
                <Ionicons name="search" size={16} color="#94a3b8" />
                <TextInput
                  style={styles.customerSearchInput}
                  placeholder="Search by name, phone, email…"
                  placeholderTextColor="#94a3b8"
                  value={customerSearch}
                  onChangeText={setCustomerSearch}
                  clearButtonMode="while-editing"
                  autoFocus
                />
              </View>

              <FlatList
                data={filteredCustomers}
                keyExtractor={(c) => c.id}
                keyboardShouldPersistTaps="handled"
                ListHeaderComponent={
                  <Pressable
                    style={styles.addCustomerBtn}
                    onPress={() => setShowNewCustomerForm(true)}
                  >
                    <Ionicons name="person-add-outline" size={18} color="#3b82f6" />
                    <Text style={styles.addCustomerText}>Add New Customer</Text>
                  </Pressable>
                }
                renderItem={({ item: c }) => (
                  <Pressable
                    style={[
                      styles.customerItem,
                      customer?.id === c.id && styles.customerItemSelected,
                    ]}
                    onPress={() => handleSelectCustomer(c)}
                  >
                    <View style={styles.customerAvatar}>
                      <Text style={styles.customerAvatarText}>
                        {c.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.customerItemInfo}>
                      <Text style={styles.customerItemName}>{c.name}</Text>
                      {c.phone && (
                        <Text style={styles.customerItemSub}>{c.phone}</Text>
                      )}
                    </View>
                    {customer?.id === c.id && (
                      <Ionicons name="checkmark-circle" size={20} color="#3b82f6" />
                    )}
                  </Pressable>
                )}
                ListEmptyComponent={
                  customersLoading ? (
                    <Text style={styles.loadingText}>Loading…</Text>
                  ) : (
                    <Text style={styles.emptyText}>No customers found</Text>
                  )
                }
              />
            </>
          )}
        </SafeAreaView>
      </Modal>

      {/* ── Cart Modal ──────────────────────────────────────────────────────── */}
      <Modal
        visible={showCartModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCartModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Cart</Text>
            <Pressable style={styles.modalClose} onPress={() => setShowCartModal(false)}>
              <Ionicons name="close" size={22} color="#64748b" />
            </Pressable>
          </View>

          {/* Customer row inside cart */}
          <Pressable
            style={styles.cartModalCustomerRow}
            onPress={() => {
              setShowCartModal(false)
              setTimeout(() => setShowCustomerModal(true), 300)
            }}
          >
            <Ionicons name="person-circle-outline" size={20} color="#3b82f6" />
            <Text style={styles.cartModalCustomerText} numberOfLines={1}>
              {customer?.name ?? 'Select customer…'}
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
          </Pressable>

          {/* Cart items */}
          <ScrollView style={styles.cartScrollArea} showsVerticalScrollIndicator={false}>
            {cart.map((item: CartItem, idx: number) => (
              <View key={`${item.productId}-${idx}`} style={styles.cartItem}>
                <View style={styles.cartItemInfo}>
                  <Text style={styles.cartItemName} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={styles.cartItemPrice}>
                    ₱{item.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
                <View style={styles.qtyControls}>
                  <Pressable
                    style={styles.qtyBtn}
                    onPress={() => decrementItem(item.productId)}
                  >
                    <Ionicons name="remove" size={16} color="#64748b" />
                  </Pressable>
                  <TextInput
                    key={`qty-${item.productId}-${item.quantity}`}
                    style={styles.qtyText}
                    defaultValue={
                      Number.isInteger(item.quantity)
                        ? String(item.quantity)
                        : item.quantity.toFixed(2)
                    }
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                    onEndEditing={(e) => {
                      const v = parseFloat(e.nativeEvent.text)
                      if (v > 0) updateQuantity(item.productId, v)
                      else removeItem(item.productId)
                    }}
                  />
                  <Pressable
                    style={styles.qtyBtn}
                    onPress={() => incrementItem(item.productId)}
                  >
                    <Ionicons name="add" size={16} color="#64748b" />
                  </Pressable>
                </View>
                <View style={styles.cartItemRight}>
                  <Text style={styles.cartItemTotal}>
                    ₱
                    {((item.price - item.discount) * item.quantity).toLocaleString(
                      'en-PH',
                      { minimumFractionDigits: 2 }
                    )}
                  </Text>
                  <Pressable onPress={() => removeItem(item.productId)}>
                    <Ionicons name="trash-outline" size={16} color="#ef4444" />
                  </Pressable>
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Totals */}
          <View style={styles.cartTotals}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>
                ₱{subtotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </Text>
            </View>
            <View style={[styles.totalRow, styles.totalRowBig]}>
              <Text style={styles.totalLabelBig}>Total</Text>
              <Text style={styles.totalValueBig}>
                ₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.checkoutBtn}
            onPress={handleCheckoutPress}
            activeOpacity={0.85}
          >
            <Text style={styles.checkoutBtnText}>Proceed to Checkout</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>

      {/* ── Checkout Modal ──────────────────────────────────────────────────── */}
      <Modal
        visible={showCheckout}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCheckout(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Checkout</Text>
            <Pressable
              style={styles.modalClose}
              onPress={() => setShowCheckout(false)}
            >
              <Ionicons name="close" size={22} color="#64748b" />
            </Pressable>
          </View>

          <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
            {/* ── Order Summary ─────────────────────────────────────────────── */}
            <View style={styles.checkoutSection}>
              <Text style={styles.sectionLabel}>Order Summary</Text>
              {cart.map((item: CartItem) => (
                <View key={item.productId} style={styles.summaryLine}>
                  <Text style={styles.summaryLineName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.summaryLineQty}>{item.quantity}×</Text>
                  <Text style={styles.summaryLineTotal}>
                    ₱{(item.price * item.quantity).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
              ))}
              <View style={styles.summaryDivider} />
              <View style={styles.summaryLine}>
                <Text style={[styles.summaryLineName, { color: '#64748b' }]}>Subtotal</Text>
                <Text style={[styles.summaryLineTotal, { color: '#64748b' }]}>
                  ₱{subtotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </Text>
              </View>
              {orderDiscount > 0 && (
                <View style={styles.summaryLine}>
                  <Text style={[styles.summaryLineName, { color: '#16a34a' }]}>Discount</Text>
                  <Text style={[styles.summaryLineTotal, { color: '#16a34a' }]}>
                    −₱{orderDiscount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
              )}
              <View style={styles.summaryLine}>
                <Text style={[styles.summaryLineName, { fontWeight: '700' }]}>Total</Text>
                <Text style={[styles.summaryLineTotal, { fontWeight: '800', color: '#3b82f6', fontSize: 16 }]}>
                  ₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </Text>
              </View>
            </View>

            {/* ── Discount ──────────────────────────────────────────────────── */}
            <View style={styles.checkoutSection}>
              <Text style={styles.sectionLabel}>Discount</Text>
              <View style={styles.discountTypeRow}>
                {DISCOUNT_TYPES.map((dt) => (
                  <Pressable
                    key={dt.value}
                    style={[styles.discountTypeBtn, discountType === dt.value && styles.discountTypeBtnActive]}
                    onPress={() => { setDiscountType(dt.value); setDiscountInput('') }}
                  >
                    <Text style={[styles.discountTypeBtnText, discountType === dt.value && styles.discountTypeBtnTextActive]}>
                      {dt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {(discountType === 'fixed' || discountType === 'percentage' || discountType === 'standard') && (
                <View style={styles.discountInputRow}>
                  <Text style={styles.discountInputPrefix}>
                    {discountType === 'fixed' ? '₱' : '%'}
                  </Text>
                  <TextInput
                    style={styles.discountInputField}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    value={discountInput}
                    onChangeText={setDiscountInput}
                  />
                </View>
              )}
              {orderDiscount > 0 && (
                <View style={styles.discountSummaryBox}>
                  <View style={styles.discountSummaryRow}>
                    <Text style={styles.discountSummaryLabel}>Discount</Text>
                    <Text style={styles.discountSummaryValue}>
                      −₱{orderDiscount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </Text>
                  </View>
                  <View style={styles.discountSummaryRow}>
                    <Text style={styles.discountSummaryLabel}>New Total</Text>
                    <Text style={[styles.discountSummaryValue, { color: '#0f172a' }]}>
                      ₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* ── Order Notes ───────────────────────────────────────────────── */}
            <View style={styles.checkoutSection}>
              <Text style={styles.sectionLabel}>Order Notes (optional)</Text>
              <TextInput
                style={styles.notesInput}
                placeholder="Special instructions, remarks…"
                value={orderNotes}
                onChangeText={setOrderNotes}
                multiline
                numberOfLines={3}
              />
            </View>

            {/* ── Order Type ────────────────────────────────────────────────── */}
            <View style={styles.checkoutSection}>
              <Text style={styles.sectionLabel}>Order Type</Text>
              <View style={styles.deliveryToggle}>
                {(['pickup', 'delivery'] as const).map((type) => (
                  <Pressable
                    key={type}
                    style={[styles.deliveryToggleBtn, deliveryType === type && styles.deliveryToggleBtnActive]}
                    onPress={() => setDeliveryType(type)}
                  >
                    <Ionicons
                      name={type === 'pickup' ? 'storefront-outline' : 'bicycle-outline'}
                      size={16}
                      color={deliveryType === type ? '#fff' : '#64748b'}
                    />
                    <Text style={[styles.deliveryToggleBtnText, deliveryType === type && styles.deliveryToggleBtnTextActive]}>
                      {type === 'pickup' ? 'Pickup' : 'Delivery'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {deliveryType === 'delivery' && (
                <View style={{ gap: 6 }}>
                  <Text style={styles.fieldLabel}>Delivery Address *</Text>
                  <TextInput
                    style={[styles.fieldInput, { minHeight: 72, textAlignVertical: 'top' }]}
                    placeholder="Enter full delivery address…"
                    value={deliveryAddress}
                    onChangeText={setDeliveryAddress}
                    multiline
                    numberOfLines={3}
                  />
                </View>
              )}
            </View>

            {/* ── Credit Limit Info ─────────────────────────────────────────── */}
            {customer?.customer_type === 'credit' && (
              <View style={styles.creditInfoBox}>
                <View style={styles.creditInfoRow}>
                  <Text style={styles.creditInfoLabel}>Credit Limit</Text>
                  <Text style={styles.creditInfoValue}>
                    ₱{(customer.credit_limit ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
                <View style={styles.creditInfoRow}>
                  <Text style={styles.creditInfoLabel}>Outstanding Balance</Text>
                  <Text style={styles.creditInfoValue}>
                    ₱{(customer.outstanding_balance ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
                {(() => {
                  const avail = (customer.credit_limit ?? 0) - (customer.outstanding_balance ?? 0) - total
                  return (
                    <View style={styles.creditInfoRow}>
                      <Text style={styles.creditInfoLabel}>Available After Sale</Text>
                      <Text style={[styles.creditInfoValue, avail < 0 && styles.creditInfoExceeded]}>
                        ₱{avail.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </Text>
                    </View>
                  )
                })()}
              </View>
            )}

            {/* ── Payments ──────────────────────────────────────────────────── */}
            <View style={styles.checkoutSection}>
              <Text style={styles.sectionLabel}>Payment</Text>
              {payments.map((p, idx) => (
                <View key={p.id} style={styles.paymentEntry}>
                  {/* Method */}
                  <View style={styles.paymentGrid}>
                    {PAYMENT_METHODS.map((pm) => (
                      <Pressable
                        key={pm.value}
                        style={[styles.paymentBtn, p.method === pm.value && styles.paymentBtnActive]}
                        onPress={() => updatePayment(p.id, 'method', pm.value)}
                      >
                        <Text style={[styles.paymentBtnText, p.method === pm.value && styles.paymentBtnTextActive]}>
                          {pm.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {/* Amount + remove */}
                  <View style={styles.paymentEntryRow}>
                    <TextInput
                      style={styles.paymentEntryAmount}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      value={p.amount}
                      onChangeText={(v) => updatePayment(p.id, 'amount', v)}
                    />
                    {payments.length > 1 && (
                      <Pressable style={styles.removePaymentBtn} onPress={() => removePayment(p.id)}>
                        <Ionicons name="close" size={16} color="#ef4444" />
                      </Pressable>
                    )}
                  </View>
                  {/* Quick pay buttons for first payment */}
                  {idx === 0 && (
                    <View style={styles.quickPayRow}>
                      <Pressable style={styles.quickPayBtn} onPress={() => setFirstPaymentAmount(total.toFixed(2))}>
                        <Text style={styles.quickPayBtnText}>Exact</Text>
                      </Pressable>
                      <Pressable style={styles.quickPayBtn} onPress={() => setFirstPaymentAmount((Math.ceil(total / 100) * 100).toFixed(2))}>
                        <Text style={styles.quickPayBtnText}>↑₱{Math.ceil(total / 100) * 100}</Text>
                      </Pressable>
                      <Pressable style={styles.quickPayBtn} onPress={() => setFirstPaymentAmount((total + 500).toFixed(2))}>
                        <Text style={styles.quickPayBtnText}>+₱500</Text>
                      </Pressable>
                    </View>
                  )}
                  {/* Reference for non-cash */}
                  {p.method !== 'cash' && (
                    <TextInput
                      style={styles.paymentEntryRef}
                      placeholder="Reference number (optional)"
                      value={p.reference}
                      onChangeText={(v) => updatePayment(p.id, 'reference', v)}
                    />
                  )}
                </View>
              ))}

              <Pressable style={styles.addPaymentBtn} onPress={addPayment}>
                <Ionicons name="add" size={18} color="#3b82f6" />
                <Text style={styles.addPaymentBtnText}>Add Another Payment Method</Text>
              </Pressable>

              {/* Summary */}
              <View style={styles.paymentSummaryBox}>
                <View style={styles.paymentSummaryRow}>
                  <Text style={styles.paymentSummaryLabel}>Order Total</Text>
                  <Text style={styles.paymentSummaryValue}>
                    ₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
                <View style={styles.paymentSummaryRow}>
                  <Text style={styles.paymentSummaryLabel}>Total Paid</Text>
                  <Text style={styles.paymentSummaryValue}>
                    ₱{totalPaid.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
              </View>
              {balanceDue > 0.01 ? (
                <View style={styles.balanceDueBox}>
                  <Text style={styles.balanceDueLabel}>Balance Due</Text>
                  <Text style={styles.balanceDueValue}>
                    ₱{balanceDue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
              ) : changeAmount > 0.01 ? (
                <View style={styles.changeBox}>
                  <Text style={styles.changeLabel}>Change</Text>
                  <Text style={styles.changeValue}>
                    ₱{changeAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
              ) : null}

              {isPrinting && (
                <Text style={{ fontSize: 12, color: '#3b82f6', textAlign: 'center', marginTop: 8 }}>
                  Printing receipt…
                </Text>
              )}
            </View>

            {/* ── Complete Sale ─────────────────────────────────────────────── */}
            <Pressable
              style={[styles.confirmBtn, createTransaction.isPending && { opacity: 0.6 }]}
              onPress={handleCompleteCheckout}
              disabled={createTransaction.isPending}
            >
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.confirmBtnText}>
                {createTransaction.isPending ? 'Processing…' : 'Complete Sale'}
              </Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Image Gallery ──────────────────────────────────────────────────── */}
      <ImageGalleryModal
        product={galleryProduct}
        onClose={() => setGalleryProduct(null)}
      />

      {/* ── Settings Modal ─────────────────────────────────────────────────── */}
      <SettingsModal visible={showSettings} onClose={() => setShowSettings(false)} />
    </SafeAreaView>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    gap: 10,
  },
  headerCustomer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerCustomerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  branchWarningDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Branch banner
  branchBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  branchBannerText: {
    flex: 1,
    fontSize: 12,
    color: '#92400e',
    fontWeight: '500',
  },

  // Search
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 0,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#0f172a',
  },

  // Category pills
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 2,
    height: 44,
  },
  pillAll: {
    marginLeft: 12,
    flexShrink: 0,
  },
  pillDivider: {
    width: 1,
    height: 22,
    backgroundColor: '#e2e8f0',
    marginHorizontal: 6,
  },
  pillsContent: {
    paddingRight: 12,
    gap: 8,
    alignItems: 'center',
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  pillActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  pillText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
  },
  pillTextActive: {
    color: '#fff',
  },

  // Product grid
  gridRow: {
    paddingHorizontal: GRID_PADDING,
    gap: GRID_GAP,
  },
  gridContent: {
    paddingTop: 10,
    paddingBottom: 24,
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 60,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
  },
  emptyBox: {
    alignItems: 'center',
    padding: 60,
    gap: 12,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
  },

  // Product card
  productCard: {
    width: CARD_WIDTH,
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: GRID_GAP,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  productThumb: {
    width: '100%',
    height: CARD_WIDTH * 0.75,
    backgroundColor: '#f8fafc',
    overflow: 'hidden',
  },
  productNoImage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartQtyBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  cartQtyBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  photoBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 2,
    gap: 3,
  },
  photoBadgeText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
  productInfo: {
    padding: 10,
    gap: 3,
  },
  productCode: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  productName: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '600',
    lineHeight: 17,
  },
  productStock: {
    fontSize: 11,
    color: '#16a34a',
    fontWeight: '500',
  },
  productStockOOS: {
    color: '#ef4444',
  },
  productFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  productPrice: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '700',
    flex: 1,
  },
  addBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Sticky cart bar
  cartBar: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    right: 16,
    backgroundColor: '#3b82f6',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  cartBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  cartBarBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  cartBarBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
  },
  cartBarLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  cartBarTotal: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
  },

  // Shared modal
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalClose: {
    padding: 4,
  },

  // Customer search
  customerSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    margin: 12,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  customerSearchInput: {
    flex: 1,
    fontSize: 15,
    color: '#0f172a',
  },
  addCustomerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  addCustomerText: {
    fontSize: 15,
    color: '#3b82f6',
    fontWeight: '600',
  },
  customerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  customerItemSelected: {
    backgroundColor: '#eff6ff',
  },
  customerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#64748b',
  },
  customerItemInfo: {
    flex: 1,
  },
  customerItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  customerItemSub: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },

  // New customer form
  formScroll: {
    flex: 1,
    padding: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
    marginTop: 16,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#f9fafb',
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 32,
    marginBottom: 40,
  },
  formCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
  },
  formCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  formSaveBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
  },
  formSaveText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },

  // Cart modal
  cartModalCustomerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    gap: 10,
  },
  cartModalCustomerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  cartScrollArea: {
    flex: 1,
    paddingHorizontal: 16,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 10,
  },
  cartItemInfo: {
    flex: 1,
    gap: 2,
  },
  cartItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  cartItemPrice: {
    fontSize: 12,
    color: '#64748b',
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  qtyText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    minWidth: 36,
    textAlign: 'center',
    padding: 0,
  },
  cartItemRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  cartItemTotal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  cartTotals: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    gap: 8,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalRowBig: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  totalValue: {
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '600',
  },
  totalLabelBig: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
  },
  totalValueBig: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  checkoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 15,
    borderRadius: 14,
    gap: 8,
  },
  checkoutBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // Delivery toggle
  deliveryToggle: {
    flexDirection: 'row',
    gap: 10,
  },
  deliveryToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  deliveryToggleBtnActive: {
    borderColor: '#3b82f6',
    backgroundColor: '#3b82f6',
  },
  deliveryToggleBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  deliveryToggleBtnTextActive: {
    color: '#fff',
  },

  // Checkout modal
  checkoutSection: {
    marginBottom: 24,
    gap: 10,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  summaryLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryLineName: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
  },
  summaryLineQty: {
    fontSize: 13,
    color: '#64748b',
    minWidth: 24,
    textAlign: 'right',
  },
  summaryLineTotal: {
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '600',
    minWidth: 80,
    textAlign: 'right',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 4,
  },
  paymentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  paymentBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  paymentBtnActive: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  paymentBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  paymentBtnTextActive: {
    color: '#3b82f6',
  },
  amountInput: {
    borderWidth: 1.5,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
    backgroundColor: '#f9fafb',
  },
  changeText: {
    fontSize: 15,
    color: '#16a34a',
    fontWeight: '700',
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16a34a',
    paddingVertical: 16,
    borderRadius: 14,
    gap: 10,
    marginTop: 8,
    marginBottom: 40,
  },
  confirmBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },

  // Image gallery
  galleryContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  galleryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  galleryTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginRight: 8,
  },
  galleryCounter: {
    fontSize: 14,
    color: '#94a3b8',
    marginRight: 8,
  },
  galleryClose: {
    padding: 8,
  },
  galleryAltText: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 24,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#475569',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 18,
  },

  // Out of stock
  productCardOOS: {
    opacity: 0.6,
  },
  oosOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  oosOverlayText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    backgroundColor: '#ef4444',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },

  // Discount section
  discountTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  discountTypeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  discountTypeBtnActive: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  discountTypeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  discountTypeBtnTextActive: {
    color: '#3b82f6',
  },
  discountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#d1d5db',
    borderRadius: 10,
    backgroundColor: '#f9fafb',
    overflow: 'hidden',
  },
  discountInputPrefix: {
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '700',
    color: '#64748b',
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
    paddingVertical: 12,
  },
  discountInputField: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  discountSummaryBox: {
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  discountSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  discountSummaryLabel: {
    fontSize: 13,
    color: '#374151',
  },
  discountSummaryValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#16a34a',
  },

  // Notes
  notesInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#f9fafb',
    minHeight: 72,
    textAlignVertical: 'top',
  },

  // Multiple payments
  paymentEntry: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    gap: 10,
    marginBottom: 8,
  },
  paymentEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  paymentEntryAmount: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    backgroundColor: '#fff',
  },
  paymentEntryRef: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#fff',
  },
  removePaymentBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPaymentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#3b82f6',
    borderStyle: 'dashed',
    marginTop: 4,
  },
  addPaymentBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3b82f6',
  },
  quickPayRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  quickPayBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  quickPayBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  paymentSummaryBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 12,
    gap: 6,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  paymentSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentSummaryLabel: {
    fontSize: 13,
    color: '#64748b',
  },
  paymentSummaryValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  balanceDueBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  balanceDueLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#dc2626',
  },
  balanceDueValue: {
    fontSize: 17,
    fontWeight: '800',
    color: '#dc2626',
  },
  changeBox: {
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  changeLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#16a34a',
  },
  changeValue: {
    fontSize: 17,
    fontWeight: '800',
    color: '#16a34a',
  },

  // Credit info
  creditInfoBox: {
    backgroundColor: '#fffbeb',
    borderRadius: 10,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  creditInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  creditInfoLabel: {
    fontSize: 12,
    color: '#92400e',
  },
  creditInfoValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400e',
  },
  creditInfoExceeded: {
    color: '#dc2626',
  },
})
