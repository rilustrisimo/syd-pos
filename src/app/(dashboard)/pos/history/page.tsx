'use client'

import { useState, useMemo } from 'react'
import { useTransactions, useTransaction, useSoftDeleteTransaction } from '@/hooks/useTransactions'
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
import { PrintDialog } from '@/components/print/print-dialog'
import type { ReceiptData } from '@/components/print/receipt-template'
import type { InvoiceData } from '@/components/print/invoice-template'

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
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null)
  const [deleteTransactionId, setDeleteTransactionId] = useState<string | null>(null)

  const { user } = useAuthStore()

  const { data: branches } = useBranches()
  const { data: transactionsData, isLoading, refetch } = useTransactions({
    search: searchQuery || undefined,
    payment_status: statusFilter !== 'all' ? statusFilter : undefined,
    branch_id: branchFilter !== 'all' ? branchFilter : undefined,
    page: currentPage,
    limit: 20,
  })

  const { data: selectedTransaction, isLoading: isLoadingTransaction } = useTransaction(
    selectedTransactionId || ''
  )

  const softDeleteTransaction = useSoftDeleteTransaction()

  const transactions = transactionsData?.transactions || []
  const totalPages = transactionsData?.totalPages || 1

  // Prepare receipt data
  const receiptData: ReceiptData | null = useMemo(() => {
    if (!selectedTransaction) return null
    const txnDate = new Date(selectedTransaction.transaction_date)

    return {
      transaction_number: selectedTransaction.transaction_number,
      date: txnDate.toLocaleDateString('en-PH'),
      time: txnDate.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
      cashier: 'Staff',
      branch: (selectedTransaction.branch as any)?.name || 'Main Branch',
      customer: {
        name: (selectedTransaction.customer as any)?.name || 'Walk-in Customer',
        phone: (selectedTransaction.customer as any)?.phone || null,
      },
      delivery_type: selectedTransaction.delivery_type,
      delivery_address: selectedTransaction.delivery_address,
      items: (selectedTransaction.lines || []).map((line: any) => ({
        name: line.product?.name || 'Product',
        quantity: line.quantity,
        unit_price: line.unit_price,
        uom: line.uom?.abbreviation || line.uom?.name || 'pc',
        discount: line.discount_amount || 0,
        total: line.line_total || line.quantity * line.unit_price - (line.discount_amount || 0),
      })),
      subtotal: selectedTransaction.subtotal,
      discount: selectedTransaction.discount_amount,
      tax: selectedTransaction.tax_amount,
      total: selectedTransaction.total_amount,
      payments: (selectedTransaction.payments || []).map((p: any) => ({
        method: p.payment_method,
        amount: p.amount,
        reference: p.reference_number,
      })),
      amount_paid: selectedTransaction.amount_paid,
      change: Math.max(0, selectedTransaction.amount_paid - selectedTransaction.total_amount),
      notes: selectedTransaction.notes,
    }
  }, [selectedTransaction])

  // Prepare invoice data
  const invoiceData: InvoiceData | null = useMemo(() => {
    if (!selectedTransaction) return null
    const branch = selectedTransaction.branch as any
    const customer = selectedTransaction.customer as any

    return {
      invoice_number: selectedTransaction.transaction_number.replace('TXN', 'INV'),
      transaction_number: selectedTransaction.transaction_number,
      date: selectedTransaction.transaction_date,
      due_date: null,
      branch: {
        name: branch?.name || 'Main Branch',
        address: branch?.address || '',
        phone: branch?.phone || '',
        email: branch?.email || null,
      },
      customer: {
        name: customer?.name || 'Walk-in Customer',
        address: customer?.address || null,
        phone: customer?.phone || null,
        email: customer?.email || null,
      },
      delivery_type: selectedTransaction.delivery_type,
      delivery_address: selectedTransaction.delivery_address,
      delivery_phone: selectedTransaction.delivery_phone,
      items: (selectedTransaction.lines || []).map((line: any) => ({
        code: line.product?.code || '',
        name: line.product?.name || 'Product',
        quantity: line.quantity,
        uom: line.uom?.abbreviation || line.uom?.name || 'pc',
        unit_price: line.unit_price,
        discount: line.discount_amount || 0,
        total: line.line_total || line.quantity * line.unit_price - (line.discount_amount || 0),
      })),
      subtotal: selectedTransaction.subtotal,
      discount: selectedTransaction.discount_amount,
      tax: selectedTransaction.tax_amount,
      total: selectedTransaction.total_amount,
      amount_paid: selectedTransaction.amount_paid,
      balance_due: Math.max(0, selectedTransaction.total_amount - selectedTransaction.amount_paid),
      payments: (selectedTransaction.payments || []).map((p: any) => ({
        method: p.payment_method,
        amount: p.amount,
        reference: p.reference_number,
        date: p.payment_date,
      })),
      notes: selectedTransaction.notes,
      prepared_by: 'Staff',
    }
  }, [selectedTransaction])

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
                              onClick={() => setSelectedTransactionId(txn.id)}
                            >
                              <Printer className="h-4 w-4 mr-1" />
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

      {/* Print Dialog (shared component with thermal print support) */}
      <PrintDialog
        open={!!selectedTransactionId && !isLoadingTransaction}
        onOpenChange={(open) => !open && setSelectedTransactionId(null)}
        receiptData={receiptData}
        invoiceData={invoiceData}
        onComplete={() => setSelectedTransactionId(null)}
      />

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
    </div>
  )
}
