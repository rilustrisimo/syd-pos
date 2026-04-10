'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTaxPayments, useCreateTaxPayment, useDeleteTaxPayment } from '@/hooks/useTaxes'
import type { TaxType } from '@/types/database'
import { getTodayPH } from '@/lib/utils/datetime'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const TAX_TYPE_OPTIONS: { value: TaxType; label: string }[] = [
  { value: '2551q',              label: 'BIR 2551Q — Percentage Tax (Quarterly)' },
  { value: '1701q',              label: 'BIR 1701Q — Income Tax (Quarterly)' },
  { value: '1701a',              label: 'BIR 1701A — Annual Income Tax' },
  { value: '0605',               label: 'BIR 0605 — Annual Registration Fee' },
  { value: 'lbt',                label: 'Local Business Tax (LGU)' },
  { value: 'mayors_permit',      label: "Mayor's Permit" },
  { value: 'barangay_clearance', label: 'Barangay Clearance' },
]

const TAX_COLORS: Record<string, string> = {
  '2551q':              'bg-blue-100 text-blue-800',
  '1701q':              'bg-purple-100 text-purple-800',
  '1701a':              'bg-indigo-100 text-indigo-800',
  '0605':               'bg-gray-100 text-gray-800',
  'lbt':                'bg-orange-100 text-orange-800',
  'mayors_permit':      'bg-yellow-100 text-yellow-800',
  'barangay_clearance': 'bg-green-100 text-green-800',
}

interface Props { branchId: string | null; year: number }

export function PaymentLogTab({ branchId, year }: Props) {
  const { data: payments = [], isLoading } = useTaxPayments(branchId ?? null, year)
  const createPayment  = useCreateTaxPayment()
  const deletePayment  = useDeleteTaxPayment()
  const [open, setOpen] = useState(false)

  const [form, setForm] = useState({
    tax_type:        '2551q' as TaxType,
    period_year:     year,
    period_quarter:  '' as string,
    amount_due:      '',
    amount_paid:     '',
    payment_date:    getTodayPH(),
    reference_number:'',
    notes:           '',
  })

  const handleSubmit = async () => {
    if (!branchId || !form.amount_paid || !form.payment_date) return
    try {
      await createPayment.mutateAsync({
        branch_id:       branchId,
        tax_type:        form.tax_type,
        period_year:     Number(form.period_year),
        period_quarter:  form.period_quarter ? Number(form.period_quarter) : null,
        amount_due:      Number(form.amount_due) || 0,
        amount_paid:     Number(form.amount_paid),
        payment_date:    form.payment_date,
        reference_number:form.reference_number || null,
        notes:           form.notes || null,
      })
      toast.success('Payment recorded')
      setOpen(false)
      setForm(f => ({ ...f, amount_due: '', amount_paid: '', reference_number: '', notes: '' }))
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save payment')
    }
  }

  const handleDelete = async (id: string) => {
    if (!branchId) return
    try {
      await deletePayment.mutateAsync({ id, branchId })
      toast.success('Payment removed')
    } catch {
      toast.error('Failed to remove payment')
    }
  }

  const totalPaid = payments.reduce((s, p) => s + Number(p.amount_paid), 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-muted-foreground">Total paid in {year}</div>
          <div className="text-2xl font-bold text-green-600">₱ {fmt(totalPaid)}</div>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Record Payment
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Payment History — {year}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <Skeleton className="h-32 w-full" />}
          {!isLoading && payments.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-6">
              No payments recorded for {year} yet.
            </p>
          )}
          {!isLoading && payments.length > 0 && (
            <div className="space-y-2">
              {payments.map(p => (
                <div key={p.id} className="flex items-center justify-between border rounded-lg px-3 py-2">
                  <div className="flex items-center gap-3">
                    <Badge className={TAX_COLORS[p.tax_type] || 'bg-gray-100 text-gray-800'}>
                      {p.tax_type.toUpperCase()}
                    </Badge>
                    <div>
                      <div className="text-sm font-medium">
                        {TAX_TYPE_OPTIONS.find(o => o.value === p.tax_type)?.label || p.tax_type}
                        {p.period_quarter && <span className="ml-1 text-xs text-muted-foreground">(Q{p.period_quarter})</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.payment_date} · {p.payment_number}
                        {p.reference_number && ` · OR# ${p.reference_number}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-sm font-semibold text-green-600">₱ {fmt(p.amount_paid)}</div>
                      {p.amount_due > 0 && p.amount_due !== p.amount_paid && (
                        <div className="text-xs text-muted-foreground">Due: ₱ {fmt(p.amount_due)}</div>
                      )}
                    </div>
                    <Button
                      variant="ghost" size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(p.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Record Payment Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Tax Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Tax Type</Label>
                <Select value={form.tax_type} onValueChange={v => setForm(f => ({ ...f, tax_type: v as TaxType }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TAX_TYPE_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Year</Label>
                <Input
                  className="mt-1" type="number"
                  value={form.period_year}
                  onChange={e => setForm(f => ({ ...f, period_year: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label>Quarter <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Select value={form.period_quarter} onValueChange={v => setForm(f => ({ ...f, period_quarter: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="N/A (annual)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">N/A (annual)</SelectItem>
                    <SelectItem value="1">Q1</SelectItem>
                    <SelectItem value="2">Q2</SelectItem>
                    <SelectItem value="3">Q3</SelectItem>
                    <SelectItem value="4">Q4</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Estimated Amount Due</Label>
                <Input className="mt-1" placeholder="0.00"
                  value={form.amount_due}
                  onChange={e => setForm(f => ({ ...f, amount_due: e.target.value }))} />
              </div>
              <div>
                <Label>Amount Paid <span className="text-destructive">*</span></Label>
                <Input className="mt-1" placeholder="0.00"
                  value={form.amount_paid}
                  onChange={e => setForm(f => ({ ...f, amount_paid: e.target.value }))} />
              </div>
              <div>
                <Label>Payment Date <span className="text-destructive">*</span></Label>
                <Input className="mt-1" type="date"
                  value={form.payment_date}
                  onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} />
              </div>
              <div>
                <Label>BIR eReceipt / OR# <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input className="mt-1" placeholder="Reference number"
                  value={form.reference_number}
                  onChange={e => setForm(f => ({ ...f, reference_number: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Textarea className="mt-1" rows={2}
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={createPayment.isPending || !form.amount_paid}
            >
              {createPayment.isPending ? 'Saving…' : 'Save Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
