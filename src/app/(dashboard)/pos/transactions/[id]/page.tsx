'use client'

import { use, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const DeliveryMapView = dynamic(
  () => import('@/components/pos/delivery-map-view').then(m => ({ default: m.DeliveryMapView })),
  { ssr: false }
)
import { useTransaction, useUpdateTransactionDeliveryType } from '@/hooks/useTransactions'
import { formatCurrency, formatDate, formatTime } from '@/lib/utils/formatting'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Truck,
  ShoppingCart,
  RotateCcw,
  Loader2,
  Printer,
  Edit,
  User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'

const paymentStatusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  paid: 'default',
  partial: 'secondary',
  unpaid: 'destructive',
}

export default function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const { data: txn, isLoading, error, refetch } = useTransaction(id)
  const updateDeliveryType = useUpdateTransactionDeliveryType()

  const [isEditingDelivery, setIsEditingDelivery] = useState(false)
  const [editDeliveryType, setEditDeliveryType] = useState<'pickup' | 'delivery'>('pickup')
  const [editDeliveryAddress, setEditDeliveryAddress] = useState('')
  const [editDeliveryPhone, setEditDeliveryPhone] = useState('')

  const handleStartEdit = () => {
    if (!txn) return
    setEditDeliveryType(txn.delivery_type as 'pickup' | 'delivery')
    setEditDeliveryAddress((txn as any).delivery_address || '')
    setEditDeliveryPhone((txn as any).delivery_phone || '')
    setIsEditingDelivery(true)
  }

  const handleSaveDelivery = async () => {
    if (!txn) return
    try {
      await updateDeliveryType.mutateAsync({
        transactionId: txn.id,
        deliveryType: editDeliveryType,
        deliveryAddress: editDeliveryType === 'delivery' ? editDeliveryAddress : undefined,
        deliveryPhone: editDeliveryType === 'delivery' ? editDeliveryPhone : undefined,
      })
      toast.success('Delivery info updated')
      setIsEditingDelivery(false)
      refetch()
    } catch (e: any) {
      toast.error(e.message || 'Failed to update delivery info')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !txn) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">Transaction not found.</p>
        <Button variant="outline" onClick={() => router.push('/pos/history')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to History
        </Button>
      </div>
    )
  }

  const isReturn = txn.transaction_type === 'return'
  const customer = (txn as any).customer
  const branch = (txn as any).branch
  const lines = (txn as any).lines || []
  const payments = (txn as any).payments || []
  const hasDeliveryMap = txn.delivery_type === 'delivery' &&
    (txn as any).delivery_latitude != null &&
    (txn as any).delivery_longitude != null

  // Compute gross for display — DB subtotal is post-line-discount so we derive from lines.
  const grossSubtotal = lines.reduce((sum: number, l: any) => sum + l.quantity * l.unit_price, 0)
  const totalDiscount = txn.discount_amount || 0

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* ── Back + Header ─────────────────────────────────────────────── */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 -ml-2 text-muted-foreground"
          onClick={() => router.back()}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              {isReturn ? (
                <Badge className="bg-orange-100 text-orange-700 border-orange-300 flex items-center gap-1">
                  <RotateCcw className="h-3 w-3" /> Return
                </Badge>
              ) : (
                <Badge className="bg-blue-100 text-blue-700 border-blue-300 flex items-center gap-1">
                  <ShoppingCart className="h-3 w-3" /> Sale
                </Badge>
              )}
              <h1 className="text-xl font-bold font-mono">{txn.transaction_number}</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {formatDate(txn.transaction_date)} at {formatTime(txn.transaction_date)}
              {branch?.name && ` · ${branch.name}`}
            </p>
          </div>
          <Badge variant={paymentStatusVariant[txn.payment_status] || 'outline'} className="capitalize">
            {txn.payment_status}
          </Badge>
        </div>
      </div>

      {/* ── Customer + Delivery ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className={hasDeliveryMap ? 'sm:col-span-1' : ''}>
          <CardContent className="pt-5 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Customer</p>
            {customer?.id ? (
              <Link
                href={`/customers/${customer.id}`}
                className="font-semibold hover:underline hover:text-primary flex items-center gap-1"
              >
                <User className="h-3.5 w-3.5" />
                {customer.name || 'Walk-in Customer'}
              </Link>
            ) : (
              <p className="font-semibold text-muted-foreground">Walk-in Customer</p>
            )}
            {customer?.phone && (
              <p className="text-sm text-muted-foreground">{customer.phone}</p>
            )}
          </CardContent>
        </Card>

        <Card className={hasDeliveryMap ? 'sm:col-span-2' : ''}>
          <CardContent className="pt-5 space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Delivery</p>
              {!isEditingDelivery && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={handleStartEdit}>
                  <Edit className="h-3 w-3 mr-1" /> Edit
                </Button>
              )}
            </div>
            {isEditingDelivery ? (
              <div className="space-y-2">
                <Select value={editDeliveryType} onValueChange={(v: 'pickup' | 'delivery') => setEditDeliveryType(v)}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pickup">Pickup</SelectItem>
                    <SelectItem value="delivery">Delivery</SelectItem>
                  </SelectContent>
                </Select>
                {editDeliveryType === 'delivery' && (
                  <>
                    <Input
                      value={editDeliveryAddress}
                      onChange={(e) => setEditDeliveryAddress(e.target.value)}
                      placeholder="Delivery address"
                      className="h-8 text-sm"
                    />
                    <Input
                      value={editDeliveryPhone}
                      onChange={(e) => setEditDeliveryPhone(e.target.value)}
                      placeholder="Contact phone"
                      className="h-8 text-sm"
                    />
                  </>
                )}
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveDelivery} disabled={updateDeliveryType.isPending}>
                    {updateDeliveryType.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setIsEditingDelivery(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <>
                <p className="font-semibold flex items-center gap-1 capitalize">
                  {txn.delivery_type === 'delivery' && <Truck className="h-3.5 w-3.5" />}
                  {txn.delivery_type}
                </p>
                {txn.delivery_type === 'delivery' && (
                  <>
                    {(txn as any).delivery_address && (
                      <p className="text-sm text-muted-foreground">{(txn as any).delivery_address}</p>
                    )}
                    {(txn as any).delivery_phone && (
                      <p className="text-sm text-muted-foreground">{(txn as any).delivery_phone}</p>
                    )}
                    {(txn as any).delivery_latitude != null && (txn as any).delivery_longitude != null && (
                      <DeliveryMapView
                        lat={(txn as any).delivery_latitude}
                        lng={(txn as any).delivery_longitude}
                        distanceKm={(txn as any).delivery_distance_km}
                        geocodedAddress={(txn as any).delivery_geocoded_address}
                        roadBased={true}
                      />
                    )}
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Items ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {lines.map((line: any) => (
            <div key={line.id} className="flex justify-between items-start pb-3 border-b last:border-0 last:pb-0">
              <div className="flex-1">
                <p className="font-medium">{line.product?.name || 'Product'}</p>
                <p className="text-sm text-muted-foreground">
                  {line.quantity} {line.uom?.abbreviation || line.uom?.name || 'pc'} @ {formatCurrency(line.unit_price)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{formatCurrency(line.quantity * line.unit_price)}</p>
                {line.discount_amount > 0 && (
                  <p className="text-sm text-green-600">−{formatCurrency(line.discount_amount)}</p>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ── Totals ────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-5 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatCurrency(grossSubtotal)}</span>
          </div>
          {totalDiscount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Discount{txn.discount_percentage > 0 ? ` (${txn.discount_percentage}%)` : ''}</span>
              <span>−{formatCurrency(totalDiscount)}</span>
            </div>
          )}
          {(txn as any).delivery_fee > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Delivery Fee</span>
              <span>+{formatCurrency((txn as any).delivery_fee)}</span>
            </div>
          )}
          {(txn as any).other_fees > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                Other Fees{(txn as any).other_fees_notes ? ` (${(txn as any).other_fees_notes})` : ''}
              </span>
              <span>+{formatCurrency((txn as any).other_fees)}</span>
            </div>
          )}
          {txn.tax_amount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tax</span>
              <span>{formatCurrency(txn.tax_amount)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between font-bold text-lg">
            <span>Total</span>
            <span>{formatCurrency(txn.total_amount)}</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Payments ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded.</p>
          ) : (
            <>
              {payments.map((p: any) => (
                <div key={p.id} className="flex justify-between items-center">
                  <div>
                    <Badge variant="outline" className="capitalize">{p.payment_method}</Badge>
                    {p.reference_number && (
                      <p className="text-xs text-muted-foreground mt-1">Ref: {p.reference_number}</p>
                    )}
                  </div>
                  <span className="font-semibold">{formatCurrency(p.amount)}</span>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between font-bold">
                <span>Amount Paid</span>
                <span>{formatCurrency(txn.amount_paid)}</span>
              </div>
              {txn.total_amount > txn.amount_paid && (
                <div className="flex justify-between text-orange-600 font-semibold">
                  <span>Balance Due</span>
                  <span>{formatCurrency(txn.total_amount - txn.amount_paid)}</span>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Notes ─────────────────────────────────────────────────────── */}
      {txn.notes && (
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Notes</p>
            <p className="text-sm">{txn.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
