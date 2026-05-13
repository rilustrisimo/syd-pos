'use client'

import { useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Printer, Loader2, CreditCard, Trash2, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/stores/auth'
import { useGovernmentTransaction, useRecordGovernmentPayment, useDeleteGovernmentSale, useDeliverGovernmentSale } from '@/hooks/useGovernmentTransactions'
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

  // Payment modal state
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [chequeAmount, setChequeAmount] = useState('')
  const [chequeMethod, setChequeMethod] = useState<'bank_transfer' | 'cash'>('bank_transfer')
  const [chequeRef, setChequeRef] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deliverOpen, setDeliverOpen] = useState(false)

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
          {!isDelivered && (
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

      {/* Agency info */}
      <Card>
        <CardHeader><CardTitle className="text-base">Transaction Info</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Government Agency</span>
            <p className="font-semibold mt-0.5">{t.government_agency || '—'}</p>
          </div>
          <div>
            <span className="text-muted-foreground">PO Number</span>
            <p className="font-semibold mt-0.5">{t.po_number || <span className="text-muted-foreground italic text-xs">Not assigned</span>}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Customer Account</span>
            <p className="font-semibold mt-0.5">{t.customer?.name || '—'}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Branch</span>
            <p className="font-semibold mt-0.5">{t.branch?.name || '—'}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Canvass Reference</span>
            {t.canvas_id ? (
              <Link href={`/government/canvass/${t.canvas_id}`} className="block font-semibold mt-0.5 text-blue-600 hover:underline text-sm">
                View linked canvass
              </Link>
            ) : (
              <p className="text-muted-foreground italic text-xs mt-0.5">None</p>
            )}
          </div>
          <div>
            <span className="text-muted-foreground">Delivery Status</span>
            {isDelivered ? (
              <p className="font-semibold mt-0.5 text-green-700">
                Delivered {t.delivered_at ? `on ${t.delivered_at.slice(0, 10)}` : ''}
              </p>
            ) : (
              <p className="text-amber-600 font-semibold mt-0.5">Pending Delivery — inventory not yet moved</p>
            )}
          </div>
          {t.notes && (
            <div className="col-span-2">
              <span className="text-muted-foreground">Notes</span>
              <p className="mt-0.5">{t.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader><CardTitle className="text-base">Items</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-center">Qty</TableHead>
                <TableHead className="text-center">Unit</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(t.lines || []).map((line: any) => (
                <TableRow key={line.id}>
                  <TableCell>
                    {line.product?.code && <span className="font-mono text-xs text-muted-foreground mr-1.5">{line.product.code}</span>}
                    {line.product?.name || '—'}
                  </TableCell>
                  <TableCell className="text-center">{line.quantity}</TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">{line.uom?.code || line.uom?.name || 'pc'}</TableCell>
                  <TableCell className="text-right">{fmt(line.unit_price)}</TableCell>
                  <TableCell className="text-right font-medium">{fmt(line.quantity * line.unit_price)}</TableCell>
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
