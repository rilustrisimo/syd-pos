'use client'

import { useState } from 'react'
import { use } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  Download,
  Banknote,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Bell,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { useLoanById, useRecordLoanPayment } from '@/hooks/useLiabilities'
import { useAuthStore } from '@/lib/stores/auth'
import { formatCurrency, formatDate } from '@/lib/utils/formatting'
import { RATE_TYPE_LABELS, type RateType } from '@/lib/utils/amortization'
import type { LiabilityLoanScheduleRow } from '@/types/database'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'gcash', label: 'GCash' },
  { value: 'maya', label: 'Maya' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'credit', label: 'Credit' },
]

const TODAY = new Date().toISOString().split('T')[0]

function isDueToday(dueDate: string) {
  return dueDate === TODAY
}

function InstallmentStatusIcon({ status, dueDate }: { status: string; dueDate: string }) {
  if (status === 'paid') return <CheckCircle2 className="h-4 w-4 text-green-500" />
  if (status === 'overdue') return <AlertTriangle className="h-4 w-4 text-red-500" />
  if (status === 'partial') return <Clock className="h-4 w-4 text-blue-500" />
  if (isDueToday(dueDate)) return <Bell className="h-4 w-4 text-orange-500" />
  return <Clock className="h-4 w-4 text-muted-foreground" />
}

function InstallmentBadge({ status, dueDate }: { status: string; dueDate: string }) {
  if (status === 'upcoming' && isDueToday(dueDate)) {
    return <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-200">Due Today</Badge>
  }
  const map: Record<string, { label: string; className: string }> = {
    paid: { label: 'Paid', className: 'bg-green-100 text-green-700 border-green-200' },
    partial: { label: 'Partial', className: 'bg-blue-100 text-blue-700 border-blue-200' },
    upcoming: { label: 'Upcoming', className: 'bg-slate-100 text-slate-700 border-slate-200' },
    overdue: { label: 'Overdue', className: 'bg-red-100 text-red-700 border-red-200' },
  }
  const s = map[status] ?? { label: status, className: '' }
  return <Badge variant="outline" className={s.className}>{s.label}</Badge>
}

export default function LoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const user = useAuthStore(state => state.user)
  const userId = user?.id ?? ''

  const { data: loan, isLoading } = useLoanById(id)
  const paymentMutation = useRecordLoanPayment()

  const [paymentOpen, setPaymentOpen] = useState(false)
  const [payingInstallment, setPayingInstallment] = useState<LiabilityLoanScheduleRow | null>(null)
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'bank_transfer',
    reference_number: '',
    notes: '',
  })

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!loan || !payingInstallment) return
    const amount = parseFloat(paymentForm.amount)
    if (isNaN(amount) || amount <= 0) { toast.error('Amount must be greater than zero'); return }

    await toast.promise(
      paymentMutation.mutateAsync({
        loan_id: loan.id,
        schedule_id: payingInstallment.id,
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
    setPayingInstallment(null)
    setPaymentForm({ amount: '', payment_date: new Date().toISOString().split('T')[0], payment_method: 'bank_transfer', reference_number: '', notes: '' })
  }

  const handleDownloadPDF = () => {
    if (!loan) return

    const doc = new jsPDF()

    doc.setFontSize(16)
    doc.text('Amortization Schedule', 14, 20)
    doc.setFontSize(11)
    doc.text(`Loan: ${loan.loan_number}`, 14, 30)
    doc.text(`Lender: ${loan.lender_name}`, 14, 37)
    doc.text(`Principal: ${formatCurrency(loan.principal_amount)}`, 14, 44)
    doc.text(`Monthly Rate: ${loan.interest_rate_monthly}%  |  Method: ${RATE_TYPE_LABELS[loan.rate_type as RateType] ?? loan.rate_type}`, 14, 51)
    doc.text(`Term: ${loan.term_months} months`, 14, 58)
    doc.text(`Monthly Payment: ${formatCurrency(loan.monthly_payment)}`, 14, 65)
    doc.text(`Total Interest: ${formatCurrency(loan.total_interest)}`, 14, 72)
    doc.text(`Total Payable: ${formatCurrency(loan.total_payable)}`, 14, 79)

    autoTable(doc, {
      startY: 88,
      head: [['#', 'Due Date', 'Principal', 'Interest', 'Payment', 'Balance After', 'Status']],
      body: loan.schedule.map(row => [
        row.installment_number,
        formatDate(row.due_date),
        formatCurrency(row.principal_portion),
        formatCurrency(row.interest_portion),
        formatCurrency(row.scheduled_amount),
        formatCurrency(row.balance_after),
        row.status.charAt(0).toUpperCase() + row.status.slice(1),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 41, 59] },
    })

    doc.save(`${loan.loan_number}-amortization.pdf`)
    toast.success('PDF downloaded')
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!loan) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">Loan not found</div>
  }

  const paidCount = loan.paid_installments_count
  const progressPct = loan.term_months > 0 ? Math.min(100, (paidCount / loan.term_months) * 100) : 0
  const nextDue = loan.next_due_installment

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/liabilities/loans">
          <Button variant="ghost" size="icon" className="-ml-2"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{loan.loan_number}</h1>
            <Badge variant="outline" className={
              loan.status === 'completed' ? 'bg-green-100 text-green-700 border-green-200' :
              loan.status === 'defaulted' ? 'bg-red-100 text-red-700 border-red-200' :
              'bg-blue-100 text-blue-700 border-blue-200'
            }>{loan.status.charAt(0).toUpperCase() + loan.status.slice(1)}</Badge>
          </div>
          <p className="text-muted-foreground mt-1">{loan.lender_name}</p>
        </div>
        <Button variant="outline" onClick={handleDownloadPDF}>
          <Download className="mr-2 h-4 w-4" /> Download PDF
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">Principal</p>
            <p className="text-xl font-bold">{formatCurrency(loan.principal_amount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">Monthly Payment</p>
            <p className="text-xl font-bold text-purple-600">{formatCurrency(loan.monthly_payment)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">Total Interest</p>
            <p className="text-xl font-bold text-amber-600">{formatCurrency(loan.total_interest)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">Outstanding Balance</p>
            <p className="text-xl font-bold">{formatCurrency(loan.outstanding_balance)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium">Repayment Progress</span>
            <span className="text-muted-foreground">{paidCount} of {loan.term_months} installments paid ({progressPct.toFixed(1)}%)</span>
          </div>
          <div className="w-full bg-muted rounded-full h-3">
            <div className="h-3 rounded-full bg-purple-500 transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          {nextDue && (
            <p className="text-sm text-muted-foreground mt-2">
              Next: Installment #{nextDue.installment_number} — {formatCurrency(nextDue.scheduled_amount - nextDue.paid_amount)} due on {formatDate(nextDue.due_date)}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Loan details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Banknote className="h-4 w-4" /> Loan Details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-y-3 text-sm sm:grid-cols-3">
          <div><p className="text-xs text-muted-foreground">Rate</p><p className="font-medium">{loan.interest_rate_monthly}% / month</p></div>
          <div><p className="text-xs text-muted-foreground">Interest Method</p><p className="font-medium">{RATE_TYPE_LABELS[loan.rate_type as RateType] ?? loan.rate_type}</p></div>
          <div><p className="text-xs text-muted-foreground">Term</p><p className="font-medium">{loan.term_months} months</p></div>
          <div><p className="text-xs text-muted-foreground">Start Date</p><p className="font-medium">{formatDate(loan.start_date)}</p></div>
          <div><p className="text-xs text-muted-foreground">Total Payable</p><p className="font-medium">{formatCurrency(loan.total_payable)}</p></div>
          {loan.loan_reference && <div><p className="text-xs text-muted-foreground">Reference</p><p className="font-mono font-medium">{loan.loan_reference}</p></div>}
          {loan.notes && <div className="col-span-2 sm:col-span-3"><p className="text-xs text-muted-foreground">Notes</p><p>{loan.notes}</p></div>}
        </CardContent>
      </Card>

      {/* Amortization Schedule */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Amortization Schedule</CardTitle>
            <CardDescription>{loan.term_months} installments · {paidCount} paid</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
            <Download className="mr-2 h-4 w-4" /> PDF
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Principal</TableHead>
                  <TableHead className="text-right">Interest</TableHead>
                  <TableHead className="text-right">Payment</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance After</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loan.schedule.map(row => (
                  <TableRow key={row.id} className={row.status === 'paid' ? 'opacity-60' : ''}>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <InstallmentStatusIcon status={row.status} dueDate={row.due_date} />
                        <span className="text-sm">{row.installment_number}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(row.due_date)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(row.principal_portion)}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-amber-600">{formatCurrency(row.interest_portion)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{formatCurrency(row.scheduled_amount)}</TableCell>
                    <TableCell className="text-right font-mono text-green-600">{row.paid_amount > 0 ? formatCurrency(row.paid_amount) : '—'}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(row.balance_after)}</TableCell>
                    <TableCell><InstallmentBadge status={row.status} dueDate={row.due_date} /></TableCell>
                    <TableCell>
                      {row.status !== 'paid' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setPayingInstallment(row)
                            setPaymentForm(f => ({ ...f, amount: (row.scheduled_amount - row.paid_amount).toFixed(2) }))
                            setPaymentOpen(true)
                          }}
                        >
                          <CreditCard className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Payment Dialog */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment — Installment #{payingInstallment?.installment_number}</DialogTitle>
            <DialogDescription>
              Scheduled: {payingInstallment ? formatCurrency(payingInstallment.scheduled_amount) : ''}
              {payingInstallment && payingInstallment.paid_amount > 0 && ` · Remaining: ${formatCurrency(payingInstallment.scheduled_amount - payingInstallment.paid_amount)}`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePayment}>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Amount (₱) *</Label>
                  <Input type="number" min="0.01" step="0.01" value={paymentForm.amount} onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))} required />
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
