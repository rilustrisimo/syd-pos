'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  Banknote,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  useLoans,
  useCreateLoan,
  useDeleteLoan,
  type LiabilityLoan,
  type LoanFilters,
} from '@/hooks/useLiabilities'
import { useAuthStore } from '@/lib/stores/auth'
import { formatCurrency, formatDate } from '@/lib/utils/formatting'
import { calculateAmortization, RATE_TYPE_LABELS, RATE_TYPE_DESCRIPTIONS, type RateType } from '@/lib/utils/amortization'

function LoanStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    active: { label: 'Active', className: 'bg-blue-100 text-blue-700 border-blue-200' },
    completed: { label: 'Completed', className: 'bg-green-100 text-green-700 border-green-200' },
    defaulted: { label: 'Defaulted', className: 'bg-red-100 text-red-700 border-red-200' },
  }
  const s = map[status] ?? { label: status, className: '' }
  return <Badge variant="outline" className={s.className}>{s.label}</Badge>
}

export default function LoansPage() {
  const user = useAuthStore(state => state.user)
  const branchId = user?.branchId ?? ''
  const userId = user?.id ?? ''

  const [filters, setFilters] = useState<LoanFilters>({ page: 1, limit: 20 })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const { data, isLoading } = useLoans(filters)
  const createMutation = useCreateLoan()
  const deleteMutation = useDeleteLoan()

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({
    lender_name: '',
    principal_amount: '',
    interest_rate_monthly: '',
    rate_type: 'flat_rate' as RateType,
    term_months: '12',
    start_date: new Date().toISOString().split('T')[0],
    loan_reference: '',
    notes: '',
  })

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingLoan, setDeletingLoan] = useState<LiabilityLoan | null>(null)

  const loans = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / (filters.limit ?? 20))
  const currentPage = filters.page ?? 1

  // Live amortization preview
  const principal = parseFloat(createForm.principal_amount) || 0
  const rate = parseFloat(createForm.interest_rate_monthly) || 0
  const termMonths = parseInt(createForm.term_months) || 0
  const startDateObj = new Date(createForm.start_date)
  const startDateValid = !isNaN(startDateObj.getTime()) && createForm.start_date.length === 10
  const amortPreview = (principal > 0 && termMonths > 0 && startDateValid && (rate > 0 || createForm.rate_type === 'interest_only'))
    ? calculateAmortization(principal, rate, termMonths, startDateObj, createForm.rate_type)
    : null

  const applyFilters = () => {
    setFilters({
      page: 1,
      limit: 20,
      search: search || undefined,
      status: (statusFilter as LoanFilters['status']) || undefined,
    })
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!amortPreview) { toast.error('Please fill in all loan fields to generate schedule'); return }
    if (!createForm.lender_name.trim()) { toast.error('Lender name is required'); return }

    await toast.promise(
      createMutation.mutateAsync({
        branch_id: branchId,
        lender_name: createForm.lender_name.trim(),
        principal_amount: principal,
        interest_rate_monthly: rate,
        rate_type: createForm.rate_type,
        term_months: termMonths,
        start_date: createForm.start_date,
        monthly_payment: amortPreview.monthly_payment,
        total_interest: amortPreview.total_interest,
        total_payable: amortPreview.total_payable,
        loan_reference: createForm.loan_reference || null,
        notes: createForm.notes || null,
        created_by: userId,
        schedule: amortPreview.schedule,
      }),
      { loading: 'Creating loan...', success: 'Loan created with amortization schedule', error: (e) => e.message }
    )
    setCreateOpen(false)
    setCreateForm({ lender_name: '', principal_amount: '', interest_rate_monthly: '', rate_type: 'flat_rate', term_months: '12', start_date: new Date().toISOString().split('T')[0], loan_reference: '', notes: '' })
  }

  const handleDelete = async () => {
    if (!deletingLoan) return
    await toast.promise(
      deleteMutation.mutateAsync(deletingLoan.id),
      { loading: 'Deleting...', success: 'Loan deleted', error: (e) => e.message }
    )
    setDeleteOpen(false)
    setDeletingLoan(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Loans</h1>
          <p className="text-muted-foreground">Business loan amortization tracking</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Loan
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search loan #, lender..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && applyFilters()} className="pl-9" />
            </div>
            <Select value={statusFilter || 'all'} onValueChange={v => setStatusFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="defaulted">Defaulted</SelectItem>
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
            <Banknote className="h-5 w-5 text-purple-500" />
            Loans ({total})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Loan #</TableHead>
                  <TableHead>Lender</TableHead>
                  <TableHead className="text-right">Principal</TableHead>
                  <TableHead>Rate / Month</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead className="text-right">Monthly</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={11} className="h-32 text-center"><Loader2 className="inline h-6 w-6 animate-spin" /></TableCell></TableRow>
                ) : loans.length === 0 ? (
                  <TableRow><TableCell colSpan={11} className="h-32 text-center text-muted-foreground">No loans found</TableCell></TableRow>
                ) : (
                  loans.map(loan => {
                    const paidCount = loan.paid_installments_count
                    const pct = loan.term_months > 0 ? Math.round((paidCount / loan.term_months) * 100) : 0
                    return (
                      <TableRow key={loan.id}>
                        <TableCell className="font-mono text-sm">{loan.loan_number}</TableCell>
                        <TableCell className="font-medium">{loan.lender_name}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(loan.principal_amount)}</TableCell>
                        <TableCell>{loan.interest_rate_monthly}%</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {RATE_TYPE_LABELS[loan.rate_type as RateType] ?? loan.rate_type}
                        </TableCell>
                        <TableCell>{loan.term_months}mo</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(loan.monthly_payment)}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{formatCurrency(loan.outstanding_balance)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-[80px]">
                            <div className="flex-1 bg-muted rounded-full h-2">
                              <div className="h-2 rounded-full bg-purple-500" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">{paidCount}/{loan.term_months}</span>
                          </div>
                        </TableCell>
                        <TableCell><LoanStatusBadge status={loan.status} /></TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={`/liabilities/loans/${loan.id}`}><Eye className="mr-2 h-4 w-4" /> View Schedule</Link>
                              </DropdownMenuItem>
                              {loan.status !== 'completed' && (
                                <DropdownMenuItem className="text-destructive" onClick={() => { setDeletingLoan(loan); setDeleteOpen(true) }}>
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">Page {currentPage} of {totalPages}</p>
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Business Loan</DialogTitle>
            <DialogDescription>Enter loan details to generate the full amortization schedule</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label>Lender Name *</Label>
                  <Input placeholder="Bank name, institution, or person" value={createForm.lender_name} onChange={e => setCreateForm(f => ({ ...f, lender_name: e.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label>Principal Amount (₱) *</Label>
                  <NumericInput min="1" step="0.01" placeholder="500000" value={createForm.principal_amount} onChange={e => setCreateForm(f => ({ ...f, principal_amount: e.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label>Monthly Interest Rate (%) *</Label>
                  <NumericInput min="0" step="0.01" placeholder="0.42" value={createForm.interest_rate_monthly} onChange={e => setCreateForm(f => ({ ...f, interest_rate_monthly: e.target.value }))} required />
                  <p className="text-xs text-muted-foreground">e.g., 0.42 for 0.42% per month</p>
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Interest Method *</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(RATE_TYPE_LABELS) as RateType[]).map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setCreateForm(f => ({ ...f, rate_type: type }))}
                        className={`rounded-lg border p-3 text-left transition-colors ${
                          createForm.rate_type === type
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'border-border hover:bg-muted/50'
                        }`}
                      >
                        <p className="text-xs font-semibold">{RATE_TYPE_LABELS[type]}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{RATE_TYPE_DESCRIPTIONS[type]}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Term (months) *</Label>
                  <NumericInput min="1" max="360" step="1" value={createForm.term_months} onChange={e => setCreateForm(f => ({ ...f, term_months: e.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label>Start Date *</Label>
                  <Input type="date" value={createForm.start_date} onChange={e => setCreateForm(f => ({ ...f, start_date: e.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label>Loan Reference / Account No.</Label>
                  <Input placeholder="Bank account or loan ID" value={createForm.loan_reference} onChange={e => setCreateForm(f => ({ ...f, loan_reference: e.target.value }))} />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Notes</Label>
                  <Textarea placeholder="Additional notes..." value={createForm.notes} onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
                </div>
              </div>

              {/* Live amortization preview */}
              {amortPreview && (
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <p className="text-sm font-semibold">Amortization Preview</p>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Monthly Payment</p>
                      <p className="font-bold text-lg">{formatCurrency(amortPreview.monthly_payment)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Interest</p>
                      <p className="font-semibold text-amber-600">{formatCurrency(amortPreview.total_interest)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Payable</p>
                      <p className="font-semibold">{formatCurrency(amortPreview.total_payable)}</p>
                    </div>
                  </div>
                  {/* First 3 installments preview */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground">
                          <th className="text-left py-1">#</th>
                          <th className="text-left py-1">Due Date</th>
                          <th className="text-right py-1">Principal</th>
                          <th className="text-right py-1">Interest</th>
                          <th className="text-right py-1">Balance After</th>
                        </tr>
                      </thead>
                      <tbody>
                        {amortPreview.schedule.slice(0, 3).map(row => (
                          <tr key={row.installment_number} className="border-t border-border/50">
                            <td className="py-1">{row.installment_number}</td>
                            <td className="py-1">{formatDate(row.due_date)}</td>
                            <td className="text-right py-1">{formatCurrency(row.principal_portion)}</td>
                            <td className="text-right py-1 text-amber-600">{formatCurrency(row.interest_portion)}</td>
                            <td className="text-right py-1">{formatCurrency(row.balance_after)}</td>
                          </tr>
                        ))}
                        {amortPreview.schedule.length > 3 && (
                          <tr>
                            <td colSpan={5} className="text-center py-1 text-muted-foreground">
                              ... {amortPreview.schedule.length - 3} more installments
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending || !amortPreview}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Loan & Schedule
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Loan</AlertDialogTitle>
            <AlertDialogDescription>
              Delete {deletingLoan?.loan_number} ({deletingLoan?.lender_name})? The amortization schedule and all payment records will also be deleted.
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
