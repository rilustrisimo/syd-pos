'use client'

import { useState } from 'react'
import { useTransactions, useSoftDeleteTransaction } from '@/hooks/useTransactions'
import { getTransaction } from '@/lib/supabase/queries/transactions'
import { printUSBReceipt } from '@/lib/utils/usb-thermal-print'
import { usePrinterStore } from '@/lib/stores/printer'
import { useBranches } from '@/hooks/useInventory'
import { useAuthStore } from '@/lib/stores/auth'
import { toast } from 'sonner'
import {
  Search,
  Receipt,
  Printer,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Trash2,
  Eye,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
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
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ReceiptData } from '@/components/print/receipt-template'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const paymentStatusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  paid: 'default',
  partial: 'secondary',
  unpaid: 'destructive',
}

export default function TransactionHistoryPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [branchFilter, setBranchFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [printingId, setPrintingId] = useState<string | null>(null)
  const [deleteTransactionId, setDeleteTransactionId] = useState<string | null>(null)
  const [detailsTransactionId, setDetailsTransactionId] = useState<string | null>(null)
  const [detailsTransaction, setDetailsTransaction] = useState<any | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)

  const { user } = useAuthStore()
  const { cupsQueueName } = usePrinterStore()

  const { data: branches } = useBranches()
  const { data: transactionsData, isLoading, refetch } = useTransactions({
    search: searchQuery || undefined,
    payment_status: statusFilter !== 'all' ? statusFilter : undefined,
    branch_id: branchFilter !== 'all' ? branchFilter : undefined,
    page: currentPage,
    limit: 20,
  })

  const softDeleteTransaction = useSoftDeleteTransaction()

  const transactions = transactionsData?.transactions || []
  const totalPages = transactionsData?.totalPages || 1

  // Fetch and display transaction details
  const handleViewDetails = async (txnId: string) => {
    setDetailsTransactionId(txnId)
    setLoadingDetails(true)
    try {
      const txn = await getTransaction(txnId)
      setDetailsTransaction(txn)
    } catch (err: any) {
      toast.error('Failed to load transaction details')
    } finally {
      setLoadingDetails(false)
    }
  }

  // Fetch full transaction details then print directly to USB thermal printer
  const handlePrintTransaction = async (txnId: string) => {
    setPrintingId(txnId)
    const toastId = toast.loading('Fetching transaction…')
    try {
      const txn = await getTransaction(txnId)
      const txnDate = new Date(txn.transaction_date)

      const receiptData: ReceiptData = {
        transaction_number: txn.transaction_number,
        date: txnDate.toLocaleDateString('en-PH'),
        time: txnDate.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
        cashier: 'Staff',
        branch: (txn.branch as any)?.name || 'Main Branch',
        customer: {
          name: (txn.customer as any)?.name || 'Walk-in Customer',
          phone: (txn.customer as any)?.phone || null,
        },
        delivery_type: txn.delivery_type,
        delivery_address: txn.delivery_address,
        items: (txn.lines || []).map((line: any) => ({
          name: line.product?.name || 'Product',
          quantity: line.quantity,
          unit_price: line.unit_price,
          uom: line.uom?.abbreviation || line.uom?.name || 'pc',
          discount: line.discount_amount || 0,
          total: line.line_total || line.quantity * line.unit_price - (line.discount_amount || 0),
        })),
        subtotal: txn.subtotal,
        discount: txn.discount_amount,
        tax: txn.tax_amount,
        total: txn.total_amount,
        payments: (txn.payments || []).map((p: any) => ({
          method: p.payment_method,
          amount: p.amount,
          reference: p.reference_number,
        })),
        amount_paid: txn.amount_paid,
        change: Math.max(0, txn.amount_paid - txn.total_amount),
        notes: txn.notes,
      }

      toast.loading('Printing receipt…', { id: toastId })
      await printUSBReceipt(receiptData, cupsQueueName)
      toast.success('Receipt printed!', { id: toastId })
    } catch (err: any) {
      toast.error(err?.message || 'Print failed — check USB printer in Settings', { id: toastId })
    } finally {
      setPrintingId(null)
    }
  }

  const handleDeleteTransaction = async () => {
    if (!deleteTransactionId || !user?.id) return

    try {
      await softDeleteTransaction.mutateAsync({
        transactionId: deleteTransactionId,
        userId: user.id,
      })
      toast.success('Transaction deleted successfully')
      setDeleteTransactionId(null)
      // Force immediate refetch to show updated list
      refetch()
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete transaction')
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Transaction History</h1>
          <p className="text-muted-foreground">
            View past transactions and reprint receipts or invoices
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search by transaction #..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCurrentPage(1)
                }}
              />
            </div>

            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value)
                setCurrentPage(1)
              }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={branchFilter}
              onValueChange={(value) => {
                setBranchFilter(value)
                setCurrentPage(1)
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {(branches as any[] || []).map((branch: any) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
          <CardDescription>
            {transactionsData?.total || 0} transactions found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-8">
              <Receipt className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No transactions found</h3>
              <p className="text-muted-foreground">
                {searchQuery || statusFilter !== 'all' || branchFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Transactions will appear here after sales'}
              </p>
            </div>
          ) : (
            <>
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Transaction #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[150px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((txn: any) => (
                      <TableRow key={txn.id}>
                        <TableCell className="font-mono text-sm">
                          {txn.transaction_number}
                        </TableCell>
                        <TableCell>
                          <div>{formatDate(txn.transaction_date)}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatTime(txn.transaction_date)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {txn.customer?.name || 'Walk-in Customer'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {txn.delivery_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(txn.total_amount)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={paymentStatusColors[txn.payment_status]}>
                            {txn.payment_status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewDetails(txn.id)}
                              title="View transaction details"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePrintTransaction(txn.id)}
                              disabled={printingId === txn.id}
                            >
                              {printingId === txn.id ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <Printer className="h-4 w-4 mr-1" />
                              )}
                              Print
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteTransactionId(txn.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteTransactionId}
        onOpenChange={(open) => !open && setDeleteTransactionId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the transaction as deleted. The transaction will no longer appear in
              reports and listings, but the data will be preserved in the database for audit purposes.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTransaction}
              className="bg-destructive hover:bg-destructive/90"
              disabled={softDeleteTransaction.isPending}
            >
              {softDeleteTransaction.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Transaction'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transaction Details Dialog */}
      <Dialog open={!!detailsTransactionId} onOpenChange={(open) => !open && setDetailsTransactionId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Transaction Details</DialogTitle>
            <DialogDescription>
              {detailsTransaction?.transaction_number}
            </DialogDescription>
          </DialogHeader>

          {loadingDetails ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : detailsTransaction ? (
            <div className="space-y-6">
              {/* Customer & Transaction Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Customer</p>
                  <p className="font-semibold">{(detailsTransaction.customer as any)?.name || 'Walk-in Customer'}</p>
                  {(detailsTransaction.customer as any)?.phone && (
                    <p className="text-sm">{(detailsTransaction.customer as any).phone}</p>
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date & Time</p>
                  <p className="font-semibold">{formatDate(detailsTransaction.transaction_date)}</p>
                  <p className="text-sm">{formatTime(detailsTransaction.transaction_date)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Branch</p>
                  <p className="font-semibold">{(detailsTransaction.branch as any)?.name || 'Main Branch'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Type</p>
                  <p className="font-semibold capitalize">{detailsTransaction.delivery_type}</p>
                </div>
              </div>

              <Separator />

              {/* Delivery Address (if applicable) */}
              {detailsTransaction.delivery_type === 'delivery' && detailsTransaction.delivery_address && (
                <>
                  <div>
                    <p className="text-sm font-semibold mb-2">Delivery Address</p>
                    <p className="text-sm">{detailsTransaction.delivery_address}</p>
                  </div>
                  <Separator />
                </>
              )}

              {/* Items List */}
              <div>
                <p className="text-sm font-semibold mb-3">Items</p>
                <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
                  {(detailsTransaction.lines || []).map((line: any) => (
                    <div key={line.id} className="pb-3 border-b last:border-0 last:pb-0">
                      <div className="flex justify-between">
                        <div className="flex-1">
                          <p className="font-medium">{line.product?.name || 'Product'}</p>
                          <p className="text-sm text-muted-foreground">
                            {line.quantity} {line.uom?.abbreviation || line.uom?.name || 'pc'} @ {formatCurrency(line.unit_price)} each
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{formatCurrency(line.quantity * line.unit_price)}</p>
                          {line.discount_amount > 0 && (
                            <p className="text-sm text-green-600">-{formatCurrency(line.discount_amount)}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="space-y-2 p-3 bg-slate-50 rounded-lg border">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatCurrency(detailsTransaction.subtotal)}</span>
                </div>
                {detailsTransaction.discount_amount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span>-{formatCurrency(detailsTransaction.discount_amount)}</span>
                  </div>
                )}
                {detailsTransaction.tax_amount > 0 && (
                  <div className="flex justify-between">
                    <span>Tax</span>
                    <span>{formatCurrency(detailsTransaction.tax_amount)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span>{formatCurrency(detailsTransaction.total_amount)}</span>
                </div>
              </div>

              {/* Payments */}
              <div>
                <p className="text-sm font-semibold mb-3">Payments</p>
                <div className="space-y-2 border rounded-lg p-3 bg-blue-50">
                  {(detailsTransaction.payments || []).map((payment: any) => (
                    <div key={payment.id} className="flex justify-between items-center">
                      <div>
                        <Badge variant="outline" className="capitalize">{payment.payment_method}</Badge>
                        {payment.reference_number && (
                          <p className="text-xs text-muted-foreground mt-1">Ref: {payment.reference_number}</p>
                        )}
                      </div>
                      <span className="font-semibold">{formatCurrency(payment.amount)}</span>
                    </div>
                  ))}
                  <Separator />
                  <div className="flex justify-between pt-2">
                    <span className="font-semibold">Amount Paid</span>
                    <span className="font-bold text-lg">{formatCurrency(detailsTransaction.amount_paid)}</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {detailsTransaction.notes && (
                <div>
                  <p className="text-sm font-semibold mb-2">Notes</p>
                  <p className="text-sm p-3 bg-amber-50 rounded-lg border">{detailsTransaction.notes}</p>
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsTransactionId(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
