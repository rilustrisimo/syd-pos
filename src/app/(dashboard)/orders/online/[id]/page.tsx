'use client'

import { useState, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, MapPin, Package, CreditCard, Truck,
  Check, X, Edit2, Trash2, ExternalLink, ShoppingCart,
  User, Phone, FileImage, AlertCircle, Plus, Percent, Search,
} from 'lucide-react'
import { PageTitle } from '@/components/page-title'
import {
  useOnlineOrder,
  useOnlineOrderStock,
  useSignedPaymentProofUrl,
  useUpdateOnlineOrderStatus,
  useUpdateOnlineOrderPaymentStatus,
  useUpdateOnlineOrderLine,
  useDeleteOnlineOrderLine,
  useAddOnlineOrderLine,
  useUpdateOnlineOrderLineDiscount,
  useUpdateOnlineOrderDiscount,
  type OnlineOrderStatus,
  type OnlineOrderPaymentStatus,
} from '@/hooks/useOnlineOrders'
import { usePOSProductSearch } from '@/hooks/useTransactions'
import { useShopBranchId } from '@/hooks/useShopSettings'
import { useDiscountRules } from '@/hooks/useDiscountRules'
import { getStandardDiscountForMarkup } from '@/lib/supabase/queries/discount-rules'
import { getClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

function formatPrice(amount: number) {
  return '₱' + Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-PH', {
    dateStyle: 'medium', timeStyle: 'short',
  })
}

const STATUS_OPTIONS: { value: OnlineOrderStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'out_for_delivery', label: 'Out for Delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'picked_up', label: 'Picked Up' },
  { value: 'cancelled', label: 'Cancelled' },
]

const STATUS_COLORS: Record<OnlineOrderStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  confirmed: 'bg-blue-100 text-blue-800 border-blue-200',
  preparing: 'bg-purple-100 text-purple-800 border-purple-200',
  out_for_delivery: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  delivered: 'bg-green-100 text-green-800 border-green-200',
  picked_up: 'bg-green-100 text-green-800 border-green-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
}

const PAYMENT_STATUS_OPTIONS: { value: OnlineOrderPaymentStatus; label: string }[] = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'verified', label: 'Verified' },
  { value: 'refunded', label: 'Refunded' },
]

type DiscountType = 'none' | 'fixed' | 'percentage' | 'standard' | 'cost'
const DISCOUNT_TYPE_OPTIONS: { value: DiscountType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'fixed', label: 'Fixed' },
  { value: 'percentage', label: 'Percentage' },
  { value: 'standard', label: 'Standard' },
  { value: 'cost', label: 'At Cost' },
]

export default function OnlineOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const { data: order, isLoading, error } = useOnlineOrder(id)
  const updateStatus = useUpdateOnlineOrderStatus()
  const updatePaymentStatus = useUpdateOnlineOrderPaymentStatus()
  const updateLine = useUpdateOnlineOrderLine()
  const deleteLine = useDeleteOnlineOrderLine()
  const addLine = useAddOnlineOrderLine()
  const updateLineDiscount = useUpdateOnlineOrderLineDiscount()
  const updateOrderDiscount = useUpdateOnlineOrderDiscount()
  const { data: branchId } = useShopBranchId()
  const { data: discountRules = [] } = useDiscountRules()

  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [editingQty, setEditingQty] = useState<string>('')

  const [showAddProduct, setShowAddProduct] = useState(false)
  const [productQuery, setProductQuery] = useState('')
  const { data: searchResults = [], isLoading: isSearching } = usePOSProductSearch(productQuery, branchId ?? '')

  const [showDiscountPanel, setShowDiscountPanel] = useState(false)
  const [discountInput, setDiscountInput] = useState('')
  const [applyingDiscount, setApplyingDiscount] = useState(false)

  const productIds = (order?.lines ?? [])
    .map(l => l.product_id)
    .filter((id): id is string => !!id)
  const { data: stock } = useOnlineOrderStock(productIds)

  const shortages = (order?.lines ?? []).filter(line => {
    if (!line.product_id) return false
    const onHand = stock?.[line.product_id] ?? 0
    return line.quantity > onHand
  })
  const hasShortages = shortages.length > 0

  const { data: signedProofUrl, isLoading: proofLoading } = useSignedPaymentProofUrl(order?.payment_proof_url ?? null)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        Loading order...
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
        <AlertCircle className="w-10 h-10 opacity-40" />
        <p className="text-sm">Order not found</p>
        <Link href="/orders/online" className="text-blue-600 text-sm hover:underline">← Back to orders</Link>
      </div>
    )
  }

  const isNewCustomer = !order.customer || (() => {
    const cCreated = new Date(order.customer.created_at).getTime()
    const oCreated = new Date(order.created_at).getTime()
    return Math.abs(cCreated - oCreated) < 5000
  })()

  function handleStatusChange(status: OnlineOrderStatus) {
    updateStatus.mutate({ id, status }, {
      onSuccess: () => toast.success(`Status updated to "${status}"`),
      onError: (e) => toast.error(e.message),
    })
  }

  function handlePaymentStatusChange(payment_status: OnlineOrderPaymentStatus) {
    updatePaymentStatus.mutate({ id, payment_status }, {
      onSuccess: () => toast.success(`Payment status updated to "${payment_status}"`),
      onError: (e) => toast.error(e.message),
    })
  }

  function startEditLine(lineId: string, currentQty: number) {
    setEditingLineId(lineId)
    setEditingQty(String(currentQty))
  }

  function saveEditLine(lineId: string) {
    const qty = Number(editingQty)
    if (!qty || qty <= 0) return
    updateLine.mutate({ id: lineId, quantity: qty }, {
      onSuccess: () => {
        toast.success('Line item updated')
        setEditingLineId(null)
      },
      onError: (e) => toast.error(e.message),
    })
  }

  function handleDeleteLine(lineId: string) {
    deleteLine.mutate(lineId, {
      onSuccess: () => toast.success('Line item removed'),
      onError: (e) => toast.error(e.message),
    })
  }

  function handleConvertToSale() {
    router.push(`/pos?from_order=${id}`)
  }

  function handleAddProduct(product: { id: string; code: string; name: string; unit_price: number; selling_uom_abbreviation: string }) {
    addLine.mutate(
      {
        order_id: id,
        product_id: product.id,
        product_code: product.code,
        product_name: product.name,
        unit_label: product.selling_uom_abbreviation,
        unit_price: product.unit_price,
        quantity: 1,
      },
      {
        onSuccess: () => {
          toast.success(`${product.name} added to order`)
          setProductQuery('')
        },
        onError: (e) => toast.error(e.message),
      }
    )
  }

  // Standard/At Cost are per-line, computed fresh from each line's product
  // (online_order_lines doesn't snapshot markup/cost the way POS cart items
  // do), mirroring the exact formulas used in POS checkout's discount panel.
  async function applyDiscountType(type: DiscountType) {
    if (!order) return
    setApplyingDiscount(true)
    try {
      if (type === 'none') {
        await updateOrderDiscount.mutateAsync({ order_id: id, discount_amount: 0, discount_percentage: 0 })
        for (const line of order.lines ?? []) {
          if (line.discount_amount > 0) {
            await updateLineDiscount.mutateAsync({ id: line.id, discount_amount: 0 })
          }
        }
        return
      }

      if (type === 'fixed' || type === 'percentage') {
        for (const line of order.lines ?? []) {
          if (line.discount_amount > 0) {
            await updateLineDiscount.mutateAsync({ id: line.id, discount_amount: 0 })
          }
        }
        const value = parseFloat(discountInput) || 0
        await updateOrderDiscount.mutateAsync({
          order_id: id,
          discount_amount: type === 'fixed' ? value : 0,
          discount_percentage: type === 'percentage' ? Math.min(100, value) : 0,
        })
        return
      }

      // standard / cost — clear any order-level discount first, then apply per-line
      await updateOrderDiscount.mutateAsync({ order_id: id, discount_amount: 0, discount_percentage: 0 })

      const lines = order.lines ?? []
      const productIds = lines.map(l => l.product_id).filter((v): v is string => !!v)
      if (productIds.length === 0) return

      const supabase = getClient()
      const { data: products, error: productsErr } = await supabase
        .from('products')
        .select('id, markup_percentage, latest_cogs')
        .in('id', productIds)
      if (productsErr) throw new Error(productsErr.message)

      const productMap = new Map((products ?? []).map((p: any) => [p.id, p]))

      for (const line of lines) {
        if (!line.product_id) continue
        const product = productMap.get(line.product_id)
        if (!product) continue

        const cogsPerUnit = Number(product.latest_cogs ?? 0)
        let discAmt = 0
        if (type === 'standard') {
          const markup = cogsPerUnit > 0
            ? ((line.unit_price / cogsPerUnit - 1) * 100)
            : Number(product.markup_percentage ?? 0)
          const discPct = getStandardDiscountForMarkup(discountRules, markup)
          discAmt = (line.quantity * line.unit_price * discPct) / 100
        } else {
          discAmt = line.quantity * Math.max(0, line.unit_price - cogsPerUnit)
        }
        await updateLineDiscount.mutateAsync({ id: line.id, discount_amount: discAmt })
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to apply discount')
    } finally {
      setApplyingDiscount(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <PageTitle title={order ? `${order.order_number} · Online Orders` : 'Online Orders'} />
      {/* Back + header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/orders/online">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold font-mono">{order.order_number}</h1>
              <Badge variant="outline" className={STATUS_COLORS[order.status]}>
                {STATUS_OPTIONS.find(s => s.value === order.status)?.label}
              </Badge>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{formatDate(order.created_at)}</p>
          </div>
        </div>

        {/* Convert to Sale button */}
        {!order.transaction_id && order.status !== 'cancelled' && (
          <Button
            onClick={handleConvertToSale}
            disabled={hasShortages}
            title={hasShortages ? 'Adjust quantities to match available stock before converting' : undefined}
            className="bg-green-600 hover:bg-green-700 text-white gap-2 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ShoppingCart className="w-4 h-4" />
            Convert to Sale
          </Button>
        )}
        {order.transaction_id && (
          <Badge className="bg-green-100 text-green-800 border border-green-200 flex-shrink-0">
            ✓ Fulfilled
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left col */}
        <div className="lg:col-span-2 space-y-4">

          {/* Customer info */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <User className="w-4 h-4" /> Customer
                <Badge
                  variant="outline"
                  className={isNewCustomer
                    ? 'bg-orange-50 text-orange-700 border-orange-200 text-xs ml-auto'
                    : 'bg-blue-50 text-blue-700 border-blue-200 text-xs ml-auto'}
                >
                  {isNewCustomer ? '🆕 New Customer' : '↩ Returning Customer'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-medium">{order.customer_name}</span>
                {order.customer && (
                  <Link href={`/customers/${order.customer_id}`} className="text-blue-600 text-xs hover:underline ml-auto flex items-center gap-1">
                    View profile <ExternalLink className="w-3 h-3" />
                  </Link>
                )}
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                {order.customer_phone}
              </div>
              {order.notes && (
                <div className="bg-amber-50 rounded-lg px-3 py-2 text-xs text-amber-700">
                  <span className="font-medium">Notes:</span> {order.notes}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Order lines */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Package className="w-4 h-4" /> Items
                </CardTitle>
                {order.status !== 'cancelled' && !order.transaction_id && (
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => { setShowAddProduct(v => !v); setShowDiscountPanel(false) }}
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Product
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => { setShowDiscountPanel(v => !v); setShowAddProduct(false) }}
                    >
                      <Percent className="w-3.5 h-3.5" /> Discount
                    </Button>
                  </div>
                )}
              </div>

              {showAddProduct && (
                <div className="mt-2 border rounded-lg p-3 bg-muted/30 space-y-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      placeholder="Search product by name or code..."
                      value={productQuery}
                      onChange={e => setProductQuery(e.target.value)}
                      className="h-8 pl-8 text-xs"
                      autoFocus
                    />
                  </div>
                  {productQuery.length >= 2 && (
                    <div className="max-h-56 overflow-y-auto border rounded-md bg-white divide-y">
                      {isSearching ? (
                        <p className="text-xs text-slate-400 p-3 text-center">Searching...</p>
                      ) : searchResults.length === 0 ? (
                        <p className="text-xs text-slate-400 p-3 text-center">No products found</p>
                      ) : (
                        searchResults.map((product: any) => (
                          <button
                            key={product.id}
                            type="button"
                            onClick={() => handleAddProduct(product)}
                            disabled={addLine.isPending}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-50"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">{product.name}</p>
                              <p className="text-[11px] text-slate-400">{product.code} · {product.available_stock} {product.uom_abbreviation} in stock</p>
                            </div>
                            <span className="text-xs font-semibold flex-shrink-0">{formatPrice(product.unit_price)}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {showDiscountPanel && (
                <div className="mt-2 border rounded-lg p-3 bg-muted/30 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {DISCOUNT_TYPE_OPTIONS.map(opt => (
                      <Button
                        key={opt.value}
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={applyingDiscount}
                        onClick={() => applyDiscountType(opt.value)}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      placeholder="Amount (Fixed) or % (Percentage)"
                      value={discountInput}
                      onChange={e => setDiscountInput(e.target.value)}
                      className="h-8 text-xs"
                    />
                    <p className="text-[11px] text-slate-400 flex-shrink-0 w-40">
                      Enter a value, then click Fixed or Percentage above to apply it.
                    </p>
                  </div>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-4 py-2 text-xs text-slate-500 font-medium">Product</th>
                    <th className="text-right px-4 py-2 text-xs text-slate-500 font-medium">Price</th>
                    <th className="text-right px-4 py-2 text-xs text-slate-500 font-medium">Qty</th>
                    <th className="text-right px-4 py-2 text-xs text-slate-500 font-medium">Total</th>
                    <th className="w-16 px-2" />
                  </tr>
                </thead>
                <tbody>
                  {(order.lines ?? []).map(line => (
                    <tr key={line.id} className="border-b border-slate-50">
                      <td className="px-4 py-2">
                        <p className="font-medium leading-snug">{line.product_name}</p>
                        <p className="text-xs text-slate-400">{line.product_code}</p>
                      </td>
                      <td className="px-4 py-2 text-right text-slate-600">
                        {formatPrice(line.unit_price)}/{line.unit_label}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {editingLineId === line.id ? (
                          <div className="flex items-center justify-end gap-1">
                            <Input
                              type="number"
                              min="1"
                              value={editingQty}
                              onChange={e => setEditingQty(e.target.value)}
                              className="w-16 h-7 text-xs text-right"
                              onKeyDown={e => e.key === 'Enter' && saveEditLine(line.id)}
                              autoFocus
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-green-600"
                              onClick={() => saveEditLine(line.id)}
                              disabled={updateLine.isPending}
                            >
                              <Check className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-slate-400"
                              onClick={() => setEditingLineId(null)}
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <span className="font-medium">{line.quantity} {line.unit_label}</span>
                            {line.product_id && line.quantity > (stock?.[line.product_id] ?? 0) && (
                              <p className="text-[11px] text-red-600 mt-0.5">
                                only {stock?.[line.product_id] ?? 0} in stock
                              </p>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right font-medium">
                        {formatPrice(line.line_total)}
                        {line.discount_amount > 0 && (
                          <p className="text-[11px] text-green-600 font-normal">-{formatPrice(line.discount_amount)} off</p>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {order.status !== 'cancelled' && !order.transaction_id && editingLineId !== line.id && (
                          <div className="flex gap-0.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-slate-400 hover:text-blue-600"
                              onClick={() => startEditLine(line.id, line.quantity)}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remove line item?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will remove {line.product_name} from the order. The order total will be updated.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteLine(line.id)}
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    Remove
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-100">
                    <td colSpan={3} className="px-4 py-2 text-right text-sm text-slate-500">Subtotal</td>
                    <td className="px-4 py-2 text-right font-semibold">{formatPrice(order.subtotal)}</td>
                    <td />
                  </tr>
                  {(order.discount_amount > 0 || order.discount_percentage > 0) && (
                    <tr>
                      <td colSpan={3} className="px-4 py-1.5 text-right text-sm text-slate-500">
                        Discount{order.discount_percentage > 0 ? ` (${order.discount_percentage}%)` : ''}
                      </td>
                      <td className="px-4 py-1.5 text-right font-semibold text-green-600">
                        -{formatPrice(order.discount_amount > 0 ? order.discount_amount : (order.subtotal * order.discount_percentage) / 100)}
                      </td>
                      <td />
                    </tr>
                  )}
                  {order.delivery_fee > 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-1.5 text-right text-sm text-slate-500">
                        Delivery fee{order.distance_km ? ` (${order.distance_km} km)` : ''}
                      </td>
                      <td className="px-4 py-1.5 text-right font-semibold">{formatPrice(order.delivery_fee)}</td>
                      <td />
                    </tr>
                  )}
                  <tr className="border-t border-slate-200">
                    <td colSpan={3} className="px-4 py-2.5 text-right font-bold">Total</td>
                    <td className="px-4 py-2.5 text-right font-bold text-green-700">{formatPrice(order.total_amount)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>

          {/* Staff activity log */}
          {order.staff_log && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Edit2 className="w-4 h-4" /> Activity Log
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-xs text-slate-500">
                  {order.staff_log.split('\n').map((entry, i) => (
                    <li key={i} className="border-l-2 border-slate-200 pl-2">{entry}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Delivery info / map */}
          {order.fulfillment === 'delivery' && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> Delivery Location
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {order.address && <p className="text-slate-700">{order.address}</p>}
                {order.latitude && order.longitude && (
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${order.latitude}&mlon=${order.longitude}#map=17/${order.latitude}/${order.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-blue-600 text-xs hover:underline"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    View on map ({order.latitude.toFixed(5)}, {order.longitude.toFixed(5)})
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {order.distance_km && (
                  <p className="text-slate-500 text-xs">{order.distance_km} km from store · Delivery fee: {formatPrice(order.delivery_fee)}</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right col */}
        <div className="space-y-4">

          {/* Status controls */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Order Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={order.status} onValueChange={v => handleStatusChange(v as OnlineOrderStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Payment */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CreditCard className="w-4 h-4" /> Payment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Method</span>
                <span className="capitalize font-medium">
                  {order.payment_method.replace('_', ' ')}
                  {order.payment_method === 'qr' && order.payment_qr_label && ` (${order.payment_qr_label})`}
                </span>
              </div>
              {order.payment_reference_no && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Reference</span>
                  <span className="font-mono text-xs">{order.payment_reference_no}</span>
                </div>
              )}
              <div>
                <p className="text-xs text-slate-500 mb-1">Payment Status</p>
                <Select value={order.payment_status} onValueChange={v => handlePaymentStatusChange(v as OnlineOrderPaymentStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_STATUS_OPTIONS.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Proof viewer */}
              {order.payment_proof_url && (
                <div>
                  <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                    <FileImage className="w-3.5 h-3.5" /> Proof of Payment
                  </p>
                  {proofLoading && <p className="text-xs text-slate-400">Loading proof...</p>}
                  {signedProofUrl && (
                    <a
                      href={signedProofUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={signedProofUrl}
                        alt="Payment proof"
                        className="rounded-lg border w-full object-cover max-h-48 cursor-pointer hover:opacity-90"
                      />
                      <p className="text-xs text-blue-600 mt-1 text-center hover:underline">Open full size ↗</p>
                    </a>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Fulfillment type */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Truck className="w-4 h-4" /> Fulfillment
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-700">
              <span className="capitalize font-medium">{order.fulfillment}</span>
              {order.fulfillment === 'pickup' && (
                <p className="text-xs text-slate-400 mt-1">Customer will pick up at the store</p>
              )}
            </CardContent>
          </Card>

          {/* Stock shortage warning */}
          {!order.transaction_id && order.status !== 'cancelled' && hasShortages && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm text-red-800 font-medium mb-1 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" /> Not enough stock
              </p>
              <ul className="text-xs text-red-700 space-y-1 mb-2">
                {shortages.map(line => (
                  <li key={line.id}>
                    {line.product_name}: ordered {line.quantity}, only {stock?.[line.product_id!] ?? 0} in stock
                  </li>
                ))}
              </ul>
              <p className="text-xs text-red-600">
                Call the customer to adjust quantities before converting to a sale.
              </p>
            </div>
          )}

          {/* Convert to Sale */}
          {!order.transaction_id && order.status !== 'cancelled' && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-sm text-green-800 font-medium mb-1">Ready to process?</p>
              <p className="text-xs text-green-700 mb-3">
                {hasShortages
                  ? 'Adjust the line items above to match available stock, then convert.'
                  : 'Click "Convert to Sale" to open the sale screen with this order\'s items and customer pre-filled.'}
              </p>
              <Button
                onClick={handleConvertToSale}
                disabled={hasShortages}
                className="w-full bg-green-600 hover:bg-green-700 text-white gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ShoppingCart className="w-4 h-4" />
                Convert to Sale
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
