'use client'

import { useState } from 'react'
import { use } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import {
  ArrowLeft,
  Loader2,
  CreditCard,
  FileText,
  Building2,
  Calendar,
  Receipt,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { usePayableById, useRecordPayablePayment } from '@/hooks/useLiabilities'
import { useAuthStore } from '@/lib/stores/auth'
import { formatCurrency, formatDate } from '@/lib/utils/formatting'

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'gcash', label: 'GCash' },
  { value: 'maya', label: 'Maya' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'credit', label: 'Credit' },
]

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    paid: { label: 'Paid', className: 'bg-green-100 text-green-700 border-green-200' },
    partial: { label: 'Partial', className: 'bg-blue-100 text-blue-700 border-blue-200' },
    unpaid: { label: 'Unpaid', className: 'bg-amber-100 text-amber-700 border-amber-200' },
    overdue: { label: 'Overdue', className: 'bg-red-100 text-red-700 border-red-200' },
  }
  const s = map[status] ?? { label: status, className: '' }
  return <Badge variant="outline" className={s.className}>{s.label}</Badge>
}

export default function PayableDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const user = useAuthStore(state => state.user)
  const userId = user?.id ?? ''

  const { data: payable, isLoading } = usePayableById(id)
  const paymentMutation = useRecordPayablePayment()

  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'bank_transfer',
    reference_number: '',
    notes: '',
  })

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!payable) return
    const amount = parseFloat(paymentForm.amount)
    if (isNaN(amount) || amount <= 0) { toast.error('Amount must be greater than zero'); return }

    await toast.promise(
      paymentMutation.mutateAsync({
        payable_id: payable.id,
        amount,
        payment_date: paymentForm.payment_date,
        payment_method: paymentForm.payment_method as Parameters<typeof paymentMutation.mutateAsync>[0]['payment_method'],
        reference_number: paymentForm.reference_number || null,
        notes: paymentForm.notes || null,
        created_by: userId,
      }),
      { loading: 'Recording payment...', success: 'Payment recorded', error: (e) => e.message }
    )
    setPaymentOpen(false)
    setPaymentForm({ amount: '', payment_date: new Date().toISOString().split('T')[0], payment_method: 'bank_transfer', reference_number: '', notes: '' })
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!payable) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Payable not found
      </div>
    )
  }

  const progressPct = payable.total_amount > 0
    ? Math.min(100, (payable.paid_amount / payable.total_amount) * 100)
    : 0

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="flex items-start gap-4">
        <Link href="/liabilities/payables">
          <Button variant="ghost" size="icon" className="-ml-2">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{payable.payable_number}</h1>
            <StatusBadge status={payable.status} />
          </div>
          <p className="text-muted-foreground mt-1">
            {payable.supplier?.name} — {payable.description || 'Trade payable'}
          </p>
        </div>
        {payable.status !== 'paid' && (
          <Button onClick={() => {
            setPaymentForm(f => ({ ...f, amount: payable.balance.toFixed(2) }))
            setPaymentOpen(true)
          }}>
            <CreditCard className="mr-2 h-4 w-4" /> Record Payment
          </Button>
        )}
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">Total Amount</p>
            <p className="text-xl font-bold">{formatCurrency(payable.total_amount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">Amount Paid</p>
            <p className="text-xl font-bold text-green-600">{formatCurrency(payable.paid_amount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">Balance Due</p>
            <p className="text-xl font-bold text-amber-600">{formatCurrency(payable.balance)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">Due Date</p>
            <p className="text-xl font-bold">{formatDate(payable.due_date)}</p>
            {payable.days_until_due < 0 && (
              <p className="text-xs text-red-600 font-medium">{Math.abs(payable.days_until_due)} days overdue</p>
            )}
            {payable.days_until_due >= 0 && (
              <p className="text-xs text-muted-foreground">{payable.days_until_due} days left</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Progress bar */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium">Payment Progress</span>
            <span className="text-muted-foreground">{progressPct.toFixed(1)}% paid</span>
          </div>
          <div className="w-full bg-muted rounded-full h-3">
            <div
              className="h-3 rounded-full bg-green-500 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" /> Payable Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Supplier</span>
              <span className="font-medium">{payable.supplier?.name ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Invoice Reference</span>
              <span className="font-mono">{payable.invoice_reference ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Invoice Date</span>
              <span>{formatDate(payable.invoice_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Credit Terms</span>
              <span>Net {payable.credit_days} days</span>
            </div>
            {payable.notes && (
              <div>
                <span className="text-muted-foreground block mb-1">Notes</span>
                <p className="text-sm">{payable.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Linked POs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Linked Purchase Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            {payable.po_links.length === 0 ? (
              <p className="text-sm text-muted-foreground">No POs linked</p>
            ) : (
              <div className="space-y-2">
                {payable.po_links.map(link => (
                  <div key={link.id} className="flex items-center justify-between rounded border p-3 text-sm">
                    <div>
                      <Link
                        href={`/purchases/${link.po_id}`}
                        className="font-mono font-medium hover:underline"
                      >
                        {link.purchase_order?.po_number ?? link.po_id}
                      </Link>
                      {link.notes && <p className="text-xs text-muted-foreground mt-0.5">{link.notes}</p>}
                    </div>
                    <div className="text-right">
                      {link.amount && <p className="font-medium">{formatCurrency(link.amount)}</p>}
                      {link.purchase_order && (
                        <Badge variant="outline" className="text-xs">{link.purchase_order.status}</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payment History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-4 w-4" /> Payment History
          </CardTitle>
          <CardDescription>{payable.payments.length} payment{payable.payments.length !== 1 ? 's' : ''} recorded</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {payable.payments.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No payments yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Recorded By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payable.payments
                  .slice()
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .map(payment => (
                    <TableRow key={payment.id}>
                      <TableCell>{formatDate(payment.payment_date)}</TableCell>
                      <TableCell className="capitalize">{payment.payment_method.replace('_', ' ')}</TableCell>
                      <TableCell className="font-mono text-sm">{payment.reference_number ?? '—'}</TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        {formatCurrency(payment.amount)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {payment.created_user?.full_name ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Payment Dialog */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              {payable.payable_number} — Balance: {formatCurrency(payable.balance)}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePayment}>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Amount (₱) *</Label>
                  <NumericInput min="0.01" step="0.01" value={paymentForm.amount} onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label>Payment Date *</Label>
                  <Input type="date" value={paymentForm.payment_date} onChange={e => setPaymentForm(f => ({ ...f, payment_date: e.target.value }))} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Payment Method *</Label>
                <Select value={paymentForm.payment_method} onValueChange={v => setPaymentForm(f => ({ ...f, payment_method: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reference / Check No.</Label>
                <Input placeholder="Bank ref, check number, etc." value={paymentForm.reference_number} onChange={e => setPaymentForm(f => ({ ...f, reference_number: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea rows={2} value={paymentForm.notes} onChange={e => setPaymentForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPaymentOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={paymentMutation.isPending}>
                {paymentMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Record Payment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
