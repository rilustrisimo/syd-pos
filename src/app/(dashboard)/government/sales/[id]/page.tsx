'use client'

import { useRef, useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Printer, Loader2, CreditCard, Trash2, Truck, Pencil, X, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/stores/auth'
import { useGovernmentTransaction, useRecordGovernmentPayment, useDeleteGovernmentSale, useDeliverGovernmentSale, useUpdateGovernmentSale } from '@/hooks/useGovernmentTransactions'
import { usePOSProductSearch } from '@/hooks/useTransactions'
import { GovernmentInvoiceTemplate } from '@/components/print/government-invoice-template'
import type { GovInvoiceData } from '@/components/print/government-invoice-template'
import { printElement } from '@/lib/utils/print'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

function fmt(n: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(n)
}

const paymentMethodLabels: Record<string, string> = {
  cash: 'Cash',
  gcash: 'GCash',
  maya: 'Maya',
  bank_transfer: 'Bank Transfer',
  credit: 'Credit / AR',
  government_withholding: "Gov't Withholding",
}

const statusConfig = {
  paid:    { label: 'Paid',    variant: 'default'      as const },
  partial: { label: 'Partial', variant: 'secondary'    as const },
  unpaid:  { label: 'Unpaid',  variant: 'destructive'  as const },
}

export default function GovernmentSaleDetail() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuthStore()
  const templateRef = useRef<HTMLDivElement>(null)

  const { data: txn, isLoading } = useGovernmentTransaction(id)
  const recordPayment = useRecordGovernmentPayment()
  const deleteSale = useDeleteGovernmentSale()
  const deliverSale = useDeliverGovernmentSale()
  const updateSale = useUpdateGovernmentSale()

  // Payment modal state
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [chequeAmount, setChequeAmount] = useState('')
  const [chequeMethod, setChequeMethod] = useState<'bank_transfer' | 'cash'>('bank_transfer')
  const [chequeRef, setChequeRef] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deliverOpen, setDeliverOpen] = useState(false)

  // Edit mode state
  const [editMode, setEditMode] = useState(false)
  const [editAgency, setEditAgency] = useState('')
  const [editPoNumber, setEditPoNumber] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editWithholdingRate, setEditWithholdingRate] = useState(5)
  const [editSaleDate, setEditSaleDate] = useState('')
  const [editItems, setEditItems] = useState<any[]>([])
  const [productSearch, setProductSearch] = useState('')
  const branchId = (txn as any)?.branch_id || ''
  const { data: searchResults = [] } = usePOSProductSearch(productSearch, branchId)

  function enterEditMode() {
    if (!txn) return
    const t = txn as any
    setEditAgency(t.government_agency || '')
    setEditPoNumber(t.po_number || '')
    setEditNotes(t.notes || '')
    setEditWithholdingRate(t.withholding_rate || 5)
    setEditSaleDate(t.transaction_date?.slice(0, 10) || '')
    setEditItems((t.lines || []).map((l: any) => ({
      id: l.id,
      product_id: l.product_id,
      product_code: l.product?.code || '',
      product_name: l.product?.name || '',
      variant_id: l.variant_id || null,
      quantity: l.quantity,
      uom_id: l.uom_id,
      uom_name: l.uom?.code || l.uom?.name || 'pc',
      unit_price: l.unit_price,
      cogs_per_unit: l.cogs_per_unit || 0,
      discount_amount: l.discount_amount || 0,
    })))
    setProductSearch('')
    setEditMode(true)
  }

  function cancelEditMode() {
    setEditMode(false)
    setProductSearch('')
  }

  function addProductToEdit(product: any) {
    const existing = editItems.find(
      i => i.product_id === product.id && i.uom_id === (product.selling_uom_id || product.uom_id)
    )
    if (existing) {
      setEditItems(prev => prev.map(i =>
        i === existing ? { ...i, quantity: Math.round((i.quantity + 1) * 100) / 100 } : i
      ))
    } else {
      setEditItems(prev => [...prev, {
        id: `new-${Date.now()}`,
        product_id: product.id,
        product_code: product.code || '',
        product_name: product.name,
        variant_id: null,
        quantity: 1,
        uom_id: product.selling_uom_id || product.uom_id,
        uom_name: product.selling_uom_abbreviation || product.uom_abbreviation || 'pc',
        unit_price: product.unit_price || 0,
        cogs_per_unit: product.cogs || 0,
        discount_amount: 0,
      }])
    }
    setProductSearch('')
  }

  const editGrossTotal = editItems.reduce((s, i) => s + Math.round((i.quantity * i.unit_price - i.discount_amount) * 100) / 100, 0)
  const editWithholding = Math.round(((txn as any)?.total_amount || 0) * editWithholdingRate / 100 * 100) / 100

  async function handleSaveEdit() {
    if (!txn) return
    if (editItems.length === 0) { toast.error('Add at least one item'); return }
    try {
      await updateSale.mutateAsync({
        transactionId: (txn as any).id,
        header: {
          government_agency: editAgency,
          po_number: editPoNumber || null,
          notes: editNotes || null,
          withholding_rate: editWithholdingRate,
          withholding_amount: editWithholding,
          subtotal: editGrossTotal,
          total_amount: (txn as any).total_amount || 0,
          transaction_date: editSaleDate,
        },
        lines: editItems.map(i => ({
          product_id: i.product_id,
          variant_id: i.variant_id,
          quantity: i.quantity,
          uom_id: i.uom_id,
          unit_price: i.unit_price,
          cogs_per_unit: i.cogs_per_unit,
          discount_amount: i.discount_amount,
        })),
      })
      toast.success('Sale updated successfully')
      setEditMode(false)
    } catch (err: any) {
      toast.error(err.message || 'Failed to save changes')
    }
  }

  function buildInvoiceData(t: any): GovInvoiceData {
    const gross = t.total_amount || 0
    const withholding = t.withholding_amount || 0
    const paid = t.amount_paid || 0
    const net = gross - withholding
    return {
      transaction_number: t.transaction_number,
      date: t.transaction_date,
      time: '',
      branch: t.branch?.name || '',
      cashier: user?.fullName || user?.email || null,
      government_agency: t.government_agency || t.customer?.name || '',
      po_number: t.po_number || null,
      contact_person: null,
      customer: {
        name: t.customer?.name || '',
        phone: t.customer?.phone || null,
        address: null,
      },
      items: (t.lines || []).map((l: any) => ({
        code: l.product?.code || null,
        name: l.product?.name || '—',
        quantity: l.quantity,
        uom: l.uom?.code || l.uom?.name || 'pc',
        unit_price: l.unit_price,
        discount: l.discount_amount || 0,
        total: l.quantity * l.unit_price,
      })),
      subtotal: (t.lines || []).reduce((s: number, l: any) => s + l.quantity * l.unit_price, 0),
      discount: t.discount_amount || 0,
      delivery_fee: t.delivery_fee || 0,
      other_fees: t.other_fees || 0,
      other_fees_notes: t.other_fees_notes || null,
      gross_total: gross,
      withholding_rate: t.withholding_rate || 0,
      withholding_amount: withholding,
      net_receivable: net,
      payments: (t.payments || []).map((p: any) => ({
        method: p.payment_method,
        amount: p.amount,
        reference: p.reference_number || null,
        date: p.payment_date || null,
      })),
      amount_paid: paid,
      balance_due: Math.max(0, net - paid),
      payment_status: t.payment_status,
      notes: t.notes || null,
    }
  }

  function handlePrint() {
    if (!templateRef.current) return
    printElement(templateRef.current, {
      title: `Government Invoice ${txn?.transaction_number || ''}`,
      paperSize: 'a4',
    })
  }

  async function handleDeliver() {
    if (!txn) return
    try {
      await deliverSale.mutateAsync({ transactionId: (txn as any).id, userId: user?.id || '' })
      toast.success('Sale marked as delivered. Inventory has been updated.')
    } catch (err: any) {
      toast.error(err.message || 'Failed to mark as delivered')
    }
    setDeliverOpen(false)
  }

  async function handleDelete() {
    if (!txn) return
    const isDelivered = (txn as any).is_delivered
    try {
      await deleteSale.mutateAsync({ transactionId: (txn as any).id, userId: user?.id || '' })
      toast.success(isDelivered ? 'Sale deleted and inventory reversed.' : 'Sale deleted.')
      router.push('/government/sales')
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete sale')
    }
    setDeleteOpen(false)
  }

  async function handleRecordPayment() {
    if (!txn) return
    const amount = parseFloat(chequeAmount)
    if (!amount || amount <= 0) { toast.error('Enter a valid cheque amount'); return }
    if (!chequeRef.trim()) { toast.error('Enter a cheque / reference number'); return }

    try {
      await recordPayment.mutateAsync({
        transactionId: txn.id,
        netChequeAmount: amount,
        chequeMethod,
        referenceNumber: chequeRef,
        userId: user?.id || '',
      })
      toast.success('Payment recorded successfully!')
      setPaymentOpen(false)
      setChequeAmount('')
      setChequeRef('')
    } catch (err: any) {
      toast.error(err.message || 'Failed to record payment')
    }
  }

  if (isLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  if (!txn) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Transaction not found.</p>
        <Link href="/government/sales"><Button variant="link">Back to sales</Button></Link>
      </div>
    )
  }

  const t = txn as any
  const isDelivered: boolean = t.is_delivered || false
  const poAmount = t.total_amount || 0
  const itemsTotal = t.subtotal || 0
  const withholding = t.withholding_amount || 0
  const withholdingRate = t.withholding_rate || 0
  const chequeExpected = poAmount - withholding
  const spread = chequeExpected - itemsTotal
  const paid = t.amount_paid || 0
  const balanceDue = Math.max(0, poAmount - paid)
  const status = statusConfig[t.payment_status as keyof typeof statusConfig] || statusConfig.unpaid

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/government/sales">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{t.transaction_number}</h1>
              <Badge variant={status.variant}>{status.label}</Badge>
              <Badge variant={isDelivered ? 'default' : 'secondary'} className={isDelivered ? 'bg-green-600' : ''}>
                {isDelivered ? 'Delivered' : 'Pending Delivery'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{t.transaction_date?.slice(0, 10)} · {t.government_agency || t.customer?.name}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4 mr-1" />Delete
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />Print Invoice
          </Button>
          {!isDelivered && !editMode && (
            <Button onClick={enterEditMode} variant="outline" size="sm">
              <Pencil className="h-4 w-4 mr-1" />Edit Sale
            </Button>
          )}
          {editMode && (
            <Button onClick={cancelEditMode} variant="outline" size="sm">
              <X className="h-4 w-4 mr-1" />Cancel
            </Button>
          )}
          {!isDelivered && !editMode && (
            <Button onClick={() => setDeliverOpen(true)} variant="outline" className="text-green-700 border-green-600 hover:bg-green-50">
              <Truck className="h-4 w-4 mr-1" />Mark as Delivered
            </Button>
          )}
          {t.payment_status !== 'paid' && (
            <Button onClick={() => setPaymentOpen(true)}>
              <CreditCard className="h-4 w-4 mr-2" />Record Cheque
            </Button>
          )}
        </div>
      </div>

      {/* Transaction Info */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Transaction Info</CardTitle>
          {editMode && <span className="text-xs text-amber-600 font-medium">Editing — unsaved changes</span>}
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <Label className="text-muted-foreground text-xs">Government Agency</Label>
            {editMode
              ? <Input className="mt-1 h-8 text-sm" value={editAgency} onChange={e => setEditAgency(e.target.value)} />
              : <p className="font-semibold mt-0.5">{t.government_agency || '—'}</p>}
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">PO Number</Label>
            {editMode
              ? <Input className="mt-1 h-8 text-sm" value={editPoNumber} onChange={e => setEditPoNumber(e.target.value)} placeholder="e.g. PO-2026-001" />
              : <p className="font-semibold mt-0.5">{t.po_number || <span className="text-muted-foreground italic text-xs">Not assigned</span>}</p>}
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">Sale Date</Label>
            {editMode
              ? <Input type="date" className="mt-1 h-8 text-sm" value={editSaleDate} onChange={e => setEditSaleDate(e.target.value)} />
              : <p className="font-semibold mt-0.5">{t.transaction_date?.slice(0, 10) || '—'}</p>}
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">Withholding Rate (%)</Label>
            {editMode
              ? <Input type="number" className="mt-1 h-8 text-sm" value={editWithholdingRate} onChange={e => setEditWithholdingRate(Number(e.target.value))} min={0} max={100} step="0.01" />
              : <p className="font-semibold mt-0.5">{t.withholding_rate}%</p>}
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Customer Account</span>
            <p className="font-semibold mt-0.5">{t.customer?.name || '—'}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Branch</span>
            <p className="font-semibold mt-0.5">{t.branch?.name || '—'}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Canvass Reference</span>
            {t.canvas_id ? (
              <Link href={`/government/canvass/${t.canvas_id}`} className="block font-semibold mt-0.5 text-blue-600 hover:underline text-sm">
                View linked canvass
              </Link>
            ) : (
              <p className="text-muted-foreground italic text-xs mt-0.5">None</p>
            )}
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Delivery Status</span>
            {isDelivered ? (
              <p className="font-semibold mt-0.5 text-green-700">
                Delivered {t.delivered_at ? `on ${t.delivered_at.slice(0, 10)}` : ''}
              </p>
            ) : (
              <p className="text-amber-600 font-semibold mt-0.5">Pending Delivery — inventory not yet moved</p>
            )}
          </div>
          <div className="col-span-2">
            <Label className="text-muted-foreground text-xs">Notes</Label>
            {editMode
              ? <Input className="mt-1 h-8 text-sm" value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Optional notes" />
              : <p className="mt-0.5">{t.notes || <span className="text-muted-foreground italic text-xs">None</span>}</p>}
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Items</CardTitle>
          {editMode && (
            <Button onClick={handleSaveEdit} disabled={updateSale.isPending} size="sm" className="bg-green-600 hover:bg-green-700">
              {updateSale.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Save Changes
            </Button>
          )}
        </CardHeader>

        {/* Product search (edit mode only) */}
        {editMode && (
          <div className="px-6 pb-3 relative">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8 h-9"
                placeholder="Search product to add…"
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
              />
            </div>
            {productSearch.length >= 2 && searchResults.length > 0 && (
              <div className="absolute z-50 left-6 right-6 top-full mt-1 bg-white border rounded-md shadow-lg max-h-56 overflow-y-auto">
                {searchResults.map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => addProductToEdit(p)}
                    className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex justify-between items-center gap-2"
                  >
                    <span>
                      {p.code && <span className="font-mono text-xs text-muted-foreground mr-1.5">{p.code}</span>}
                      {p.name}
                    </span>
                    <span className="text-muted-foreground text-xs shrink-0">{fmt(p.unit_price || 0)} / {p.selling_uom_abbreviation || p.uom_abbreviation || 'pc'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-center w-24">Qty</TableHead>
                <TableHead className="text-center w-16">Unit</TableHead>
                <TableHead className="text-right w-32">Unit Price</TableHead>
                <TableHead className="text-right w-28">Amount</TableHead>
                {editMode && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(editMode ? editItems : (t.lines || [])).map((line: any) => (
                <TableRow key={line.id}>
                  <TableCell>
                    {(line.product?.code || line.product_code) && <span className="font-mono text-xs text-muted-foreground mr-1.5">{line.product?.code || line.product_code}</span>}
                    {line.product?.name || line.product_name || '—'}
                  </TableCell>
                  <TableCell className="text-center">
                    {editMode
                      ? <Input
                          type="number"
                          className="h-7 text-sm text-center w-20 mx-auto"
                          value={line.quantity}
                          min={0.01}
                          step="any"
                          onChange={e => setEditItems(prev => prev.map(i => i.id === line.id ? { ...i, quantity: Number(e.target.value) } : i))}
                        />
                      : line.quantity}
                  </TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">{line.uom?.code || line.uom?.name || line.uom_name || 'pc'}</TableCell>
                  <TableCell className="text-right">
                    {editMode
                      ? <Input
                          type="number"
                          className="h-7 text-sm text-right w-28 ml-auto"
                          value={line.unit_price}
                          min={0}
                          step="any"
                          onChange={e => setEditItems(prev => prev.map(i => i.id === line.id ? { ...i, unit_price: Number(e.target.value) } : i))}
                        />
                      : fmt(line.unit_price)}
                  </TableCell>
                  <TableCell className="text-right font-medium">{fmt(line.quantity * line.unit_price)}</TableCell>
                  {editMode && (
                    <TableCell>
                      <button onClick={() => setEditItems(prev => prev.filter(i => i.id !== line.id))} className="text-muted-foreground hover:text-destructive p-1">
                        <X className="h-4 w-4" />
                      </button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Totals breakdown */}
          <div className="flex justify-end p-4">
            <div className="w-72 space-y-1.5 text-sm">
              {/* PO billing section */}
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Billing (PO)</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">PO / Canvass Amount</span>
                <span className="font-semibold">{fmt(poAmount)}</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span>Withholding ({withholdingRate}% of PO)</span>
                <span>−{fmt(withholding)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-bold text-base text-blue-700">
                <span>Cheque Expected</span>
                <span>{fmt(chequeExpected)}</span>
              </div>
              <Separator />
              {/* Actual items + spread */}
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">Actual Sale</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Items Total</span>
                <span className="font-semibold">{fmt(itemsTotal)}</span>
              </div>
              <div className={`flex justify-between font-semibold ${spread >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                <span>{spread >= 0 ? 'Spread (Profit / Commission)' : 'Shortfall'}</span>
                <span>{spread >= 0 ? '+' : ''}{fmt(spread)}</span>
              </div>
              <Separator />
              {/* Payment status */}
              <div className="flex justify-between"><span className="text-muted-foreground">Amount Paid</span><span>{fmt(paid)}</span></div>
              <div className="flex justify-between font-bold">
                <span>Balance Due</span>
                <span className={balanceDue > 0 ? 'text-destructive' : 'text-green-600'}>{fmt(balanceDue)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payments */}
      {(t.payments || []).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Payments Received</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {t.payments.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell>{paymentMethodLabels[p.payment_method] || p.payment_method}</TableCell>
                    <TableCell className="font-mono text-sm">{p.reference_number || '—'}</TableCell>
                    <TableCell>{p.payment_date?.slice(0, 10)}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(p.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Hidden print template */}
      <div className="hidden">
        <GovernmentInvoiceTemplate
          ref={templateRef}
          data={buildInvoiceData(t)}
          logoUrl={typeof window !== 'undefined' ? window.location.origin + '/syd-logo.svg' : undefined}
        />
      </div>

      {/* Record payment dialog */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Cheque Payment</DialogTitle>
            <DialogDescription>
              Enter the cheque amount received. The system will automatically add a withholding entry of {fmt(withholding)} to settle the PO balance.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">PO / Canvass Amount</span><span>{fmt(poAmount)}</span></div>
              <div className="flex justify-between text-red-600"><span>Withholding ({withholdingRate}% of PO)</span><span>−{fmt(withholding)}</span></div>
              <Separator className="my-1" />
              <div className="flex justify-between font-bold"><span>Expected Cheque</span><span className="text-blue-700">{fmt(chequeExpected)}</span></div>
            </div>
            <div className="space-y-1.5">
              <Label>Cheque Amount Received <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                value={chequeAmount}
                onChange={e => setChequeAmount(e.target.value)}
                placeholder={`Expected: ${fmt(chequeExpected)}`}
                min={0}
                step="any"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Payment Method</Label>
              <Select value={chequeMethod} onValueChange={v => setChequeMethod(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank Transfer / Cheque</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cheque / Reference Number <span className="text-destructive">*</span></Label>
              <Input
                value={chequeRef}
                onChange={e => setChequeRef(e.target.value)}
                placeholder="e.g. CHK-2026-001234"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>Cancel</Button>
            <Button onClick={handleRecordPayment} disabled={recordPayment.isPending}>
              {recordPayment.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deliver confirmation */}
      <AlertDialog open={deliverOpen} onOpenChange={setDeliverOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Delivery?</AlertDialogTitle>
            <AlertDialogDescription>
              Marking <strong>{t.transaction_number}</strong> as delivered will immediately deduct the sold items from branch inventory.
              This cannot be undone without deleting the sale.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeliver}
              disabled={deliverSale.isPending}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              {deliverSale.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm Delivery
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Government Sale?</AlertDialogTitle>
            <AlertDialogDescription>
              {isDelivered
                ? <>This will permanently delete <strong>{t.transaction_number}</strong> and reverse all inventory movements. This cannot be undone.</>
                : <>This will permanently delete <strong>{t.transaction_number}</strong>. No inventory was moved (goods not yet delivered), so no reversal is needed.</>
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteSale.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSale.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete Sale
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
