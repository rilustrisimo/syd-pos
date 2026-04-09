'use client'

import { useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  usePurchaseOrder,
  useReceivePOLineItems,
  useReceiveAllPOLines,
  useCancelPurchaseOrder,
  useDeletePurchaseOrder,
} from '@/hooks/usePurchases'
import { useUpdateProduct } from '@/hooks/useProducts'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils/formatting'
import { calculateMarkupPercentage, calculateSellingPrice } from '@/lib/utils/calculations'
import { useAuthStore } from '@/lib/stores/auth'
import type { POStatus } from '@/types/database'
import { toast } from 'sonner'
import { printElement } from '@/lib/utils/print'
import { POTemplate } from '@/components/print/po-template'
import type { POData } from '@/components/print/po-template'
import {
  ArrowLeft,
  Building2,
  Calendar,
  Package,
  Truck,
  CheckCircle,
  XCircle,
  Loader2,
  PackageCheck,
  AlertCircle,
  FileText,
  User,
  Printer,
  PackagePlus,
  ArrowRight,
  Trash2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { TrendingUp, TrendingDown, Minus, CheckCheck, RotateCcw } from 'lucide-react'

const statusConfig: Record<POStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof FileText; color: string }> = {
  draft: { label: 'Draft', variant: 'outline', icon: FileText, color: 'text-gray-500' },
  sent: { label: 'Sent', variant: 'secondary', icon: Truck, color: 'text-blue-500' },
  confirmed: { label: 'Confirmed', variant: 'default', icon: CheckCircle, color: 'text-green-500' },
  partially_received: { label: 'Partially Received', variant: 'secondary', icon: Package, color: 'text-amber-500' },
  received: { label: 'Fully Received', variant: 'default', icon: PackageCheck, color: 'text-green-600' },
  cancelled: { label: 'Cancelled', variant: 'destructive', icon: XCircle, color: 'text-red-500' },
}

type PriceReviewAction = 'accept' | 'retain' | 'custom_price' | 'custom_markup'

type PriceReviewItem = {
  lineId: string
  productId: string
  productName: string
  currentPrice: number
  proposedPrice: number
  cogs: number
  markup: number
  action: PriceReviewAction
  customPrice: string
  customMarkup: string
}

export default function PurchaseOrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuthStore()
  const poId = params.id as string
  const poTemplateRef = useRef<HTMLDivElement>(null)
  const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/syd-logo.svg` : undefined

  const { data: po, isLoading, error } = usePurchaseOrder(poId)
  const receiveMutation = useReceivePOLineItems()
  const receiveAllMutation = useReceiveAllPOLines()
  const cancelMutation = useCancelPurchaseOrder()
  const deleteMutation = useDeletePurchaseOrder()
  const updateProductMutation = useUpdateProduct()

  const [isReceiveDialogOpen, setIsReceiveDialogOpen] = useState(false)
  const [receivingLine, setReceivingLine] = useState<any>(null)
  const [receiveQuantity, setReceiveQuantity] = useState<number>(0)
  const [receiveDate, setReceiveDate] = useState(new Date().toISOString().split('T')[0])
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false)
  const [isReceiveAllDialogOpen, setIsReceiveAllDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isPriceReviewOpen, setIsPriceReviewOpen] = useState(false)
  const [priceReviewItems, setPriceReviewItems] = useState<PriceReviewItem[]>([])
  const [isApplyingPriceReview, setIsApplyingPriceReview] = useState(false)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !po) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <h2 className="text-lg font-semibold mb-2">Purchase Order Not Found</h2>
        <p className="text-muted-foreground mb-4">
          The purchase order you&apos;re looking for doesn&apos;t exist or has been removed.
        </p>
        <Link href="/purchases">
          <Button>Back to Purchase Orders</Button>
        </Link>
      </div>
    )
  }

  const statusInfo = statusConfig[po.status]
  const StatusIcon = statusInfo.icon

  // Allow receiving from draft, sent, confirmed, or partially_received
  const canReceive = ['draft', 'sent', 'confirmed', 'partially_received'].includes(po.status)
  const canCancel = ['draft', 'sent', 'confirmed'].includes(po.status)
  const isCompleted = po.status === 'received' || po.status === 'cancelled'

  const totalOrdered = po.lines?.reduce((sum, l) => sum + Number(l.quantity_ordered), 0) || 0
  const totalReceived = po.lines?.reduce((sum, l) => sum + Number(l.quantity_received), 0) || 0
  const receivedPercentage = totalOrdered > 0 ? (totalReceived / totalOrdered) * 100 : 0
  const hasUnreceived = po.lines?.some(l => Number(l.quantity_received) < Number(l.quantity_ordered))
  const hasReceivedItems = po.lines?.some(l => Number(l.quantity_received) > 0)
  const canDelete = user?.role && ['admin', 'manager'].includes(user.role) && !hasReceivedItems

  const parseNumber = (value: string, fallback = 0) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  const calculateCogsFromLine = (line: any) => {
    const product = line.product || {}
    const unitCost = Number(line.unit_cost) || 0
    const baseUomId = product.base_uom_id
    const sellingUomId = product.selling_uom_id
    const conversionFactor = Number(product.conversion_factor) || 1

    if (baseUomId && sellingUomId && baseUomId !== sellingUomId && conversionFactor > 0) {
      return unitCost / conversionFactor
    }

    return unitCost
  }

  const buildPriceReviewItems = (lines: any[]) => {
    const items = lines.map((line) => {
      const product = line.product || {}
      const currentPrice = Number(product.current_selling_price) || 0
      const markup = Number(product.markup_percentage) || 0
      const cogs = calculateCogsFromLine(line)
      const proposedPrice = cogs * (1 + markup / 100)
      const isIncrease = proposedPrice > currentPrice

      return {
        lineId: line.id,
        productId: line.product_id,
        productName: product.name || 'Unnamed Product',
        currentPrice,
        proposedPrice,
        cogs,
        markup,
        action: (isIncrease ? 'accept' : 'retain') as PriceReviewAction,
        customPrice: proposedPrice.toFixed(2),
        customMarkup: markup.toFixed(2),
      }
    })

    return items.filter((item) => item.proposedPrice !== item.currentPrice)
  }

  const openPriceReview = (lines: any[]) => {
    const items = buildPriceReviewItems(lines)

    if (items.length === 0) {
      toast.info('No price changes to review')
      return
    }

    setPriceReviewItems(items)
    setIsPriceReviewOpen(true)
  }

  const updateReviewItem = (index: number, updates: Partial<PriceReviewItem>) => {
    setPriceReviewItems((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], ...updates }
      return next
    })
  }

  const handleOpenReceive = (line: any) => {
    const remaining = Number(line.quantity_ordered) - Number(line.quantity_received)
    setReceivingLine(line)
    setReceiveQuantity(remaining)
    setIsReceiveDialogOpen(true)
  }

  const handleReceive = async () => {
    if (!receivingLine || !user?.id) return

    if (receiveQuantity <= 0) {
      toast.error('Quantity must be greater than 0')
      return
    }

    const remaining = Number(receivingLine.quantity_ordered) - Number(receivingLine.quantity_received)
    if (receiveQuantity > remaining) {
      toast.error(`Cannot receive more than ${remaining} units`)
      return
    }

    try {
      await receiveMutation.mutateAsync({
        lineId: receivingLine.id,
        quantityReceived: receiveQuantity,
        userId: user.id,
        poId: poId,
      })
      toast.success(`Received ${receiveQuantity} units of ${receivingLine.product?.name}`)
      setIsReceiveDialogOpen(false)
      const receivedLine = receivingLine
      setReceivingLine(null)
      openPriceReview([receivedLine])
    } catch (err: any) {
      toast.error(err.message || 'Failed to receive items')
    }
  }

  const handleReceiveAll = async () => {
    if (!user?.id) return

    try {
      await receiveAllMutation.mutateAsync({ poId, userId: user.id, receiveDate })
      toast.success('All items received. Review pricing updates.')
      setIsReceiveAllDialogOpen(false)
      const remainingLines = (po.lines || []).filter(
        (line) => Number(line.quantity_received) < Number(line.quantity_ordered)
      )
      openPriceReview(remainingLines)
    } catch (err: any) {
      toast.error(err.message || 'Failed to receive all items')
    }
  }

  const handleApplyPriceReview = async () => {
    if (priceReviewItems.length === 0) {
      setIsPriceReviewOpen(false)
      return
    }

    setIsApplyingPriceReview(true)

    try {
      for (const item of priceReviewItems) {
        if (item.action === 'retain') continue

        if (item.action === 'accept') {
          await updateProductMutation.mutateAsync({
            id: item.productId,
            updates: { current_selling_price: item.proposedPrice },
          })
          continue
        }

        if (item.action === 'custom_price') {
          const customPrice = parseNumber(item.customPrice)
          if (customPrice <= 0) {
            throw new Error(`Invalid custom price for ${item.productName}`)
          }

          const markup = calculateMarkupPercentage(item.cogs, customPrice)

          await updateProductMutation.mutateAsync({
            id: item.productId,
            updates: {
              current_selling_price: customPrice,
              markup_percentage: markup,
            },
          })
          continue
        }

        if (item.action === 'custom_markup') {
          const customMarkup = parseNumber(item.customMarkup)
          if (customMarkup < 0) {
            throw new Error(`Invalid custom markup for ${item.productName}`)
          }

          const customPrice = calculateSellingPrice(item.cogs, customMarkup)

          await updateProductMutation.mutateAsync({
            id: item.productId,
            updates: {
              current_selling_price: customPrice,
              markup_percentage: customMarkup,
            },
          })
        }
      }

      toast.success('Pricing updates applied')
      setIsPriceReviewOpen(false)
      setPriceReviewItems([])
    } catch (err: any) {
      toast.error(err.message || 'Failed to apply pricing updates')
    } finally {
      setIsApplyingPriceReview(false)
    }
  }

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync(poId)
      toast.success('Purchase order cancelled')
      setIsCancelDialogOpen(false)
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel')
    }
  }

  const handleDelete = async () => {
    if (!user?.id) return
    try {
      await deleteMutation.mutateAsync({ id: poId, userId: user.id })
      toast.success('Purchase order deleted')
      setIsDeleteDialogOpen(false)
      router.push('/purchases')
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete')
    }
  }

  const handlePrint = () => {
    if (!poTemplateRef.current) return
    printElement(poTemplateRef.current, {
      title: `PO-${po.po_number}`,
      paperSize: 'a4',
    })
  }

  // Build PO data for print template
  const poData: POData = {
    po_number: po.po_number,
    po_date: po.po_date,
    expected_delivery_date: po.expected_delivery_date,
    branch: {
      name: (po.branch as any)?.name || '',
      address: (po.branch as any)?.address,
      phone: (po.branch as any)?.phone,
      email: (po.branch as any)?.email,
    },
    supplier: {
      name: (po.supplier as any)?.name || '',
      contact_person: (po.supplier as any)?.contact_person,
      phone: (po.supplier as any)?.phone,
      email: (po.supplier as any)?.email,
      address: (po.supplier as any)?.address,
      payment_terms: (po.supplier as any)?.payment_terms,
    },
    items: (po.lines || []).map(line => ({
      code: (line.product as any)?.code || '',
      name: (line.product as any)?.name || '',
      quantity: Number(line.quantity_ordered),
      uom: (line.uom as any)?.code || (line.uom as any)?.name || 'pc',
      unit_cost: Number(line.unit_cost),
      total: Number(line.quantity_ordered) * Number(line.unit_cost),
    })),
    total_amount: po.total_amount,
    notes: po.notes,
    prepared_by: (po.created_by_user as any)?.full_name || 'Staff',
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight font-mono">
                {po.po_number}
              </h1>
              <Badge variant={statusInfo.variant} className="flex items-center gap-1">
                <StatusIcon className="h-3 w-3" />
                {statusInfo.label}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Created on {formatDateTime(po.created_at)}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" />
            Print PO
          </Button>
          {canReceive && hasUnreceived && (
            <Button onClick={() => setIsReceiveAllDialogOpen(true)}>
              <PackagePlus className="mr-2 h-4 w-4" />
              Receive All
            </Button>
          )}
          {canCancel && (
            <Button variant="destructive" onClick={() => setIsCancelDialogOpen(true)}>
              <XCircle className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          )}
          {canDelete && (
            <Button variant="destructive" onClick={() => setIsDeleteDialogOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Order Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="text-sm text-muted-foreground">Supplier</div>
                      <div className="font-medium">{(po.supplier as any)?.name}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Package className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="text-sm text-muted-foreground">Receiving Branch</div>
                      <div className="font-medium">{(po.branch as any)?.name}</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="text-sm text-muted-foreground">Order Date</div>
                      <div className="font-medium">{formatDate(po.po_date)}</div>
                    </div>
                  </div>

                  {po.expected_delivery_date && (
                    <div className="flex items-center gap-3">
                      <Truck className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <div className="text-sm text-muted-foreground">Expected Delivery</div>
                        <div className="font-medium">{formatDate(po.expected_delivery_date)}</div>
                      </div>
                    </div>
                  )}

                  {po.actual_delivery_date && (
                    <div className="flex items-center gap-3">
                      <PackageCheck className="h-5 w-5 text-green-500" />
                      <div>
                        <div className="text-sm text-muted-foreground">Received On</div>
                        <div className="font-medium">{formatDate(po.actual_delivery_date)}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Receiving Progress */}
              {!isCompleted && (
                <div className="mt-6 pt-6 border-t">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Receiving Progress</span>
                    <span className="text-sm text-muted-foreground">
                      {totalReceived.toLocaleString()} / {totalOrdered.toLocaleString()} units
                    </span>
                  </div>
                  <Progress value={receivedPercentage} className="h-2" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card>
            <CardHeader>
              <CardTitle>Order Items</CardTitle>
              <CardDescription>
                {po.lines?.length || 0} items in this order
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg max-h-[60vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>UOM</TableHead>
                      <TableHead className="text-right">Ordered</TableHead>
                      <TableHead className="text-right">Received</TableHead>
                      <TableHead className="text-right">Unit Cost</TableHead>
                      <TableHead className="text-right">Line Total</TableHead>
                      {canReceive && <TableHead className="w-[100px]"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {po.lines?.map((line) => {
                      const ordered = Number(line.quantity_ordered)
                      const received = Number(line.quantity_received)
                      const isFullyReceived = received >= ordered

                      return (
                        <TableRow key={line.id}>
                          <TableCell>
                            <div>
                              <Link
                                href={`/products/${line.product_id}`}
                                className="font-medium hover:underline"
                              >
                                {(line.product as any)?.name}
                              </Link>
                              <div className="text-xs text-muted-foreground font-mono">
                                {(line.product as any)?.code}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{(line.uom as any)?.code}</TableCell>
                          <TableCell className="text-right">
                            {ordered.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span
                                className={
                                  isFullyReceived ? 'text-green-600' : received > 0 ? 'text-amber-600' : ''
                                }
                              >
                                {received.toLocaleString()}
                              </span>
                              {isFullyReceived && (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(line.unit_cost)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            {formatCurrency(ordered * Number(line.unit_cost))}
                          </TableCell>
                          {canReceive && (
                            <TableCell>
                              {!isFullyReceived && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenReceive(line)}
                                >
                                  Receive
                                </Button>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          {po.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground whitespace-pre-wrap">{po.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Order Total */}
          <Card>
            <CardHeader>
              <CardTitle>Order Total</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(() => {
                const deliveryCharge = Number((po as any).delivery_charge || 0)
                const subtotal = po.total_amount - deliveryCharge
                return (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Merchandise</span>
                      <span className="font-mono">{formatCurrency(subtotal)}</span>
                    </div>
                    {deliveryCharge > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Delivery Charge</span>
                        <span className="font-mono">+ {formatCurrency(deliveryCharge)}</span>
                      </div>
                    )}
                    <div className="border-t pt-3">
                      <div className="text-3xl font-bold font-mono">
                        {formatCurrency(po.total_amount)}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {po.lines?.length || 0} line items
                        {deliveryCharge > 0 && ' · delivery charge included in COGS'}
                      </p>
                    </div>
                  </>
                )
              })()}
            </CardContent>
          </Card>

          {/* Supplier Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Supplier Details</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="font-medium">{(po.supplier as any)?.name}</div>
              {(po.supplier as any)?.contact_person && (
                <div className="text-muted-foreground">
                  Contact: {(po.supplier as any)?.contact_person}
                </div>
              )}
              {(po.supplier as any)?.phone && (
                <div className="text-muted-foreground">
                  Phone: {(po.supplier as any)?.phone}
                </div>
              )}
              {(po.supplier as any)?.email && (
                <div className="text-muted-foreground">
                  Email: {(po.supplier as any)?.email}
                </div>
              )}
              {(po.supplier as any)?.payment_terms && (
                <div className="text-muted-foreground">
                  Terms: {(po.supplier as any)?.payment_terms}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Created By */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Created By</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>{(po.created_by_user as any)?.full_name || 'Unknown'}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {formatDateTime(po.created_at)}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Receive Line Dialog */}
      <Dialog open={isReceiveDialogOpen} onOpenChange={setIsReceiveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receive Items</DialogTitle>
            <DialogDescription>
              Enter the quantity received for this product
            </DialogDescription>
          </DialogHeader>
          {receivingLine && (
            <div className="space-y-4 py-4">
              <div>
                <div className="font-medium">{receivingLine.product?.name}</div>
                <div className="text-sm text-muted-foreground font-mono">
                  {receivingLine.product?.code}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Ordered</div>
                  <div className="font-medium">
                    {Number(receivingLine.quantity_ordered).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Already Received</div>
                  <div className="font-medium">
                    {Number(receivingLine.quantity_received).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Remaining</div>
                  <div className="font-medium text-amber-600">
                    {(
                      Number(receivingLine.quantity_ordered) -
                      Number(receivingLine.quantity_received)
                    ).toLocaleString()}
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="receiveQty">Quantity to Receive</Label>
                <Input
                  id="receiveQty"
                  type="number"
                  min="1"
                  max={
                    Number(receivingLine.quantity_ordered) -
                    Number(receivingLine.quantity_received)
                  }
                  value={receiveQuantity}
                  onChange={(e) => setReceiveQuantity(parseFloat(e.target.value) || 0)}
                />
              </div>

              <div className="bg-muted/50 p-3 rounded-lg text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Unit Cost (New COGS)</span>
                  <span className="font-mono">{formatCurrency(receivingLine.unit_cost)}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Total Value</span>
                  <span className="font-mono">
                    {formatCurrency(receiveQuantity * Number(receivingLine.unit_cost))}
                  </span>
                </div>
                {/* Price Impact Preview */}
                {receivingLine.product?.markup_percentage != null && (() => {
                  const currentPrice = Number(receivingLine.product?.current_selling_price || 0)
                  const cogs = calculateCogsFromLine(receivingLine)
                  const proposedPrice = calculateSellingPrice(
                    cogs,
                    Number(receivingLine.product.markup_percentage)
                  )

                  return (
                    <>
                      <Separator />
                      <div className="text-xs text-muted-foreground">Proposed price (requires approval):</div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">
                          {formatCurrency(currentPrice)}
                        </span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium text-green-600">
                          {formatCurrency(proposedPrice)}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {receivingLine.product.markup_percentage}% markup
                        </Badge>
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReceiveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleReceive}
              disabled={receiveMutation.isPending}
            >
              {receiveMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Receive Items
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receive All Confirmation */}
      <AlertDialog open={isReceiveAllDialogOpen} onOpenChange={setIsReceiveAllDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Receive All Items</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark all remaining items as received and update inventory and product
              pricing. Any price changes will be reviewed per item before applying.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            {po.lines && (
              <div className="text-sm space-y-2">
                <div className="font-medium">Items to receive:</div>
                {po.lines
                  .filter(l => Number(l.quantity_received) < Number(l.quantity_ordered))
                  .map(line => {
                    const remaining = Number(line.quantity_ordered) - Number(line.quantity_received)
                    const cogs = calculateCogsFromLine(line)
                    const newPrice = calculateSellingPrice(
                      cogs,
                      Number((line.product as any)?.markup_percentage || 0)
                    )
                    return (
                      <div key={line.id} className="flex items-center justify-between py-1 border-b last:border-0">
                        <div>
                          <span className="font-medium">{(line.product as any)?.name}</span>
                          <span className="text-muted-foreground ml-2">x{remaining}</span>
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          Current: {formatCurrency((line.product as any)?.current_selling_price || 0)}
                          <ArrowRight className="h-3 w-3" />
                          <span className="text-green-600 font-medium">Proposed {formatCurrency(newPrice)}</span>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="receiveDate">Actual Delivery Date *</Label>
              <Input
                id="receiveDate"
                type="date"
                value={receiveDate}
                onChange={(e) => setReceiveDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                This date will be recorded as when the items were actually received.
              </p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReceiveAll}
              disabled={receiveAllMutation.isPending}
            >
              {receiveAllMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PackagePlus className="mr-2 h-4 w-4" />
              )}
              Receive All Items
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pricing Review */}
      <Dialog
        open={isPriceReviewOpen}
        onOpenChange={(open) => {
          setIsPriceReviewOpen(open)
          if (!open) setPriceReviewItems([])
        }}
      >
        <DialogContent className="w-full max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Review Pricing Changes</DialogTitle>
            <DialogDescription>
              {priceReviewItems.length} item{priceReviewItems.length !== 1 ? 's' : ''} have proposed price changes. Choose how to update each selling price.
            </DialogDescription>
          </DialogHeader>

          {priceReviewItems.length > 0 && (
            <div className="shrink-0 flex items-center gap-2 px-1">
              <span className="text-xs text-muted-foreground mr-1">Bulk:</span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => setPriceReviewItems(priceReviewItems.map(i => ({ ...i, action: 'accept' as PriceReviewAction })))}
              >
                <CheckCheck className="h-3 w-3" /> Accept All
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => setPriceReviewItems(priceReviewItems.map(i => ({ ...i, action: 'retain' as PriceReviewAction })))}
              >
                <RotateCcw className="h-3 w-3" /> Retain All
              </Button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto min-h-0">
            {priceReviewItems.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">No price changes to review.</div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[35%]">Product</TableHead>
                      <TableHead className="text-right w-[12%]">Current</TableHead>
                      <TableHead className="text-right w-[12%]">Proposed</TableHead>
                      <TableHead className="text-right w-[10%]">Change</TableHead>
                      <TableHead className="w-[31%]">Decision</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {priceReviewItems.map((item, index) => {
                      const diff = item.proposedPrice - item.currentPrice
                      const pct = item.currentPrice > 0 ? (diff / item.currentPrice) * 100 : 0
                      const isIncrease = diff > 0
                      const isSame = diff === 0

                      // resolve final price for preview
                      let finalPrice = item.proposedPrice
                      if (item.action === 'retain') finalPrice = item.currentPrice
                      else if (item.action === 'custom_price') finalPrice = parseNumber(item.customPrice)
                      else if (item.action === 'custom_markup') finalPrice = calculateSellingPrice(item.cogs, parseNumber(item.customMarkup))

                      return (
                        <TableRow key={item.lineId} className={item.action === 'retain' ? 'opacity-60' : ''}>
                          <TableCell>
                            <div className="font-medium text-sm">{item.productName}</div>
                            <div className="text-xs text-muted-foreground">
                              COGS: {formatCurrency(item.cogs)}
                              {finalPrice > 0 && (
                                <span className="ml-2 text-foreground/70">
                                  → Final: <span className="font-semibold">{formatCurrency(finalPrice)}</span>
                                  {item.cogs > 0 && <span className="ml-1">({calculateMarkupPercentage(item.cogs, finalPrice).toFixed(1)}% markup)</span>}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatCurrency(item.currentPrice)}
                          </TableCell>
                          <TableCell className={`text-right font-mono text-sm font-medium ${isIncrease ? 'text-green-600' : isSame ? 'text-muted-foreground' : 'text-amber-600'}`}>
                            {formatCurrency(item.proposedPrice)}
                          </TableCell>
                          <TableCell className="text-right">
                            {isSame ? (
                              <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"><Minus className="h-3 w-3" /> —</span>
                            ) : isIncrease ? (
                              <span className="inline-flex items-center gap-0.5 text-xs text-green-600 font-medium">
                                <TrendingUp className="h-3 w-3" />+{pct.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 text-xs text-amber-600 font-medium">
                                <TrendingDown className="h-3 w-3" />{pct.toFixed(1)}%
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-2">
                              {/* Action buttons */}
                              <div className="flex gap-1 flex-wrap">
                                {(['accept', 'retain', 'custom_price', 'custom_markup'] as PriceReviewAction[]).map((action) => {
                                  const labels: Record<PriceReviewAction, string> = {
                                    accept: 'Accept',
                                    retain: 'Retain',
                                    custom_price: 'Custom ₱',
                                    custom_markup: 'Custom %',
                                  }
                                  return (
                                    <button
                                      key={action}
                                      onClick={() => updateReviewItem(index, { action })}
                                      className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                                        item.action === action
                                          ? action === 'accept'
                                            ? 'bg-green-600 border-green-600 text-white'
                                            : action === 'retain'
                                            ? 'bg-muted border-border text-foreground'
                                            : 'bg-primary border-primary text-primary-foreground'
                                          : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
                                      }`}
                                    >
                                      {labels[action]}
                                    </button>
                                  )
                                })}
                              </div>
                              {/* Custom inputs inline */}
                              {item.action === 'custom_price' && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">₱</span>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    className="h-7 w-28 text-sm"
                                    value={item.customPrice}
                                    onChange={(e) => updateReviewItem(index, { customPrice: e.target.value })}
                                  />
                                </div>
                              )}
                              {item.action === 'custom_markup' && (
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    className="h-7 w-20 text-sm"
                                    value={item.customMarkup}
                                    onChange={(e) => updateReviewItem(index, { customMarkup: e.target.value })}
                                  />
                                  <span className="text-xs text-muted-foreground">% markup</span>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 border-t pt-4">
            <Button variant="outline" onClick={() => setIsPriceReviewOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleApplyPriceReview} disabled={isApplyingPriceReview}>
              {isApplyingPriceReview && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Apply Pricing Updates
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation */}
      <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Purchase Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this purchase order? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="mr-2 h-4 w-4" />
              )}
              Yes, cancel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Purchase Order</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the purchase order and its lines. Deletion is allowed
              only when no items have been received.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hidden PO Print Template */}
      <div className="hidden">
        <POTemplate ref={poTemplateRef} data={poData} logoUrl={logoUrl} />
      </div>
    </div>
  )
}
