'use client'

import { useState } from 'react'
import { useARAgingByCustomer, useARTransactionsForCustomer, useRecordARPayment } from '@/hooks/useTransactions'
import { useAuthStore } from '@/lib/stores/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  AlertTriangle,
  ChevronRight,
  Clock,
  CreditCard,
  DollarSign,
  Loader2,
  Phone,
  RefreshCw,
  Users,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils/formatting'
import { ARAgingCustomer, ARTransaction } from '@/lib/supabase/queries/transactions'
import { toast } from 'sonner'

function AgingBadge({ days }: { days: number }) {
  if (days <= 30) {
    return <Badge variant="secondary">Current</Badge>
  } else if (days <= 60) {
    return <Badge className="bg-yellow-500 text-white">31-60 Days</Badge>
  } else if (days <= 90) {
    return <Badge className="bg-orange-500 text-white">61-90 Days</Badge>
  } else {
    return <Badge variant="destructive">90+ Days</Badge>
  }
}

interface PaymentDialogProps {
  transaction: ARTransaction | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

function PaymentDialog({ transaction, open, onOpenChange, onSuccess }: PaymentDialogProps) {
  const { user } = useAuthStore()
  const recordPayment = useRecordARPayment()
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'gcash' | 'maya' | 'bank_transfer'>('cash')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')

  if (!transaction) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const paymentAmount = Number(amount)
    if (paymentAmount <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    if (paymentAmount > transaction.balance_due) {
      toast.error('Payment amount cannot exceed balance due')
      return
    }

    try {
      await recordPayment.mutateAsync({
        input: {
          transaction_id: transaction.id,
          customer_id: transaction.customer.id,
          payment_method: paymentMethod,
          amount: paymentAmount,
          reference_number: reference || null,
        },
        userId: user?.id || '',
      })

      toast.success('Payment recorded successfully')
      onOpenChange(false)
      setAmount('')
      setReference('')
      onSuccess()
    } catch (error) {
      toast.error('Failed to record payment')
    }
  }

  const handleFullPayment = () => {
    setAmount(transaction.balance_due.toFixed(2))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Record Payment
          </DialogTitle>
          <DialogDescription>
            Recording payment for invoice {transaction.transaction_number}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Invoice Info */}
          <div className="p-3 bg-muted rounded-lg space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Invoice:</span>
              <span className="font-medium">{transaction.transaction_number}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Amount:</span>
              <span>{formatCurrency(transaction.total_amount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Already Paid:</span>
              <span className="text-green-600">{formatCurrency(transaction.amount_paid)}</span>
            </div>
            <div className="flex justify-between font-medium border-t pt-1">
              <span>Balance Due:</span>
              <span className="text-destructive">{formatCurrency(transaction.balance_due)}</span>
            </div>
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <Label>Payment Method</Label>
            <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="gcash">GCash</SelectItem>
                <SelectItem value="maya">Maya</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Amount</Label>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0"
                onClick={handleFullPayment}
              >
                Pay Full Balance
              </Button>
            </div>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              max={transaction.balance_due}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>

          {/* Reference Number */}
          {paymentMethod !== 'cash' && (
            <div className="space-y-2">
              <Label>Reference Number</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Transaction/Reference #"
              />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={recordPayment.isPending}>
              {recordPayment.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4 mr-2" />
              )}
              Record Payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CustomerDetailDialog({
  customer,
  open,
  onOpenChange,
  onPaymentSuccess,
}: {
  customer: ARAgingCustomer | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onPaymentSuccess: () => void
}) {
  const { data: transactions, isLoading, refetch } = useARTransactionsForCustomer(
    customer?.customer_id || ''
  )
  const [selectedTxn, setSelectedTxn] = useState<ARTransaction | null>(null)
  const [paymentOpen, setPaymentOpen] = useState(false)

  if (!customer) return null

  const handleRecordPayment = (txn: ARTransaction) => {
    setSelectedTxn(txn)
    setPaymentOpen(true)
  }

  const handlePaymentSuccess = () => {
    refetch()
    onPaymentSuccess()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{customer.customer_name}</DialogTitle>
            <DialogDescription>
              Outstanding balance details and transaction history
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Customer Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <p className="font-medium">{customer.customer_phone || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Customer Type</p>
                <p className="font-medium capitalize">{customer.customer_type}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Credit Limit</p>
                <p className="font-medium">{formatCurrency(customer.credit_limit)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Outstanding</p>
                <p className="font-medium text-destructive">
                  {formatCurrency(customer.total_outstanding)}
                </p>
              </div>
            </div>

            {/* Aging Breakdown */}
            <div>
              <h4 className="font-medium mb-3">Aging Breakdown</h4>
              <div className="grid grid-cols-4 gap-3">
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">Current</p>
                  <p className="font-semibold">{formatCurrency(customer.current)}</p>
                </div>
                <div className="p-3 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                  <p className="text-xs text-muted-foreground">31-60 Days</p>
                  <p className="font-semibold text-yellow-600">{formatCurrency(customer.days_31_60)}</p>
                </div>
                <div className="p-3 bg-orange-50 dark:bg-orange-950 rounded-lg">
                  <p className="text-xs text-muted-foreground">61-90 Days</p>
                  <p className="font-semibold text-orange-600">{formatCurrency(customer.days_61_90)}</p>
                </div>
                <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg">
                  <p className="text-xs text-muted-foreground">90+ Days</p>
                  <p className="font-semibold text-destructive">{formatCurrency(customer.over_90)}</p>
                </div>
              </div>
            </div>

            {/* Transaction List */}
            <div>
              <h4 className="font-medium mb-3">Outstanding Invoices ({customer.transaction_count})</h4>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : transactions && transactions.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead>Age</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((txn) => (
                      <TableRow key={txn.id}>
                        <TableCell className="font-medium">{txn.transaction_number}</TableCell>
                        <TableCell>{formatDate(txn.transaction_date)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(txn.total_amount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(txn.amount_paid)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(txn.balance_due)}
                        </TableCell>
                        <TableCell>
                          <AgingBadge days={txn.days_overdue} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRecordPayment(txn)
                            }}
                          >
                            <CreditCard className="h-4 w-4 mr-1" />
                            Pay
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-4">No outstanding invoices</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PaymentDialog
        transaction={selectedTxn}
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        onSuccess={handlePaymentSuccess}
      />
    </>
  )
}

export default function ARAgingReportPage() {
  const { data, isLoading, refetch, isRefetching } = useARAgingByCustomer()
  const [selectedCustomer, setSelectedCustomer] = useState<ARAgingCustomer | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const handleViewDetails = (customer: ARAgingCustomer) => {
    setSelectedCustomer(customer)
    setDetailOpen(true)
  }

  const handlePaymentSuccess = () => {
    refetch()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">AR Aging Report</h1>
          <p className="text-muted-foreground">
            Accounts receivable aging by customer
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isRefetching}
        >
          {isRefetching ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      {data?.summary && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Outstanding</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(data.summary.total_outstanding)}
              </div>
              <p className="text-xs text-muted-foreground">
                From {data.summary.customer_count} customers
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Current (0-30)</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(data.summary.current)}</div>
              <p className="text-xs text-muted-foreground">
                {data.summary.total_outstanding > 0
                  ? ((data.summary.current / data.summary.total_outstanding) * 100).toFixed(1)
                  : 0}
                % of total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">31-60 Days</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                {formatCurrency(data.summary.days_31_60)}
              </div>
              <p className="text-xs text-muted-foreground">
                {data.summary.total_outstanding > 0
                  ? ((data.summary.days_31_60 / data.summary.total_outstanding) * 100).toFixed(1)
                  : 0}
                % of total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">61-90 Days</CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {formatCurrency(data.summary.days_61_90)}
              </div>
              <p className="text-xs text-muted-foreground">
                {data.summary.total_outstanding > 0
                  ? ((data.summary.days_61_90 / data.summary.total_outstanding) * 100).toFixed(1)
                  : 0}
                % of total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">90+ Days</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                {formatCurrency(data.summary.over_90)}
              </div>
              <p className="text-xs text-muted-foreground">
                {data.summary.total_outstanding > 0
                  ? ((data.summary.over_90 / data.summary.total_outstanding) * 100).toFixed(1)
                  : 0}
                % of total
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Customer Table */}
      <Card>
        <CardHeader>
          <CardTitle>Customers with Outstanding Balance</CardTitle>
          <CardDescription>
            Click on a customer to view details and record payments
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : data?.customers && data.customers.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Credit Limit</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">31-60</TableHead>
                  <TableHead className="text-right">61-90</TableHead>
                  <TableHead className="text-right">90+</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-center">Invoices</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.customers.map((customer) => {
                  const utilizationPct =
                    customer.credit_limit > 0
                      ? (customer.total_outstanding / customer.credit_limit) * 100
                      : 0
                  const isOverLimit = utilizationPct > 100

                  return (
                    <TableRow
                      key={customer.customer_id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleViewDetails(customer)}
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium">{customer.customer_name}</p>
                          {customer.customer_phone && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {customer.customer_phone}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {customer.customer_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(customer.credit_limit)}
                        {isOverLimit && (
                          <Badge variant="destructive" className="ml-2 text-xs">
                            Over Limit
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {customer.current > 0 ? formatCurrency(customer.current) : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {customer.days_31_60 > 0 ? (
                          <span className="text-yellow-600">
                            {formatCurrency(customer.days_31_60)}
                          </span>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {customer.days_61_90 > 0 ? (
                          <span className="text-orange-600">
                            {formatCurrency(customer.days_61_90)}
                          </span>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {customer.over_90 > 0 ? (
                          <span className="text-destructive font-medium">
                            {formatCurrency(customer.over_90)}
                          </span>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {formatCurrency(customer.total_outstanding)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{customer.transaction_count}</Badge>
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <Users className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-medium">No outstanding balances</h3>
              <p className="text-muted-foreground">
                All customers have paid their invoices
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Customer Detail Dialog */}
      <CustomerDetailDialog
        customer={selectedCustomer}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onPaymentSuccess={handlePaymentSuccess}
      />
    </div>
  )
}
