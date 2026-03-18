'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Plus,
  Search,
  MoreHorizontal,
  Loader2,
  Eye,
  Trash2,
  CreditCard,
  FileWarning,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  usePayables,
  useCreatePayable,
  useRecordPayablePayment,
  useDeletePayable,
  type LiabilityPayable,
  type PayableFilters,
} from '@/hooks/useLiabilities'
import { useSuppliers } from '@/hooks/useSuppliers'
import { usePurchaseOrders } from '@/hooks/usePurchases'
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

function DaysBadge({ days }: { days: number }) {
  if (days < 0) return <span className="text-xs font-medium text-red-600">{Math.abs(days)}d overdue</span>
  if (days === 0) return <span className="text-xs font-medium text-red-500">Due today</span>
  if (days <= 7) return <span className="text-xs font-medium text-amber-600">{days}d left</span>
  return <span className="text-xs text-muted-foreground">{days}d left</span>
}

export default function PayablesPage() {
  const user = useAuthStore(state => state.user)
  const branchId = user?.branchId ?? ''
  const userId = user?.id ?? ''

  const [filters, setFilters] = useState<PayableFilters>({ page: 1, limit: 20 })
  const [search, setSearch] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const { data, isLoading } = usePayables(filters)
  const { data: suppliersData } = useSuppliers({ limit: 200 })
  const createMutation = useCreatePayable()
  const paymentMutation = useRecordPayablePayment()
  const deleteMutation = useDeletePayable()

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({
    supplier_id: '',
    description: '',
    invoice_reference: '',
    total_amount: '',
    invoice_date: new Date().toISOString().split('T')[0],
    credit_days: '30',
    notes: '',
  })

  // Payment dialog
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [payingPayable, setPayingPayable] = useState<LiabilityPayable | null>(null)
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'bank_transfer',
    reference_number: '',
    notes: '',
  })

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingPayable, setDeletingPayable] = useState<LiabilityPayable | null>(null)

  const suppliers = suppliersData?.data ?? []
  const payables = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / (filters.limit ?? 20))
  const currentPage = filters.page ?? 1

  const computedDueDate = () => {
    if (!createForm.invoice_date || !createForm.credit_days) return ''
    const d = new Date(createForm.invoice_date)
    d.setDate(d.getDate() + Number(createForm.credit_days))
    return d.toISOString().split('T')[0]
  }

  const applyFilters = () => {
    setFilters({
      page: 1,
      limit: 20,
      search: search || undefined,
      supplier_id: supplierFilter || undefined,
      status: (statusFilter as PayableFilters['status']) || undefined,
    })
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const amount = parseFloat(createForm.total_amount)
    if (isNaN(amount) || amount <= 0) { toast.error('Amount must be greater than zero'); return }
    if (!createForm.supplier_id) { toast.error('Please select a supplier'); return }
    if (!createForm.invoice_date) { toast.error('Invoice date is required'); return }

    const due = computedDueDate()
    await toast.promise(
      createMutation.mutateAsync({
        branch_id: branchId,
        supplier_id: createForm.supplier_id,
        description: createForm.description || null,
        invoice_reference: createForm.invoice_reference || null,
        total_amount: amount,
        invoice_date: createForm.invoice_date,
        credit_days: Number(createForm.credit_days),
        due_date: due,
        notes: createForm.notes || null,
        created_by: userId,
      }),
      { loading: 'Creating payable...', success: 'Payable created', error: (e) => e.message }
    )
    setCreateOpen(false)
    setCreateForm({ supplier_id: '', description: '', invoice_reference: '', total_amount: '', invoice_date: new Date().toISOString().split('T')[0], credit_days: '30', notes: '' })
  }

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!payingPayable) return
    const amount = parseFloat(paymentForm.amount)
    if (isNaN(amount) || amount <= 0) { toast.error('Amount must be greater than zero'); return }

    await toast.promise(
      paymentMutation.mutateAsync({
        payable_id: payingPayable.id,
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
    setPayingPayable(null)
    setPaymentForm({ amount: '', payment_date: new Date().toISOString().split('T')[0], payment_method: 'bank_transfer', reference_number: '', notes: '' })
  }

  const handleDelete = async () => {
    if (!deletingPayable) return
    await toast.promise(
      deleteMutation.mutateAsync(deletingPayable.id),
      { loading: 'Deleting...', success: 'Payable deleted', error: (e) => e.message }
    )
    setDeleteOpen(false)
    setDeletingPayable(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Payables</h1>
          <p className="text-muted-foreground">Supplier trade credit — AP tracking</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Payable
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search payable #, description..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyFilters()}
                className="pl-9"
              />
            </div>
            <Select value={supplierFilter || 'all'} onValueChange={v => setSupplierFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All suppliers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Suppliers</SelectItem>
                {suppliers.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter || 'all'} onValueChange={v => setStatusFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={applyFilters} variant="secondary">Filter</Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileWarning className="h-5 w-5 text-amber-500" />
            Payables ({total})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payable #</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Invoice Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center">
                      <Loader2 className="inline h-6 w-6 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : payables.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                      No payables found
                    </TableCell>
                  </TableRow>
                ) : (
                  payables.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-sm">{p.payable_number}</TableCell>
                      <TableCell className="font-medium">{p.supplier?.name ?? '—'}</TableCell>
                      <TableCell className="text-sm">{formatDate(p.invoice_date)}</TableCell>
                      <TableCell className="text-sm">
                        <div>{formatDate(p.due_date)}</div>
                        <DaysBadge days={p.days_until_due} />
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(p.total_amount)}</TableCell>
                      <TableCell className="text-right font-mono text-green-600">{formatCurrency(p.paid_amount)}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">{formatCurrency(p.balance)}</TableCell>
                      <TableCell><StatusBadge status={p.status} /></TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/liabilities/payables/${p.id}`}>
                                <Eye className="mr-2 h-4 w-4" /> View Detail
                              </Link>
                            </DropdownMenuItem>
                            {p.status !== 'paid' && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setPayingPayable(p)
                                  setPaymentForm(f => ({ ...f, amount: p.balance.toFixed(2) }))
                                  setPaymentOpen(true)
                                }}
                              >
                                <CreditCard className="mr-2 h-4 w-4" /> Record Payment
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => { setDeletingPayable(p); setDeleteOpen(true) }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">Page {currentPage} of {totalPages} ({total} records)</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setFilters(f => ({ ...f, page: Math.max(1, (f.page ?? 1) - 1) }))} disabled={currentPage === 1}>Previous</Button>
                <Button variant="outline" size="sm" onClick={() => setFilters(f => ({ ...f, page: Math.min(totalPages, (f.page ?? 1) + 1) }))} disabled={currentPage === totalPages}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Payable</DialogTitle>
            <DialogDescription>Record a new supplier trade credit obligation</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Supplier *</Label>
                <Select value={createForm.supplier_id} onValueChange={v => setCreateForm(f => ({ ...f, supplier_id: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier..." />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Invoice Date *</Label>
                  <Input type="date" value={createForm.invoice_date} onChange={e => setCreateForm(f => ({ ...f, invoice_date: e.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label>Credit Days *</Label>
                  <Select value={createForm.credit_days} onValueChange={v => setCreateForm(f => ({ ...f, credit_days: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">Net 30</SelectItem>
                      <SelectItem value="60">Net 60</SelectItem>
                      <SelectItem value="90">Net 90</SelectItem>
                      <SelectItem value="120">Net 120</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {computedDueDate() && (
                <p className="text-sm text-muted-foreground -mt-2">Due date: <strong>{formatDate(computedDueDate())}</strong></p>
              )}
              <div className="space-y-2">
                <Label>Total Amount (₱) *</Label>
                <Input type="number" min="0.01" step="0.01" placeholder="0.00" value={createForm.total_amount} onChange={e => setCreateForm(f => ({ ...f, total_amount: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>Invoice Reference</Label>
                <Input placeholder="Supplier's invoice number" value={createForm.invoice_reference} onChange={e => setCreateForm(f => ({ ...f, invoice_reference: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input placeholder="Brief description of goods/services" value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea placeholder="Additional notes..." value={createForm.notes} onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Payable
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              {payingPayable?.payable_number} — Balance: {payingPayable ? formatCurrency(payingPayable.balance) : ''}
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

      {/* Delete Dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Payable</AlertDialogTitle>
            <AlertDialogDescription>
              Delete {deletingPayable?.payable_number}? This cannot be undone. Payment records will also be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
