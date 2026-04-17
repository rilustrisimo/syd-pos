'use client'

import { use, useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  useReferrer,
  useReferrerStats,
  useReferrerCommissions,
  useReferrerPayouts,
  useUpdateReferrer,
  useCreatePayout,
  useTagTransactionReferrer,
  referrerKeys,
} from '@/hooks/useReferrers'
import { useTransactions } from '@/hooks/useTransactions'
import { useAllActiveReferrers } from '@/hooks/useReferrers'
import { formatCurrency, formatDate } from '@/lib/utils/formatting'
import { useAuthStore } from '@/lib/stores/auth'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Phone,
  MapPin,
  Loader2,
  Pencil,
  DollarSign,
  Printer,
  Plus,
  ExternalLink,
  Tag,
  Search,
  Check,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useQueryClient } from '@tanstack/react-query'
import type { ReferrerInput, PayoutInput, PayoutRow } from '@/lib/supabase/queries/referrers'
import { PayoutSlipTemplate } from '@/components/print/payout-slip-template'

// ── Helpers ───────────────────────────────────────────────────────────────────

const commissionStatusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  earned: 'bg-green-100 text-green-800',
  reversed: 'bg-red-100 text-red-800',
}

const paymentMethodLabels: Record<string, string> = {
  cash: 'Cash',
  gcash: 'GCash',
  bank_transfer: 'Bank Transfer',
}

function StatCard({ label, value, sub, highlight }: {
  label: string
  value: string
  sub?: string
  highlight?: boolean
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${highlight ? 'text-orange-500' : ''}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  )
}

// ── Edit Referrer Dialog ──────────────────────────────────────────────────────

function EditReferrerDialog({ referrer, open, onClose }: {
  referrer: any
  open: boolean
  onClose: () => void
}) {
  const updateReferrer = useUpdateReferrer()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<ReferrerInput & { is_active: boolean }>({
    name: referrer?.name || '',
    phone: referrer?.phone || '',
    profession: referrer?.profession || '',
    address: referrer?.address || '',
    bank_details: referrer?.bank_details || '',
    default_commission_rate: referrer?.default_commission_rate ?? 0,
    is_active: referrer?.is_active ?? true,
  })

  const handleSave = async () => {
    if (!form.name?.trim()) {
      toast.error('Name is required')
      return
    }
    try {
      await updateReferrer.mutateAsync({ id: referrer.id, input: form })
      await queryClient.invalidateQueries({ queryKey: referrerKeys.detail(referrer.id) })
      toast.success('Referrer updated')
      onClose()
    } catch (e: any) {
      toast.error(e.message || 'Failed to update referrer')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Referrer</DialogTitle>
          <DialogDescription>Update referrer information</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Full name"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input
                value={form.phone || ''}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="09xx-xxx-xxxx"
              />
            </div>
            <div className="space-y-1">
              <Label>Profession</Label>
              <Input
                value={form.profession || ''}
                onChange={(e) => setForm({ ...form, profession: e.target.value })}
                placeholder="e.g., Electrician"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Address</Label>
            <Textarea
              value={form.address || ''}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              rows={2}
              placeholder="Full address"
            />
          </div>
          <div className="space-y-1">
            <Label>Bank / GCash Details</Label>
            <Input
              value={form.bank_details || ''}
              onChange={(e) => setForm({ ...form, bank_details: e.target.value })}
              placeholder="GCash: 09XX or bank account"
            />
          </div>
          <div className="space-y-1">
            <Label>Default Commission Rate (%)</Label>
            <Input
              type="number"
              value={form.default_commission_rate?.toString() ?? '0'}
              onChange={(e) =>
                setForm({ ...form, default_commission_rate: parseFloat(e.target.value) || 0 })
              }
              min="0"
              max="100"
              step="0.01"
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => setForm({ ...form, is_active: v })}
            />
            <Label>Active</Label>
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={updateReferrer.isPending}>
            {updateReferrer.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Record Payout Dialog ──────────────────────────────────────────────────────

function RecordPayoutDialog({ referrerId, balance, open, onClose }: {
  referrerId: string
  balance: number
  open: boolean
  onClose: () => void
}) {
  const { user } = useAuthStore()
  const createPayout = useCreatePayout()
  const [form, setForm] = useState<PayoutInput & { amount_str: string }>({
    amount: 0,
    amount_str: '',
    payment_method: 'cash',
    reference_number: '',
    payout_date: new Date().toISOString().split('T')[0],
    notes: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const amount = parseFloat(form.amount_str)
    if (!amount || amount <= 0) {
      toast.error('Enter a valid payout amount')
      return
    }
    if (amount > balance) {
      toast.error(`Amount exceeds current balance of ${formatCurrency(balance)}`)
      return
    }
    if (!user?.id) {
      toast.error('User session not found')
      return
    }
    try {
      await createPayout.mutateAsync({
        referrerId,
        input: {
          amount,
          payment_method: form.payment_method as 'cash' | 'gcash' | 'bank_transfer',
          reference_number: form.reference_number?.trim() || null,
          payout_date: form.payout_date,
          notes: form.notes?.trim() || null,
        },
        userId: user.id,
      })
      toast.success('Payout recorded')
      onClose()
    } catch (e: any) {
      toast.error(e.message || 'Failed to record payout')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Record Payout</DialogTitle>
          <DialogDescription>
            Current balance: <span className="font-semibold text-orange-500">{formatCurrency(balance)}</span>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Amount *</Label>
            <Input
              type="number"
              value={form.amount_str}
              onChange={(e) => setForm({ ...form, amount_str: e.target.value })}
              placeholder="0.00"
              min="0.01"
              step="0.01"
              required
            />
          </div>
          <div className="space-y-1">
            <Label>Payment Method</Label>
            <Select
              value={form.payment_method as string}
              onValueChange={(v) => setForm({ ...form, payment_method: v as any })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="gcash">GCash</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Reference Number</Label>
            <Input
              value={form.reference_number || ''}
              onChange={(e) => setForm({ ...form, reference_number: e.target.value })}
              placeholder="GCash / bank ref"
            />
          </div>
          <div className="space-y-1">
            <Label>Payout Date</Label>
            <Input
              type="date"
              value={form.payout_date || ''}
              onChange={(e) => setForm({ ...form, payout_date: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea
              value={form.notes || ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              placeholder="Optional notes"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={createPayout.isPending}>
              {createPayout.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record Payout
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Tag Transaction Dialog ────────────────────────────────────────────────────

function TagTransactionDialog({ referrerId, defaultRate, open, onClose }: {
  referrerId: string
  defaultRate: number
  open: boolean
  onClose: () => void
}) {
  const tagMutation = useTagTransactionReferrer()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [selectedTxn, setSelectedTxn] = useState<any | null>(null)
  const [rate, setRate] = useState(defaultRate.toString())

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 350)
    return () => clearTimeout(t)
  }, [search])

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setSearch('')
      setDebouncedSearch('')
      setDateFrom('')
      setDateTo('')
      setPage(1)
      setSelectedTxn(null)
      setRate(defaultRate.toString())
    }
  }, [open, defaultRate])

  // Route search: TXN-prefixed → transaction number, otherwise → customer name
  const isTxnSearch = debouncedSearch.toUpperCase().startsWith('TXN')

  const { data: txnData, isLoading } = useTransactions({
    search: isTxnSearch ? debouncedSearch : undefined,
    customer_name: !isTxnSearch && debouncedSearch ? debouncedSearch : undefined,
    transaction_type: 'sale',
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    untagged_only: true,
    page,
    limit: 8,
  })

  const transactions = txnData?.transactions || []
  const totalPages = txnData?.totalPages || 1

  const handleTag = async () => {
    if (!selectedTxn) {
      toast.error('Select a transaction first')
      return
    }
    const commissionRate = parseFloat(rate)
    if (isNaN(commissionRate) || commissionRate < 0) {
      toast.error('Invalid commission rate')
      return
    }
    try {
      await tagMutation.mutateAsync({ transactionId: selectedTxn.id, referrerId, commissionRate })
      toast.success(`Transaction ${selectedTxn.transaction_number} tagged`)
      onClose()
    } catch (e: any) {
      toast.error(e.message || 'Failed to tag transaction')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Tag Historical Transaction</DialogTitle>
          <DialogDescription>
            Search POS history and link a sale to this referrer. A commission row will be created automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 flex-1 min-h-0">
          {/* Search + date filters */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search by transaction # (TXN-…) or customer name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex gap-2 items-center">
              <Label className="text-xs text-muted-foreground shrink-0">Date range</Label>
              <Input
                type="date"
                className="h-8 text-sm"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
              />
              <span className="text-muted-foreground text-sm">–</span>
              <Input
                type="date"
                className="h-8 text-sm"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
              />
              {(dateFrom || dateTo) && (
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => { setDateFrom(''); setDateTo(''); setPage(1) }} title="Clear dates">
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>

          {/* Transaction list */}
          <div className="border rounded-lg overflow-hidden flex-1 min-h-0">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : transactions.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                {debouncedSearch || dateFrom || dateTo ? 'No transactions match the current filters' : 'No sales found'}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Transaction #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((txn: any) => {
                    const isSelected = selectedTxn?.id === txn.id
                    return (
                      <TableRow
                        key={txn.id}
                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-primary/10 hover:bg-primary/15' : 'hover:bg-muted/50'}`}
                        onClick={() => setSelectedTxn(isSelected ? null : txn)}
                      >
                        <TableCell>
                          {isSelected && <Check className="h-4 w-4 text-primary" />}
                        </TableCell>
                        <TableCell className="font-mono text-sm font-medium">
                          {txn.transaction_number}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(txn.transaction_date)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {txn.customer?.name || <span className="text-muted-foreground">Walk-in</span>}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatCurrency(txn.total_amount)}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                            txn.payment_status === 'paid'
                              ? 'bg-green-100 text-green-800'
                              : txn.payment_status === 'partial'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {txn.payment_status}
                          </span>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Page {page} of {totalPages}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Selected + rate */}
          {selectedTxn && (
            <div className="rounded-lg border bg-primary/5 border-primary/20 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{selectedTxn.transaction_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedTxn.customer?.name || 'Walk-in'} · {formatCurrency(selectedTxn.total_amount)} · <span className="capitalize">{selectedTxn.payment_status}</span>
                  </p>
                </div>
                <Badge variant="outline" className="text-primary border-primary/30">Selected</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm shrink-0">Commission Rate (%)</Label>
                <Input
                  type="number"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  className="w-24"
                  min="0"
                  max="100"
                  step="0.01"
                />
                {selectedTxn.payment_status === 'paid' && (
                  <p className="text-xs text-muted-foreground">
                    = {formatCurrency(selectedTxn.total_amount * (parseFloat(rate) || 0) / 100)} commission (earned immediately)
                  </p>
                )}
                {selectedTxn.payment_status !== 'paid' && (
                  <p className="text-xs text-muted-foreground">Commission will be earned when fully paid.</p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-2 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleTag} disabled={!selectedTxn || tagMutation.isPending}>
            {tagMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Tag className="mr-2 h-4 w-4" />
            Tag to Referrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ReferrerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isPayoutOpen, setIsPayoutOpen] = useState(false)
  const [isTagOpen, setIsTagOpen] = useState(false)
  const [printPayout, setPrintPayout] = useState<PayoutRow | null>(null)
  const printRef = useRef<HTMLDivElement>(null)

  const { data: referrer, isLoading: referrerLoading } = useReferrer(id)
  const { data: stats } = useReferrerStats(id)
  const { data: commissions = [] } = useReferrerCommissions(id)
  const { data: payouts = [] } = useReferrerPayouts(id)
  const { data: transactionsData } = useTransactions({ referrer_id: id })

  const transactions = transactionsData?.transactions || []

  const handlePrintPayout = (payout: PayoutRow) => {
    setPrintPayout(payout)
    setTimeout(() => {
      window.print()
      setPrintPayout(null)
    }, 300)
  }

  if (referrerLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!referrer) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Referrer not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/referrals')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Referrals
        </Button>
      </div>
    )
  }

  const balance = stats?.balance ?? 0

  return (
    <>
      {/* Print overlay */}
      {printPayout && referrer && stats && (
        <div ref={printRef} className="print-only">
          <PayoutSlipTemplate
            referrer={referrer}
            payout={printPayout}
            stats={stats}
          />
        </div>
      )}

      <div className="space-y-6 no-print">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <Button
            variant="ghost"
            size="sm"
            className="w-fit -ml-2"
            onClick={() => router.push('/referrals')}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Referrals
          </Button>

          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{referrer.name}</h1>
                <Badge variant={referrer.is_active ? 'default' : 'secondary'}>
                  {referrer.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
                {referrer.profession && (
                  <Badge variant="outline">{referrer.profession}</Badge>
                )}
                {referrer.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {referrer.phone}
                  </span>
                )}
                {referrer.address && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {referrer.address}
                  </span>
                )}
              </div>
              {referrer.bank_details && (
                <p className="text-sm text-muted-foreground mt-1">
                  Bank/GCash: {referrer.bank_details}
                </p>
              )}
              {referrer.customer && (
                <p className="text-sm mt-1">
                  Customer:{' '}
                  <Link href={`/customers/${referrer.customer.id}`} className="underline hover:text-primary">
                    {referrer.customer.name}
                  </Link>
                </p>
              )}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Button variant="outline" size="sm" onClick={() => setIsEditOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
              {balance > 0 && (
                <Button size="sm" onClick={() => setIsPayoutOpen(true)}>
                  <DollarSign className="mr-2 h-4 w-4" />
                  Record Payout
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-5">
          <StatCard
            label="Total Earned"
            value={formatCurrency(stats?.total_earned ?? 0)}
          />
          <StatCard
            label="Total Reversed"
            value={formatCurrency(stats?.total_reversed ?? 0)}
          />
          <StatCard
            label="Total Paid Out"
            value={formatCurrency(stats?.total_paid_out ?? 0)}
          />
          <StatCard
            label="Current Balance"
            value={formatCurrency(balance)}
            highlight={balance > 0}
          />
          <StatCard
            label="Pending"
            value={formatCurrency(stats?.pending_amount ?? 0)}
            sub="Not yet earned"
          />
        </div>

        {/* Default rate info */}
        <p className="text-sm text-muted-foreground">
          Default commission rate: <span className="font-semibold text-foreground">{referrer.default_commission_rate}%</span>
        </p>

        {/* Tabs */}
        <Tabs defaultValue="commissions">
          <TabsList>
            <TabsTrigger value="commissions">Commissions ({commissions.length})</TabsTrigger>
            <TabsTrigger value="payouts">Payouts ({payouts.length})</TabsTrigger>
            <TabsTrigger value="transactions">Transactions ({transactions.length})</TabsTrigger>
          </TabsList>

          {/* Commissions Tab */}
          <TabsContent value="commissions" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Commission History</CardTitle>
                  <CardDescription>All commission rows for this referrer</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => setIsTagOpen(true)}>
                  <Tag className="mr-2 h-4 w-4" />
                  Tag Transaction
                </Button>
              </CardHeader>
              <CardContent>
                {commissions.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No commissions yet.</p>
                ) : (
                  <div className="border rounded-lg overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Transaction</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Sale Amount</TableHead>
                          <TableHead className="text-right">Rate</TableHead>
                          <TableHead className="text-right">Commission</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {commissions.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell>
                              {c.transaction ? (
                                <Link
                                  href={`/pos/transactions/${c.transaction_id}`}
                                  className="font-mono text-sm hover:underline hover:text-primary flex items-center gap-1"
                                >
                                  {c.transaction.transaction_number}
                                  <ExternalLink className="h-3 w-3" />
                                </Link>
                              ) : (
                                <span className="font-mono text-sm text-muted-foreground">{c.transaction_id.slice(0, 8)}…</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {c.transaction?.transaction_date ? formatDate(c.transaction.transaction_date) : '—'}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {c.sale_amount > 0 ? formatCurrency(c.sale_amount) : '—'}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {c.commission_rate}%
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold text-sm">
                              {c.commission_amount > 0
                                ? (c.status === 'reversed'
                                  ? <span className="text-destructive">-{formatCurrency(c.commission_amount)}</span>
                                  : formatCurrency(c.commission_amount))
                                : '—'}
                            </TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${commissionStatusColors[c.status]}`}>
                                {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payouts Tab */}
          <TabsContent value="payouts" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Payout History</CardTitle>
                  <CardDescription>All recorded payouts to this referrer</CardDescription>
                </div>
                {balance > 0 && (
                  <Button size="sm" onClick={() => setIsPayoutOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Record Payout
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {payouts.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No payouts yet.</p>
                ) : (
                  <div className="border rounded-lg overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead>Reference</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Recorded By</TableHead>
                          <TableHead className="w-[80px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payouts.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell>{formatDate(p.payout_date)}</TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {paymentMethodLabels[p.payment_method] || p.payment_method}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {p.reference_number || '—'}
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold">
                              {formatCurrency(p.amount)}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {p.created_user?.full_name || p.created_user?.email || '—'}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handlePrintPayout(p)}
                                title="Print slip"
                              >
                                <Printer className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Transactions Tab */}
          <TabsContent value="transactions" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Tagged Transactions</CardTitle>
                  <CardDescription>Sales linked to this referrer</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => setIsTagOpen(true)}>
                  <Tag className="mr-2 h-4 w-4" />
                  Tag Historical
                </Button>
              </CardHeader>
              <CardContent>
                {transactions.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No transactions tagged to this referrer.</p>
                ) : (
                  <div className="border rounded-lg overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Transaction #</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead>Payment Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transactions.map((txn: any) => (
                          <TableRow key={txn.id}>
                            <TableCell>
                              <Link
                                href={`/pos/transactions/${txn.id}`}
                                className="font-mono text-sm hover:underline hover:text-primary flex items-center gap-1"
                              >
                                {txn.transaction_number}
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatDate(txn.transaction_date)}
                            </TableCell>
                            <TableCell>
                              {txn.customer ? (
                                <Link href={`/customers/${txn.customer.id}`} className="hover:underline">
                                  {txn.customer.name}
                                </Link>
                              ) : (
                                <span className="text-muted-foreground">Walk-in</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatCurrency(txn.total_amount)}
                            </TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                                txn.payment_status === 'paid'
                                  ? 'bg-green-100 text-green-800'
                                  : txn.payment_status === 'partial'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {txn.payment_status}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Modals */}
      <EditReferrerDialog referrer={referrer} open={isEditOpen} onClose={() => setIsEditOpen(false)} />
      <RecordPayoutDialog
        referrerId={id}
        balance={balance}
        open={isPayoutOpen}
        onClose={() => setIsPayoutOpen(false)}
      />
      <TagTransactionDialog
        referrerId={id}
        defaultRate={referrer.default_commission_rate}
        open={isTagOpen}
        onClose={() => setIsTagOpen(false)}
      />
    </>
  )
}
