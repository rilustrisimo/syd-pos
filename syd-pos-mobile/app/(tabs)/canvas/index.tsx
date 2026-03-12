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
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  useAuth,
  useCanvases,
  useCreateCanvas,
  useDeleteCanvas,
  useCustomers,
  useWalkInCustomer,
  useProductCategories,
  useUpsertCustomer,
} from '@syd/api'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '../../../store/auth'
import { useCanvasStore, CanvasItem } from '../../../store/canvas'
import { usePosStore } from '../../../store/pos'
import { usePrinterStore } from '../../../store/printer'
import { btPrinter } from '../../../lib/bt-printer'
import { useInventoryCache } from '../../../hooks/useInventoryCache'
import type { Canvas, Product } from '@syd/api'
import type { CanvasData } from '../../../lib/escpos-mobile'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const GRID_PADDING = 12
const GRID_GAP = 10
const CARD_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2

function fmt(n: number) {
  return new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

// ─────────────────────────────────────────────────────────────────────────────
// Product Card
// ─────────────────────────────────────────────────────────────────────────────
function ProductCard({
  product,
  qtyInCart,
  onAdd,
}: {
  product: Product
  qtyInCart: number
  onAdd: (p: Product) => void
}) {
  const isOOS = product.available_stock !== undefined && product.available_stock <= 0
  return (
    <Pressable
      style={[styles.productCard, isOOS && styles.productCardOOS]}
      onPress={() => !isOOS && onAdd(product)}
      android_ripple={isOOS ? undefined : { color: '#e0f2fe' }}
    >
      <View style={styles.productCardInner}>
        {qtyInCart > 0 && (
          <View style={styles.qtyBadge}>
            <Text style={styles.qtyBadgeText}>{qtyInCart}</Text>
          </View>
        )}
        <Ionicons name="cube-outline" size={28} color="#cbd5e1" style={{ alignSelf: 'center' }} />
        <Text style={styles.productCode} numberOfLines={1}>{product.code}</Text>
        <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
        <Text style={styles.productPrice}>
          ₱{product.current_selling_price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
        </Text>
        {isOOS && <Text style={styles.oosText}>Out of stock</Text>}
      </View>
    </Pressable>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Canvas Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function CanvasScreen() {
  const { data: authUser } = useAuth()
  const localBranchId = useAuthStore((s) => s.localBranchId)
  const effectiveBranchId = authUser?.branch_id ?? localBranchId
  const paperWidth = usePrinterStore((s) => s.paperWidth)

  // Canvas store
  const cart               = useCanvasStore((s) => s.cart)
  const title              = useCanvasStore((s) => s.title)
  const customerName       = useCanvasStore((s) => s.customerName)
  const customerId         = useCanvasStore((s) => s.customerId)
  const deliveryFee        = useCanvasStore((s) => s.deliveryFee)
  const otherFees          = useCanvasStore((s) => s.otherFees)
  const otherFeesNotes     = useCanvasStore((s) => s.otherFeesNotes)
  const discountAmount     = useCanvasStore((s) => s.discountAmount)
  const discountPercentage = useCanvasStore((s) => s.discountPercentage)
  const discountType       = useCanvasStore((s) => s.discountType)
  const notes              = useCanvasStore((s) => s.notes)

  const addItem            = useCanvasStore((s) => s.addItem)
  const incrementItem      = useCanvasStore((s) => s.incrementItem)
  const decrementItem      = useCanvasStore((s) => s.decrementItem)
  const removeItem         = useCanvasStore((s) => s.removeItem)
  const clearCart          = useCanvasStore((s) => s.clearCart)
  const setTitle           = useCanvasStore((s) => s.setTitle)
  const setCustomerName    = useCanvasStore((s) => s.setCustomerName)
  const setCustomerId      = useCanvasStore((s) => s.setCustomerId)
  const setDeliveryFee     = useCanvasStore((s) => s.setDeliveryFee)
  const setOtherFees       = useCanvasStore((s) => s.setOtherFees)
  const setOtherFeesNotes  = useCanvasStore((s) => s.setOtherFeesNotes)
  const setDiscountAmount  = useCanvasStore((s) => s.setDiscountAmount)
  const setDiscountPercentage = useCanvasStore((s) => s.setDiscountPercentage)
  const setDiscountType    = useCanvasStore((s) => s.setDiscountType)
  const setNotes           = useCanvasStore((s) => s.setNotes)
  const resetAll           = useCanvasStore((s) => s.resetAll)

  // POS store (for Convert to Sale)
  const posAddItem  = usePosStore((s) => s.addItem)
  const posClearCart = usePosStore((s) => s.clearCart)

  // Data
  const { products, isLoading: productsLoading } = useInventoryCache()
  const { data: categories = [] } = useProductCategories()
  const { data: allCustomers = [] } = useCustomers()
  const { data: walkInCustomer } = useWalkInCustomer()
  const { data: canvasesData, refetch: refetchCanvases } = useCanvases(1, 20)
  const createCanvas         = useCreateCanvas()
  const deleteCanvasMutation = useDeleteCanvas()
  const upsertCustomer       = useUpsertCustomer()

  // UI state
  const [productSearch, setProductSearch]         = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [showCartModal, setShowCartModal]         = useState(false)
  const [showSaveModal, setShowSaveModal]         = useState(false)
  const [showListModal, setShowListModal]         = useState(false)
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [discountInput, setDiscountInput]         = useState('')
  const [isPrinting, setIsPrinting]               = useState(false)

  // Customer picker state
  const [customerSearch, setCustomerSearch]   = useState('')
  const [showCreateForm, setShowCreateForm]   = useState(false)
  const [newCustName, setNewCustName]         = useState('')
  const [newCustPhone, setNewCustPhone]       = useState('')
  const [isCreatingCust, setIsCreatingCust]   = useState(false)

  // ── Derived values ────────────────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    let list = (products as Product[]) || []
    if (selectedCategoryId) list = list.filter((p) => p.category_id === selectedCategoryId)
    if (productSearch.trim()) {
      const q = productSearch.toLowerCase()
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
    }
    return list
  }, [products, selectedCategoryId, productSearch])

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase()
    if (!q) return allCustomers
    return allCustomers.filter(
      (c: any) =>
        c.name?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q)
    )
  }, [allCustomers, customerSearch])

  const subtotal = useMemo(
    () => cart.reduce((s, i) => s + i.price * i.quantity - i.discount * i.quantity, 0),
    [cart]
  )
  const orderDiscount = useMemo(() => {
    const v = parseFloat(discountInput) || 0
    switch (discountType) {
      case 'fixed':      return Math.min(v, subtotal)
      case 'percentage': return subtotal * Math.min(v, 100) / 100
      case 'cost':       return cart.reduce((s, i) => s + Math.max(0, i.price - i.cogs_per_unit) * i.quantity, 0)
      default:           return 0
    }
  }, [discountType, discountInput, subtotal, cart])

  const grandTotal = Math.max(0, subtotal - orderDiscount + deliveryFee + otherFees)

  const cartQtyMap = useMemo(() => {
    const m: Record<string, number> = {}
    cart.forEach((i) => { m[i.productId] = (m[i.productId] || 0) + i.quantity })
    return m
  }, [cart])

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0)

  // Display label for selected customer
  const selectedCustomerLabel = customerId
    ? (customerName || 'Customer')
    : 'Walk-in Customer'

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleAddProduct(product: Product) {
    const uomName = (product as any).selling_uom_abbreviation || (product as any).uom_abbreviation || 'pc'
    const uomId   = (product as any).selling_uom_id || (product as any).base_uom_id || ''
    addItem({
      productId:     product.id,
      name:          product.name,
      quantity:      1,
      price:         product.current_selling_price,
      cogs_per_unit: (product as any).latest_cogs ?? product.current_selling_price,
      discount:      0,
      uom_id:        uomId,
      uom_name:      uomName,
    })
  }

  function handleSelectCustomer(id: string | null, name: string) {
    setCustomerId(id)
    setCustomerName(name)
    setShowCustomerModal(false)
    setCustomerSearch('')
    setShowCreateForm(false)
  }

  async function handleCreateCustomer() {
    if (!newCustName.trim()) {
      Alert.alert('Required', 'Please enter a customer name.')
      return
    }
    setIsCreatingCust(true)
    try {
      const created = await upsertCustomer.mutateAsync({
        name:          newCustName.trim(),
        phone:         newCustPhone.trim() || undefined,
        customer_type: 'cash',
        is_active:     true,
        credit_limit:       0,
        outstanding_balance: 0,
      } as any)
      handleSelectCustomer(created.id, created.name)
      setNewCustName('')
      setNewCustPhone('')
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create customer')
    } finally {
      setIsCreatingCust(false)
    }
  }

  async function handleSaveCanvas() {
    if (cart.length === 0) { Alert.alert('Empty', 'Add at least one product first.'); return }
    if (!authUser?.id) { Alert.alert('Error', 'Not authenticated'); return }
    if (!effectiveBranchId) { Alert.alert('Error', 'No branch selected'); return }

    try {
      const saved = await createCanvas.mutateAsync({
        input: {
          branch_id:           effectiveBranchId,
          customer_id:         customerId || walkInCustomer?.id || null,
          title:               title || null,
          notes:               notes || null,
          subtotal,
          discount_amount:     orderDiscount,
          discount_percentage: discountType === 'percentage' ? (parseFloat(discountInput) || 0) : 0,
          delivery_fee:        deliveryFee,
          other_fees:          otherFees,
          other_fees_notes:    otherFeesNotes || null,
          total_amount:        grandTotal,
          canvas_date:         new Date().toISOString(),
        },
        lines: cart.map((item) => ({
          product_id:      item.productId,
          quantity:        item.quantity,
          uom_id:          item.uom_id,
          unit_price:      item.price,
          cogs_per_unit:   item.cogs_per_unit,
          discount_amount: item.discount * item.quantity,
        })),
        userId: authUser.id,
      })

      if (btPrinter.isConnected()) {
        await handlePrintCanvas(saved)
      }

      Alert.alert('Saved', `Canvas ${saved.canvas_number} saved!`)
      setShowSaveModal(false)
      resetAll()
      setDiscountInput('')
      await refetchCanvases()
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save canvas')
    }
  }

  async function handlePrintCanvas(canvas: Canvas) {
    if (!btPrinter.isConnected()) {
      Alert.alert('Printer Not Connected', 'Connect a printer in Settings first.')
      return
    }
    setIsPrinting(true)
    try {
      const canvasData: CanvasData = {
        canvas_number: canvas.canvas_number,
        date:          fmtDate(canvas.canvas_date),
        cashier:       authUser?.full_name || 'Staff',
        branch:        'SYD Main Branch',
        customer:      (canvas as any).customer?.name || customerName || 'Walk-in Customer',
        title:         canvas.title || undefined,
        items: (canvas.lines || []).map((line: any) => ({
          name:       line.product?.name || line.product_id,
          quantity:   line.quantity,
          unit_price: line.unit_price,
          uom:        line.uom?.code || line.uom?.name || 'pc',
          discount:   line.discount_amount,
          total:      line.line_total,
        })),
        subtotal:         canvas.subtotal,
        discount:         canvas.discount_amount,
        delivery_fee:     canvas.delivery_fee || 0,
        other_fees:       canvas.other_fees || 0,
        other_fees_notes: canvas.other_fees_notes,
        total:            canvas.total_amount,
        notes:            canvas.notes,
      }
      await btPrinter.printCanvas(canvasData, paperWidth)
    } catch (err: any) {
      Alert.alert('Print Error', err.message)
    } finally {
      setIsPrinting(false)
    }
  }

  async function handleDeleteCanvas(id: string) {
    Alert.alert('Delete Canvas', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCanvasMutation.mutateAsync(id)
            await refetchCanvases()
          } catch (err: any) {
            Alert.alert('Error', err.message)
          }
        },
      },
    ])
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Canvas</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => setShowListModal(true)}>
            <Ionicons name="list-outline" size={22} color="#3b82f6" />
            {(canvasesData?.total ?? 0) > 0 && (
              <View style={styles.headerBtnBadge}>
                <Text style={styles.headerBtnBadgeText}>{Math.min(canvasesData?.total ?? 0, 99)}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={() => setShowCartModal(true)}>
            <Ionicons name="clipboard-outline" size={22} color="#3b82f6" />
            {cartCount > 0 && (
              <View style={styles.headerBtnBadge}>
                <Text style={styles.headerBtnBadgeText}>{cartCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={18} color="#9ca3af" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search products..."
          placeholderTextColor="#9ca3af"
          value={productSearch}
          onChangeText={setProductSearch}
          returnKeyType="search"
        />
        {productSearch ? (
          <TouchableOpacity onPress={() => setProductSearch('')}>
            <Ionicons name="close-circle" size={18} color="#9ca3af" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Category pills — fixed height so pills never get clipped */}
      <View style={styles.categoryRowWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRowContent}
        >
          <TouchableOpacity
            style={[styles.categoryPill, !selectedCategoryId && styles.categoryPillActive]}
            onPress={() => setSelectedCategoryId(null)}
          >
            <Text style={[styles.categoryPillText, !selectedCategoryId && styles.categoryPillTextActive]}>All</Text>
          </TouchableOpacity>
          {categories.map((cat: any) => (
            <TouchableOpacity
              key={cat.id}
              style={[styles.categoryPill, selectedCategoryId === cat.id && styles.categoryPillActive]}
              onPress={() => setSelectedCategoryId(cat.id === selectedCategoryId ? null : cat.id)}
            >
              <Text style={[styles.categoryPillText, selectedCategoryId === cat.id && styles.categoryPillTextActive]}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Product grid */}
      <FlatList
        data={filteredProducts}
        keyExtractor={(p) => p.id}
        numColumns={2}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.gridRow}
        renderItem={({ item }) => (
          <ProductCard
            product={item}
            qtyInCart={cartQtyMap[item.id] || 0}
            onAdd={handleAddProduct}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="cube-outline" size={48} color="#cbd5e1" />
            <Text style={styles.emptyText}>{productsLoading ? 'Loading...' : 'No products found'}</Text>
          </View>
        }
      />

      {/* ── Cart Modal ──────────────────────────────────────────────────────── */}
      <Modal visible={showCartModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Canvas Cart</Text>
            <TouchableOpacity onPress={() => setShowCartModal(false)}>
              <Ionicons name="close" size={24} color="#1e293b" />
            </TouchableOpacity>
          </View>

          {cart.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="clipboard-outline" size={48} color="#cbd5e1" />
              <Text style={styles.emptyText}>Canvas is empty</Text>
            </View>
          ) : (
            <ScrollView style={styles.cartList}>
              {cart.map((item) => (
                <View key={item.productId + item.uom_id} style={styles.cartItem}>
                  <View style={styles.cartItemInfo}>
                    <Text style={styles.cartItemName} numberOfLines={2}>{item.name}</Text>
                    <Text style={styles.cartItemPrice}>₱{fmt(item.price)} / {item.uom_name}</Text>
                  </View>
                  <View style={styles.cartItemControls}>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => decrementItem(item.productId)}>
                      <Ionicons name="remove" size={16} color="#3b82f6" />
                    </TouchableOpacity>
                    <Text style={styles.qtyText}>{item.quantity}</Text>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => incrementItem(item.productId)}>
                      <Ionicons name="add" size={16} color="#3b82f6" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.removeBtn} onPress={() => removeItem(item.productId)}>
                      <Ionicons name="trash-outline" size={16} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.cartItemTotal}>₱{fmt(item.price * item.quantity - item.discount * item.quantity)}</Text>
                </View>
              ))}

              {/* Discount */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionLabel}>Discount</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.discountPills}>
                    {(['none', 'fixed', 'percentage', 'cost'] as const).map((dt) => (
                      <TouchableOpacity
                        key={dt}
                        style={[styles.discountPill, discountType === dt && styles.discountPillActive]}
                        onPress={() => { setDiscountType(dt); setDiscountInput('') }}
                      >
                        <Text style={[styles.discountPillText, discountType === dt && styles.discountPillTextActive]}>
                          {dt === 'none' ? 'None' : dt === 'fixed' ? 'Fixed ₱' : dt === 'percentage' ? '% Off' : 'At Cost'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
                {(discountType === 'fixed' || discountType === 'percentage') && (
                  <TextInput
                    style={styles.discountInput}
                    keyboardType="numeric"
                    placeholder={discountType === 'fixed' ? 'Amount ₱' : 'Percentage %'}
                    value={discountInput}
                    onChangeText={setDiscountInput}
                  />
                )}
              </View>

              {/* Fees */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionLabel}>Fees</Text>
                <View style={styles.feeRow}>
                  <Text style={styles.feeLabel}>Delivery Fee</Text>
                  <TextInput
                    style={styles.feeInput}
                    keyboardType="numeric"
                    placeholder="0"
                    value={deliveryFee > 0 ? String(deliveryFee) : ''}
                    onChangeText={(v) => setDeliveryFee(parseFloat(v) || 0)}
                  />
                </View>
                <View style={styles.feeRow}>
                  <Text style={styles.feeLabel}>Other Fees</Text>
                  <TextInput
                    style={styles.feeInput}
                    keyboardType="numeric"
                    placeholder="0"
                    value={otherFees > 0 ? String(otherFees) : ''}
                    onChangeText={(v) => setOtherFees(parseFloat(v) || 0)}
                  />
                </View>
                {otherFees > 0 && (
                  <TextInput
                    style={[styles.feeInput, { width: '100%', marginTop: 6 }]}
                    placeholder="Other fees description..."
                    value={otherFeesNotes}
                    onChangeText={setOtherFeesNotes}
                  />
                )}
              </View>

              {/* Totals */}
              <View style={styles.totalsCard}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Subtotal</Text>
                  <Text style={styles.totalValue}>₱{fmt(subtotal)}</Text>
                </View>
                {orderDiscount > 0 && (
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, { color: '#16a34a' }]}>Discount</Text>
                    <Text style={[styles.totalValue, { color: '#16a34a' }]}>-₱{fmt(orderDiscount)}</Text>
                  </View>
                )}
                {deliveryFee > 0 && (
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Delivery Fee</Text>
                    <Text style={styles.totalValue}>₱{fmt(deliveryFee)}</Text>
                  </View>
                )}
                {otherFees > 0 && (
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Other Fees</Text>
                    <Text style={styles.totalValue}>₱{fmt(otherFees)}</Text>
                  </View>
                )}
                <View style={[styles.totalRow, styles.grandTotalRow]}>
                  <Text style={styles.grandTotalLabel}>TOTAL</Text>
                  <Text style={styles.grandTotalValue}>₱{fmt(grandTotal)}</Text>
                </View>
              </View>
            </ScrollView>
          )}

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[styles.footerBtn, styles.footerBtnSecondary]}
              onPress={() => { clearCart(); setDiscountInput('') }}
              disabled={cart.length === 0}
            >
              <Ionicons name="trash-outline" size={16} color="#64748b" />
              <Text style={styles.footerBtnSecondaryText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.footerBtn, styles.footerBtnPrimary, cart.length === 0 && styles.footerBtnDisabled]}
              onPress={() => { setShowCartModal(false); setShowSaveModal(true) }}
              disabled={cart.length === 0}
            >
              <Ionicons name="save-outline" size={16} color="#fff" />
              <Text style={styles.footerBtnPrimaryText}>Save Canvas</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ── Save Canvas Modal ───────────────────────────────────────────────── */}
      <Modal visible={showSaveModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Save Canvas</Text>
            <TouchableOpacity onPress={() => setShowSaveModal(false)}>
              <Ionicons name="close" size={24} color="#1e293b" />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1, padding: 16 }}>
            {/* Title */}
            <Text style={styles.fieldLabel}>Title (optional)</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="e.g. Juan – roofing materials"
              value={title}
              onChangeText={setTitle}
            />

            {/* Customer picker */}
            <Text style={styles.fieldLabel}>Customer</Text>
            <TouchableOpacity
              style={styles.customerPickerBtn}
              onPress={() => setShowCustomerModal(true)}
            >
              <View style={styles.customerPickerLeft}>
                <Ionicons
                  name={customerId ? 'person' : 'person-outline'}
                  size={16}
                  color={customerId ? '#3b82f6' : '#94a3b8'}
                />
                <Text style={[styles.customerPickerText, customerId && styles.customerPickerTextSelected]}>
                  {selectedCustomerLabel}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
            </TouchableOpacity>

            {/* Notes */}
            <Text style={styles.fieldLabel}>Notes (optional)</Text>
            <TextInput
              style={[styles.fieldInput, { height: 72, textAlignVertical: 'top' }]}
              placeholder="Any notes for this quotation..."
              value={notes}
              onChangeText={setNotes}
              multiline
            />

            {/* Summary */}
            <View style={styles.summaryCard}>
              <View style={styles.totalRow}>
                <Text style={styles.summaryLabel}>Items</Text>
                <Text style={styles.summaryValue}>{cart.length}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.summaryLabel}>Subtotal</Text>
                <Text style={styles.summaryValue}>₱{fmt(subtotal)}</Text>
              </View>
              {orderDiscount > 0 && (
                <View style={styles.totalRow}>
                  <Text style={[styles.summaryLabel, { color: '#16a34a' }]}>Discount</Text>
                  <Text style={[styles.summaryValue, { color: '#16a34a' }]}>-₱{fmt(orderDiscount)}</Text>
                </View>
              )}
              {deliveryFee > 0 && (
                <View style={styles.totalRow}>
                  <Text style={styles.summaryLabel}>Delivery Fee</Text>
                  <Text style={styles.summaryValue}>₱{fmt(deliveryFee)}</Text>
                </View>
              )}
              {otherFees > 0 && (
                <View style={styles.totalRow}>
                  <Text style={styles.summaryLabel}>Other Fees</Text>
                  <Text style={styles.summaryValue}>₱{fmt(otherFees)}</Text>
                </View>
              )}
              <View style={[styles.totalRow, styles.grandTotalRow]}>
                <Text style={styles.grandTotalLabel}>TOTAL</Text>
                <Text style={styles.grandTotalValue}>₱{fmt(grandTotal)}</Text>
              </View>
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[styles.footerBtn, styles.footerBtnSecondary]}
              onPress={() => setShowSaveModal(false)}
            >
              <Text style={styles.footerBtnSecondaryText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.footerBtn, styles.footerBtnPrimary, createCanvas.isPending && styles.footerBtnDisabled]}
              onPress={handleSaveCanvas}
              disabled={createCanvas.isPending}
            >
              <Ionicons name="save-outline" size={16} color="#fff" />
              <Text style={styles.footerBtnPrimaryText}>{createCanvas.isPending ? 'Saving...' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ── Customer Picker Modal ───────────────────────────────────────────── */}
      <Modal visible={showCustomerModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Customer</Text>
            <TouchableOpacity onPress={() => { setShowCustomerModal(false); setCustomerSearch(''); setShowCreateForm(false) }}>
              <Ionicons name="close" size={24} color="#1e293b" />
            </TouchableOpacity>
          </View>

          {/* Customer search */}
          <View style={styles.custSearchRow}>
            <Ionicons name="search-outline" size={16} color="#9ca3af" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.custSearchInput}
              placeholder="Search by name or phone..."
              placeholderTextColor="#9ca3af"
              value={customerSearch}
              onChangeText={setCustomerSearch}
              autoFocus
            />
            {customerSearch ? (
              <TouchableOpacity onPress={() => setCustomerSearch('')}>
                <Ionicons name="close-circle" size={16} color="#9ca3af" />
              </TouchableOpacity>
            ) : null}
          </View>

          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
            {/* Walk-in Customer (always first) */}
            <TouchableOpacity
              style={[styles.custRow, !customerId && styles.custRowSelected]}
              onPress={() => handleSelectCustomer(null, '')}
            >
              <View style={styles.custRowLeft}>
                <View style={styles.custAvatar}>
                  <Ionicons name="person-outline" size={18} color="#64748b" />
                </View>
                <View>
                  <Text style={styles.custName}>Walk-in Customer</Text>
                  <Text style={styles.custSub}>Default · no account</Text>
                </View>
              </View>
              {!customerId && <Ionicons name="checkmark-circle" size={20} color="#3b82f6" />}
            </TouchableOpacity>

            <View style={styles.custDivider} />

            {/* Existing customers */}
            {filteredCustomers
              .filter((c: any) => c.name !== 'Walk-in Customer')
              .map((c: any) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.custRow, customerId === c.id && styles.custRowSelected]}
                  onPress={() => handleSelectCustomer(c.id, c.name)}
                >
                  <View style={styles.custRowLeft}>
                    <View style={[styles.custAvatar, { backgroundColor: '#eff6ff' }]}>
                      <Ionicons name="person" size={18} color="#3b82f6" />
                    </View>
                    <View>
                      <Text style={styles.custName}>{c.name}</Text>
                      {c.phone ? <Text style={styles.custSub}>{c.phone}</Text> : null}
                    </View>
                  </View>
                  {customerId === c.id && <Ionicons name="checkmark-circle" size={20} color="#3b82f6" />}
                </TouchableOpacity>
              ))}

            {filteredCustomers.filter((c: any) => c.name !== 'Walk-in Customer').length === 0 && customerSearch.trim() && (
              <View style={styles.custEmpty}>
                <Text style={styles.custEmptyText}>No customers match "{customerSearch}"</Text>
              </View>
            )}

            <View style={styles.custDivider} />

            {/* Create new customer */}
            {!showCreateForm ? (
              <TouchableOpacity
                style={styles.createCustBtn}
                onPress={() => setShowCreateForm(true)}
              >
                <Ionicons name="person-add-outline" size={18} color="#3b82f6" />
                <Text style={styles.createCustBtnText}>Create New Customer</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.createCustForm}>
                <Text style={styles.createCustFormTitle}>New Customer</Text>
                <TextInput
                  style={styles.createCustInput}
                  placeholder="Full name *"
                  placeholderTextColor="#9ca3af"
                  value={newCustName}
                  onChangeText={setNewCustName}
                />
                <TextInput
                  style={styles.createCustInput}
                  placeholder="Phone (optional)"
                  placeholderTextColor="#9ca3af"
                  value={newCustPhone}
                  onChangeText={setNewCustPhone}
                  keyboardType="phone-pad"
                />
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  <TouchableOpacity
                    style={[styles.footerBtn, styles.footerBtnSecondary, { flex: 1, paddingVertical: 10 }]}
                    onPress={() => { setShowCreateForm(false); setNewCustName(''); setNewCustPhone('') }}
                  >
                    <Text style={styles.footerBtnSecondaryText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.footerBtn, styles.footerBtnPrimary, { flex: 2, paddingVertical: 10 }, isCreatingCust && styles.footerBtnDisabled]}
                    onPress={handleCreateCustomer}
                    disabled={isCreatingCust}
                  >
                    {isCreatingCust
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <><Ionicons name="person-add-outline" size={15} color="#fff" /><Text style={styles.footerBtnPrimaryText}>Create & Select</Text></>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <View style={{ height: 24 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Saved Canvases List Modal ───────────────────────────────────────── */}
      <Modal visible={showListModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Saved Canvases</Text>
            <TouchableOpacity onPress={() => setShowListModal(false)}>
              <Ionicons name="close" size={24} color="#1e293b" />
            </TouchableOpacity>
          </View>

          {(!canvasesData?.data?.length) ? (
            <View style={styles.emptyState}>
              <Ionicons name="clipboard-outline" size={48} color="#cbd5e1" />
              <Text style={styles.emptyText}>No saved canvases yet</Text>
            </View>
          ) : (
            <FlatList
              data={canvasesData.data}
              keyExtractor={(c) => c.id}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, gap: 10 }}
              renderItem={({ item: canvas }) => (
                <View style={styles.canvasCard}>
                  <View style={styles.canvasCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.canvasNumber}>{canvas.canvas_number}</Text>
                      <Text style={styles.canvasDate}>{fmtDate(canvas.canvas_date)}</Text>
                    </View>
                    <Text style={styles.canvasTotal}>₱{fmt(canvas.total_amount)}</Text>
                  </View>
                  {canvas.title ? (
                    <Text style={styles.canvasTitle} numberOfLines={1}>{canvas.title}</Text>
                  ) : null}
                  {(canvas as any).customer?.name ? (
                    <Text style={styles.canvasCustomer}>{(canvas as any).customer.name}</Text>
                  ) : null}
                  <Text style={styles.canvasItems}>{canvas.lines?.length ?? 0} item(s)</Text>

                  <View style={styles.canvasActions}>
                    <TouchableOpacity
                      style={[styles.canvasActionBtn, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}
                      onPress={() => handlePrintCanvas(canvas)}
                      disabled={isPrinting}
                    >
                      <Ionicons name="print-outline" size={14} color="#3b82f6" />
                      <Text style={[styles.canvasActionText, { color: '#3b82f6' }]}>Print</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.canvasActionBtn, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}
                      onPress={() => {
                        posClearCart()
                        canvas.lines?.forEach((line: any) => {
                          posAddItem({
                            productId:     line.product_id,
                            name:          line.product?.name || line.product_id,
                            quantity:      line.quantity,
                            price:         line.unit_price,
                            cogs_per_unit: line.cogs_per_unit,
                            discount:      0,
                            uom_name:      line.uom?.code || line.uom?.name || 'pc',
                          })
                        })
                        setShowListModal(false)
                        Alert.alert('Loaded', 'Canvas loaded into Sales cart. Complete the checkout there.')
                      }}
                    >
                      <Ionicons name="cart-outline" size={14} color="#16a34a" />
                      <Text style={[styles.canvasActionText, { color: '#16a34a' }]}>To Sale</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.canvasActionBtn, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}
                      onPress={() => handleDeleteCanvas(canvas.id)}
                    >
                      <Ionicons name="trash-outline" size={14} color="#ef4444" />
                      <Text style={[styles.canvasActionText, { color: '#ef4444' }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#f8fafc' },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  headerTitle:   { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  headerActions: { flexDirection: 'row', gap: 12 },
  headerBtn:     { position: 'relative', padding: 4 },
  headerBtnBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#ef4444', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  headerBtnBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  searchContainer: { flexDirection: 'row', alignItems: 'center', margin: 12, marginBottom: 8, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 12, paddingVertical: 8 },
  searchIcon:      { marginRight: 8 },
  searchInput:     { flex: 1, fontSize: 14, color: '#1e293b' },

  // Category row — fixed height wrapper prevents pills from being clipped
  categoryRowWrapper:  { height: 48, marginBottom: 4 },
  categoryRowContent:  { paddingHorizontal: 12, gap: 8, alignItems: 'center', flexDirection: 'row' },
  categoryPill:        { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  categoryPillActive:  { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  categoryPillText:    { fontSize: 13, fontWeight: '600', color: '#64748b' },
  categoryPillTextActive: { color: '#fff' },

  grid:    { paddingHorizontal: GRID_PADDING, paddingTop: 8, paddingBottom: 16 },
  gridRow: { justifyContent: 'space-between', marginBottom: GRID_GAP },

  productCard:        { width: CARD_WIDTH, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  productCardOOS:     { opacity: 0.5 },
  productCardInner:   { padding: 10 },
  qtyBadge:           { position: 'absolute', top: 8, right: 8, backgroundColor: '#3b82f6', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  qtyBadgeText:       { color: '#fff', fontSize: 11, fontWeight: '700' },
  productCode:        { fontSize: 10, color: '#94a3b8', fontFamily: 'monospace', marginTop: 6 },
  productName:        { fontSize: 12, fontWeight: '600', color: '#1e293b', marginTop: 2, minHeight: 32 },
  productPrice:       { fontSize: 14, fontWeight: '700', color: '#3b82f6', marginTop: 4 },
  oosText:            { fontSize: 10, color: '#ef4444', fontWeight: '600', marginTop: 2 },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  emptyText:  { marginTop: 12, color: '#94a3b8', fontSize: 14 },

  // Modal common
  modalContainer: { flex: 1, backgroundColor: '#f8fafc' },
  modalHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  modalTitle:     { fontSize: 17, fontWeight: '700', color: '#1e293b' },
  modalFooter:    { flexDirection: 'row', gap: 10, padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e2e8f0' },

  footerBtn:              { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 10 },
  footerBtnPrimary:       { backgroundColor: '#3b82f6' },
  footerBtnSecondary:     { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  footerBtnDisabled:      { opacity: 0.5 },
  footerBtnPrimaryText:   { color: '#fff', fontWeight: '700', fontSize: 15 },
  footerBtnSecondaryText: { color: '#64748b', fontWeight: '600', fontSize: 15 },

  // Cart
  cartList:         { flex: 1, padding: 12 },
  cartItem:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  cartItemInfo:     { flex: 1 },
  cartItemName:     { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  cartItemPrice:    { fontSize: 11, color: '#64748b', marginTop: 2 },
  cartItemControls: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 8 },
  qtyBtn:           { width: 26, height: 26, borderRadius: 6, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#bfdbfe' },
  qtyText:          { fontSize: 14, fontWeight: '700', color: '#1e293b', minWidth: 20, textAlign: 'center' },
  removeBtn:        { width: 26, height: 26, borderRadius: 6, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center' },
  cartItemTotal:    { fontSize: 13, fontWeight: '700', color: '#1e293b', minWidth: 64, textAlign: 'right' },

  // Section cards
  sectionCard:  { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, marginBottom: 10 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },

  discountPills:          { flexDirection: 'row', gap: 6 },
  discountPill:           { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  discountPillActive:     { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  discountPillText:       { fontSize: 12, fontWeight: '600', color: '#64748b' },
  discountPillTextActive: { color: '#fff' },
  discountInput:          { marginTop: 8, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, backgroundColor: '#f8fafc' },

  feeRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  feeLabel: { fontSize: 13, color: '#374151' },
  feeInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, width: 100, textAlign: 'right', backgroundColor: '#f8fafc' },

  // Totals
  totalsCard:      { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, marginBottom: 10 },
  totalRow:        { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  totalLabel:      { fontSize: 13, color: '#64748b' },
  totalValue:      { fontSize: 13, fontWeight: '500', color: '#1e293b' },
  grandTotalRow:   { borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 8, marginTop: 4 },
  grandTotalLabel: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  grandTotalValue: { fontSize: 18, fontWeight: '800', color: '#3b82f6' },

  // Save modal fields
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', marginBottom: 4, marginTop: 12 },
  fieldInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: '#fff' },

  // Customer picker button (in Save modal)
  customerPickerBtn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11, backgroundColor: '#fff' },
  customerPickerLeft:         { flexDirection: 'row', alignItems: 'center', gap: 8 },
  customerPickerText:         { fontSize: 14, color: '#94a3b8' },
  customerPickerTextSelected: { color: '#1e293b', fontWeight: '600' },

  // Customer picker modal
  custSearchRow:   { flexDirection: 'row', alignItems: 'center', margin: 12, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  custSearchInput: { flex: 1, fontSize: 14, color: '#1e293b' },
  custRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13, backgroundColor: '#fff' },
  custRowSelected: { backgroundColor: '#eff6ff' },
  custRowLeft:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  custAvatar:      { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  custName:        { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  custSub:         { fontSize: 12, color: '#94a3b8', marginTop: 1 },
  custDivider:     { height: 1, backgroundColor: '#f1f5f9', marginVertical: 4 },
  custEmpty:       { paddingHorizontal: 16, paddingVertical: 12 },
  custEmptyText:   { fontSize: 13, color: '#94a3b8', textAlign: 'center' },

  createCustBtn:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14 },
  createCustBtnText:  { fontSize: 14, fontWeight: '600', color: '#3b82f6' },
  createCustForm:     { margin: 12, padding: 14, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', gap: 10 },
  createCustFormTitle: { fontSize: 14, fontWeight: '700', color: '#1e293b', marginBottom: 2 },
  createCustInput:    { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: '#f8fafc', color: '#1e293b' },

  // Summary card
  summaryCard:  { backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, marginTop: 16 },
  summaryLabel: { fontSize: 13, color: '#64748b' },
  summaryValue: { fontSize: 13, fontWeight: '500', color: '#1e293b' },

  // Canvas list
  canvasCard:       { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', padding: 12 },
  canvasCardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  canvasNumber:     { fontSize: 13, fontWeight: '700', color: '#1e293b', fontFamily: 'monospace' },
  canvasDate:       { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  canvasTotal:      { fontSize: 16, fontWeight: '800', color: '#3b82f6' },
  canvasTitle:      { fontSize: 13, fontWeight: '600', color: '#3b82f6', marginBottom: 2 },
  canvasCustomer:   { fontSize: 12, color: '#64748b', marginBottom: 2 },
  canvasItems:      { fontSize: 11, color: '#94a3b8', marginBottom: 8 },
  canvasActions:    { flexDirection: 'row', gap: 8 },
  canvasActionBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  canvasActionText: { fontSize: 12, fontWeight: '600' },
})
