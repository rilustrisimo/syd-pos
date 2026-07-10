'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PageTitle } from '@/components/page-title'
import {
  useCustomer,
  useCustomerPurchaseStats,
  useCustomerTopItems,
  useUpdateCustomer,
  customerKeys,
} from '@/hooks/useCustomers'
import { useTransactions } from '@/hooks/useTransactions'
import { useARTransactionsForCustomer } from '@/hooks/useTransactions'
import { formatCurrency, formatDate } from '@/lib/utils/formatting'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  User,
  CreditCard,
  Wallet,
  Building,
  Loader2,
  Package,
  ShoppingCart,
  TrendingUp,
  Calendar,
  Truck,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Pencil,
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
import type { CustomerInput } from '@/lib/supabase/queries/customers'
import { useQueryClient } from '@tanstack/react-query'

// ── Helpers ───────────────────────────────────────────────────────────────────

const customerTypeLabels: Record<string, string> = {
  cash: 'Cash',
  credit: 'Credit',
  wholesale: 'Wholesale',
  retail: 'Retail',
  government: 'Government',
}

const customerTypeIcons: Record<string, React.ReactNode> = {
  cash: <Wallet className="h-3 w-3" />,
  credit: <CreditCard className="h-3 w-3" />,
  wholesale: <Building className="h-3 w-3" />,
  retail: <User className="h-3 w-3" />,
  government: <Building className="h-3 w-3" />,
}

const paymentStatusColors: Record<string, string> = {
  paid: 'bg-green-100 text-green-800',
  partial: 'bg-yellow-100 text-yellow-800',
  unpaid: 'bg-red-100 text-red-800',
}

function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string
  value: string
  sub?: string
  icon?: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          {icon && (
            <div className="p-2 bg-muted rounded-md text-muted-foreground">
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Edit Dialog ───────────────────────────────────────────────────────────────

function EditCustomerDialog({
  customer,
  open,
  onClose,
}: {
  customer: any
  open: boolean
  onClose: () => void
}) {
  const updateCustomer = useUpdateCustomer()
  const queryClient = useQueryClient()

  const [form, setForm] = useState<CustomerInput>({
    name: customer?.name || '',
    phone: customer?.phone || '',
    email: customer?.email || '',
    address: customer?.address || '',
    customer_type: customer?.customer_type || 'cash',
    credit_limit: customer?.credit_limit || 0,
    payment_terms: customer?.payment_terms || null,
  })

  const handleSave = async () => {
    if (!form.name?.trim()) {
      toast.error('Customer name is required')
      return
    }
    try {
      await updateCustomer.mutateAsync({ id: customer.id, input: form })
      await queryClient.invalidateQueries({ queryKey: customerKeys.detail(customer.id) })
      toast.success('Customer updated')
      onClose()
    } catch (e: any) {
      toast.error(e.message || 'Failed to update customer')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Customer</DialogTitle>
          <DialogDescription>Update customer details</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Customer name"
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
              <Label>Email</Label>
              <Input
                value={form.email || ''}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="email@example.com"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Address</Label>
            <Textarea
              value={form.address || ''}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Full address"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select
                value={form.customer_type}
                onValueChange={(v) => setForm({ ...form, customer_type: v as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                  <SelectItem value="wholesale">Wholesale</SelectItem>
                  <SelectItem value="retail">Retail</SelectItem>
                  <SelectItem value="government">Government</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Payment Terms (days)</Label>
              <Input
                type="number"
                value={form.payment_terms ?? ''}
                onChange={(e) =>
                  setForm({ ...form, payment_terms: e.target.value ? Number(e.target.value) : null })
                }
                placeholder="30"
              />
            </div>
          </div>
          {form.customer_type === 'credit' && (
            <div className="space-y-1">
              <Label>Credit Limit</Label>
              <Input
                type="number"
                value={form.credit_limit ?? 0}
                onChange={(e) => setForm({ ...form, credit_limit: Number(e.target.value) })}
                placeholder="0.00"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateCustomer.isPending}>
            {updateCustomer.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [editOpen, setEditOpen] = useState(false)
  const [txnPage, setTxnPage] = useState(1)

  const { data: customer, isLoading: customerLoading, error: customerError } = useCustomer(id)
  const { data: stats, isLoading: statsLoading } = useCustomerPurchaseStats(id)
  const { data: topItems, isLoading: itemsLoading } = useCustomerTopItems(id)
  const { data: txnData, isLoading: txnLoading } = useTransactions({
    customer_id: id,
    page: txnPage,
    limit: 20,
  })
  const { data: arTransactions, isLoading: arLoading } = useARTransactionsForCustomer(
    customer?.customer_type === 'credit' ? id : ''
  )

  if (customerLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (customerError || !customer) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">Customer not found.</p>
        <Button variant="outline" onClick={() => router.push('/customers')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Customers
        </Button>
      </div>
    )
  }

  const isCredit = customer.customer_type === 'credit'
  const availableCredit = isCredit
    ? Math.max(0, (customer.credit_limit || 0) - (customer.outstanding_balance || 0))
    : 0

  const transactions = txnData?.transactions || []
  const totalTxnPages = txnData?.totalPages || 1

  return (
    <div className="space-y-6">
      <PageTitle title={customer ? `${customer.name} · Customers` : 'Customers'} />
      {/* ── Back nav + header ──────────────────────────────────────────── */}
      <div>
        <Link
          href="/customers"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Customers
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{customer.name}</h1>
              <Badge variant="secondary" className="flex items-center gap-1">
                {customerTypeIcons[customer.customer_type]}
                {customerTypeLabels[customer.customer_type]}
              </Badge>
              {!customer.is_active && (
                <Badge variant="destructive">Inactive</Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {customer.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" />
                  {customer.phone}
                </span>
              )}
              {customer.email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" />
                  {customer.email}
                </span>
              )}
              {customer.address && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {customer.address}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Member since {formatDate(customer.created_at)}
              </span>
              {customer.payment_terms && (
                <span>Payment terms: {customer.payment_terms} days</span>
              )}
            </div>
          </div>
          <Button onClick={() => setEditOpen(true)} variant="outline" size="sm">
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────── */}
      <Tabs defaultValue="overview">
        <TabsList className={isCredit ? 'grid w-full grid-cols-4' : 'grid w-full grid-cols-3'}>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          {isCredit && <TabsTrigger value="credit">Credit / AR</TabsTrigger>}
          <TabsTrigger value="items">Top Items</TabsTrigger>
        </TabsList>

        {/* ── Overview Tab ──────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          {statsLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : stats ? (
            <>
              {/* Primary stat cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  label="Net Revenue"
                  value={formatCurrency(stats.net_revenue)}
                  sub={`${stats.total_orders} orders`}
                  icon={<TrendingUp className="h-4 w-4" />}
                />
                <StatCard
                  label="Total Orders"
                  value={stats.total_orders.toString()}
                  sub={stats.first_purchase_date ? `since ${formatDate(stats.first_purchase_date)}` : undefined}
                  icon={<ShoppingCart className="h-4 w-4" />}
                />
                <StatCard
                  label="Avg Order Value"
                  value={formatCurrency(stats.average_order_value)}
                  icon={<TrendingUp className="h-4 w-4" />}
                />
                <StatCard
                  label="Total Discounts"
                  value={formatCurrency(stats.total_discount)}
                  icon={<Package className="h-4 w-4" />}
                />
              </div>

              {/* Secondary details */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Purchase Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
                    <div>
                      <p className="text-muted-foreground">Total Sales</p>
                      <p className="font-semibold mt-0.5">{formatCurrency(stats.total_sales_amount)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Total Returns</p>
                      <p className="font-semibold mt-0.5 text-orange-600">
                        {stats.total_returns_count > 0
                          ? `${formatCurrency(stats.total_returns_amount)} (${stats.total_returns_count})`
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Delivery Fees</p>
                      <p className="font-semibold mt-0.5">
                        {stats.total_delivery_fees > 0 ? formatCurrency(stats.total_delivery_fees) : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Other Fees</p>
                      <p className="font-semibold mt-0.5">
                        {stats.total_other_fees > 0 ? formatCurrency(stats.total_other_fees) : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">First Purchase</p>
                      <p className="font-semibold mt-0.5">
                        {stats.first_purchase_date ? formatDate(stats.first_purchase_date) : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Last Purchase</p>
                      <p className="font-semibold mt-0.5">
                        {stats.last_purchase_date ? formatDate(stats.last_purchase_date) : '—'}
                      </p>
                    </div>
                    {isCredit && (
                      <>
                        <div>
                          <p className="text-muted-foreground">Credit Limit</p>
                          <p className="font-semibold mt-0.5">{formatCurrency(customer.credit_limit)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Outstanding Balance</p>
                          <p className="font-semibold mt-0.5 text-orange-600">
                            {customer.outstanding_balance > 0
                              ? formatCurrency(customer.outstanding_balance)
                              : '—'}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>

        {/* ── Transactions Tab ──────────────────────────────────────── */}
        <TabsContent value="transactions" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transaction History</CardTitle>
              <CardDescription>
                {txnData ? `${txnData.total} total transactions` : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {txnLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : transactions.length === 0 ? (
                <p className="text-center text-muted-foreground py-12">No transactions yet.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Transaction #</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Delivery</TableHead>
                          <TableHead className="text-center">Items</TableHead>
                          <TableHead className="text-right">Discount</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transactions.map((txn: any) => (
                          <TableRow key={txn.id}>
                            <TableCell className="whitespace-nowrap text-sm">
                              {formatDate(txn.transaction_date)}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {txn.transaction_number}
                            </TableCell>
                            <TableCell>
                              {txn.transaction_type === 'return' ? (
                                <Badge variant="outline" className="text-orange-600 border-orange-300 flex items-center gap-1 w-fit">
                                  <RotateCcw className="h-3 w-3" />
                                  Return
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-blue-600 border-blue-300 flex items-center gap-1 w-fit">
                                  <ShoppingCart className="h-3 w-3" />
                                  Sale
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {txn.delivery_type === 'delivery' ? (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Truck className="h-3 w-3" />
                                  Delivery
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">Pickup</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center text-sm">
                              {(txn.lines || []).length}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {Number(txn.discount_amount) > 0
                                ? <span className="text-green-700">−{formatCurrency(txn.discount_amount)}</span>
                                : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {formatCurrency(txn.total_amount)}
                            </TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${paymentStatusColors[txn.payment_status] || 'bg-muted text-muted-foreground'}`}>
                                {txn.payment_status?.charAt(0).toUpperCase() + txn.payment_status?.slice(1)}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  {totalTxnPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t">
                      <p className="text-sm text-muted-foreground">
                        Page {txnPage} of {totalTxnPages}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setTxnPage(p => Math.max(1, p - 1))}
                          disabled={txnPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Prev
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setTxnPage(p => Math.min(totalTxnPages, p + 1))}
                          disabled={txnPage === totalTxnPages}
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Credit / AR Tab (credit customers only) ───────────────── */}
        {isCredit && (
          <TabsContent value="credit" className="space-y-4 mt-4">
            {/* Credit summary cards */}
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Credit Limit</p>
                  <p className="text-2xl font-bold mt-1">{formatCurrency(customer.credit_limit)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Outstanding Balance</p>
                  <p className={`text-2xl font-bold mt-1 ${customer.outstanding_balance > 0 ? 'text-orange-600' : ''}`}>
                    {formatCurrency(customer.outstanding_balance)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Available Credit</p>
                  <p className={`text-2xl font-bold mt-1 ${availableCredit <= 0 ? 'text-red-600' : 'text-green-700'}`}>
                    {formatCurrency(availableCredit)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Unpaid invoices */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Unpaid Invoices</CardTitle>
                <CardDescription>
                  Transactions with outstanding balances
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {arLoading ? (
                  <div className="flex items-center justify-center h-24">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : !arTransactions || arTransactions.length === 0 ? (
                  <p className="text-center text-muted-foreground py-10">No outstanding invoices.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Transaction #</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-right">Paid</TableHead>
                          <TableHead className="text-right">Balance Due</TableHead>
                          <TableHead className="text-right">Days Overdue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {arTransactions.map((ar) => (
                          <TableRow key={ar.id}>
                            <TableCell className="text-sm whitespace-nowrap">
                              {formatDate(ar.transaction_date)}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {ar.transaction_number}
                            </TableCell>
                            <TableCell className="text-right">{formatCurrency(ar.total_amount)}</TableCell>
                            <TableCell className="text-right text-green-700">{formatCurrency(ar.amount_paid)}</TableCell>
                            <TableCell className="text-right font-semibold text-orange-600">
                              {formatCurrency(ar.balance_due)}
                            </TableCell>
                            <TableCell className="text-right">
                              <span className={`text-sm font-medium ${ar.days_overdue > 30 ? 'text-red-600' : 'text-muted-foreground'}`}>
                                {ar.days_overdue} days
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
        )}

        {/* ── Top Items Tab ─────────────────────────────────────────── */}
        <TabsContent value="items" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Purchased Items</CardTitle>
              <CardDescription>Top 10 products by total peso spent</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {itemsLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !topItems || topItems.length === 0 ? (
                <p className="text-center text-muted-foreground py-12">No purchase data yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead className="w-24">Code</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Total Qty</TableHead>
                        <TableHead className="text-right">Total Spent</TableHead>
                        <TableHead className="text-right"># Orders</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topItems.map((item, idx) => (
                        <TableRow key={item.product_id}>
                          <TableCell className="text-muted-foreground text-sm">{idx + 1}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {item.product_code}
                          </TableCell>
                          <TableCell className="font-medium">{item.product_name}</TableCell>
                          <TableCell className="text-right font-mono">
                            {item.total_quantity % 1 === 0
                              ? item.total_quantity.toFixed(0)
                              : item.total_quantity.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(item.total_amount)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {item.order_count}
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

      {/* Edit dialog */}
      {editOpen && (
        <EditCustomerDialog
          customer={customer}
          open={editOpen}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  )
}
