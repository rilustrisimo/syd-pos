'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useTransactions, useSoftDeleteTransaction, useUpdateTransactionDeliveryType } from '@/hooks/useTransactions'
import { getTransaction } from '@/lib/supabase/queries/transactions'
import { printElement } from '@/lib/utils/print'
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
  Edit,
  Truck,
  RotateCcw,
  ShoppingCart,
  ExternalLink,
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
import type { A4ReceiptData } from '@/components/print/a4-receipt-template'
import { A4ReceiptTemplate } from '@/components/print/a4-receipt-template'

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

const STORAGE_KEY = 'transaction-history-filters'

export default function TransactionHistoryPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [branchFilter, setBranchFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [isInitialized, setIsInitialized] = useState(false)
  const [printingId, setPrintingId] = useState<string | null>(null)
  const [deleteTransactionId, setDeleteTransactionId] = useState<string | null>(null)
  const [detailsTransactionId, setDetailsTransactionId] = useState<string | null>(null)
  const [detailsTransaction, setDetailsTransaction] = useState<any | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)
  const [printData, setPrintData] = useState<A4ReceiptData | null>(null)

  // Edit delivery type state
  const [isEditingDelivery, setIsEditingDelivery] = useState(false)
  const [editDeliveryType, setEditDeliveryType] = useState<'pickup' | 'delivery'>('pickup')
  const [editDeliveryAddress, setEditDeliveryAddress] = useState('')
  const [editDeliveryPhone, setEditDeliveryPhone] = useState('')

  const { user } = useAuthStore()

  // Load filters from sessionStorage on mount
  useEffect(() => {
    try {
      const savedFilters = sessionStorage.getItem(STORAGE_KEY)
      if (savedFilters) {
        const parsed = JSON.parse(savedFilters)
        setSearchQuery(parsed.searchQuery || '')
        setStatusFilter(parsed.statusFilter || 'all')
        setBranchFilter(parsed.branchFilter || 'all')
        setCurrentPage(parsed.currentPage || 1)
      }
    } catch (error) {
      console.error('Failed to load saved filters:', error)
    } finally {
      setIsInitialized(true)
    }
  }, [])

  // Save filters to sessionStorage whenever they change
  useEffect(() => {
    if (!isInitialized) return
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ searchQuery, statusFilter, branchFilter, currentPage })
      )
    } catch (error) {
      console.error('Failed to save filters:', error)
    }
  }, [searchQuery, statusFilter, branchFilter, currentPage, isInitialized])

  // Detect whether search looks like a transaction # or a customer name
  const isTransactionSearch = searchQuery.toUpperCase().startsWith('TXN')

  const { data: branches } = useBranches()
  const { data: transactionsData, isLoading, refetch } = useTransactions({
    search: isTransactionSearch ? searchQuery : undefined,
    customer_name: !isTransactionSearch && searchQuery ? searchQuery : undefined,
    payment_status: statusFilter !== 'all' ? statusFilter : undefined,
    branch_id: branchFilter !== 'all' ? branchFilter : undefined,
    page: currentPage,
    limit: 20,
    enabled: isInitialized,
  })

  const softDeleteTransaction = useSoftDeleteTransaction()
  const updateDeliveryType = useUpdateTransactionDeliveryType()

  const transactions = transactionsData?.transactions || []
  const totalPages = transactionsData?.totalPages || 1

  // Fetch and display transaction details
  const handleViewDetails = async (txnId: string) => {
    setDetailsTransactionId(txnId)
    setLoadingDetails(true)
    setIsEditingDelivery(false)
    try {
      const txn = await getTransaction(txnId)
      setDetailsTransaction(txn)
      setEditDeliveryType(txn.delivery_type)
      setEditDeliveryAddress(txn.delivery_address || '')
      setEditDeliveryPhone(txn.delivery_phone || '')
    } catch (err: any) {
      toast.error('Failed to load transaction details')
    } finally {
      setLoadingDetails(false)
    }
  }

  // Start editing delivery type
  const handleStartEditDelivery = () => {
    setIsEditingDelivery(true)
  }

  // Cancel editing
  const handleCancelEditDelivery = () => {
    setIsEditingDelivery(false)
    if (detailsTransaction) {
      setEditDeliveryType(detailsTransaction.delivery_type)
      setEditDeliveryAddress(detailsTransaction.delivery_address || '')
      setEditDeliveryPhone(detailsTransaction.delivery_phone || '')
    }
  }

  // Save delivery type changes
  const handleSaveDeliveryType = async () => {
    if (!detailsTransaction) return

    const toastId = toast.loading('Updating delivery type...')
    try {
      await updateDeliveryType.mutateAsync({
        transactionId: detailsTransaction.id,
        deliveryType: editDeliveryType,
        deliveryAddress: editDeliveryType === 'delivery' ? editDeliveryAddress : null,
        deliveryPhone: editDeliveryType === 'delivery' ? editDeliveryPhone : null,
      })

      toast.success('Delivery type updated successfully', { id: toastId })
      setIsEditingDelivery(false)
      
      // Refresh transaction details
      const updatedTxn = await getTransaction(detailsTransaction.id)
      setDetailsTransaction(updatedTxn)
    } catch (error: any) {
      toast.error(error.message || 'Failed to update delivery type', { id: toastId })
    }
  }

  // Fetch full transaction details then print A4 receipt
  const handlePrintTransaction = async (txnId: string) => {
    setPrintingId(txnId)
    const toastId = toast.loading('Preparing receipt…')
    try {
      const txn = await getTransaction(txnId)
      const txnDate = new Date(txn.transaction_date)
      const customer = txn.customer as any
      const branch = txn.branch as any

      const receiptData: A4ReceiptData = {
        transaction_number: txn.transaction_number,
        transaction_type: (txn.transaction_type as any) === 'return' ? 'return' : 'sale',
        date: txn.transaction_date,
        time: txnDate.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
        branch: branch?.name || 'Main Branch',
        cashier: (txn as any).created_by_user?.full_name || null,
        customer: {
          name: customer?.name || 'Walk-in Customer',
          phone: customer?.phone || null,
          email: customer?.email || null,
          address: customer?.address || null,
        },
        delivery_type: txn.delivery_type,
        delivery_address: txn.delivery_address,
        delivery_phone: (txn as any).delivery_phone || null,
        items: (txn.lines || []).map((line: any) => ({
          code: line.product?.code || null,
          name: line.product?.name || 'Product',
          variant: line.variant?.name || null,
          quantity: line.quantity,
          unit_price: line.unit_price,
          uom: line.uom?.abbreviation || line.uom?.name || 'pc',
          discount: line.discount_amount || 0,
          total: line.quantity * line.unit_price,
        })),
        // Use gross subtotal (sum of qty × price before discounts) so the receipt reads:
        // gross − total_discount = total (matching the immediate checkout receipt format)
        subtotal: (txn.lines || []).reduce((s: number, l: any) => s + l.quantity * l.unit_price, 0),
        discount: txn.discount_amount,
        delivery_fee: (txn as any).delivery_fee || 0,
        other_fees: (txn as any).other_fees || 0,
        other_fees_notes: (txn as any).other_fees_notes || null,
        tax: txn.tax_amount,
        total: txn.total_amount,
        payments: (txn.payments || []).map((p: any) => ({
          method: p.payment_method,
          amount: p.amount,
          reference: p.reference_number,
          date: p.payment_date,
        })),
        amount_paid: txn.amount_paid,
        balance_due: Math.max(0, txn.total_amount - txn.amount_paid),
        payment_status: txn.payment_status as 'paid' | 'partial' | 'unpaid',
        notes: txn.notes,
      }

      setPrintData(receiptData)
      toast.dismiss(toastId)

      setTimeout(() => {
        if (printRef.current) {
          printElement(printRef.current, {
            title: `${receiptData.transaction_type === 'return' ? 'Return' : 'Sales'} Summary - ${receiptData.transaction_number}`,
            paperSize: 'a4',
          })
          toast.success('Print dialog opened')
          setPrintData(null)
          setPrintingId(null)
        }
      }, 150)
    } catch (err: any) {
      toast.error(err?.message || 'Print failed', { id: toastId })
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
                placeholder="Search by transaction # or customer name…"
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
          {isLoading || !isInitialized ? (
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
                      <TableHead>Delivery</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[150px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((txn: any) => {
                      const isReturn = txn.transaction_type === 'return'
                      
                      return (
                      <TableRow 
                        key={txn.id}
                        className={isReturn ? 'bg-orange-50/50 hover:bg-orange-50' : ''}
                      >
                        <TableCell className="font-mono text-sm">
                          <div className="flex items-center gap-2">
                            {isReturn ? (
                              <RotateCcw className="h-4 w-4 text-orange-600" />
                            ) : (
                              <ShoppingCart className="h-4 w-4 text-blue-600" />
                            )}
                            <Link
                              href={`/pos/transactions/${txn.id}`}
                              className={`hover:underline hover:text-primary font-mono text-sm ${isReturn ? 'text-orange-700 font-semibold' : ''}`}
                            >
                              {txn.transaction_number}
                            </Link>
                          </div>
                          {isReturn && txn.notes && (
                            <div className="text-xs text-orange-600 mt-1 flex items-center gap-1">
                              <ExternalLink className="h-3 w-3" />
                              <button
                                onClick={() => {
                                  const match = txn.notes.match(/TXN-\d{8}-\d{4}/)
                                  if (match) {
                                    const originalTxn = transactions.find((t: any) => t.transaction_number === match[0])
                                    if (originalTxn) {
                                      handleViewDetails(originalTxn.id)
                                    } else {
                                      toast.info(`Original sale: ${match[0]}`)
                                    }
                                  }
                                }}
                                className="hover:underline"
                              >
                                Ref: {txn.notes.match(/TXN-\d{8}-\d{4}/)?.[0] || 'N/A'}
                              </button>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div>{formatDate(txn.transaction_date)}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatTime(txn.transaction_date)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {txn.customer?.id ? (
                            <Link
                              href={`/customers/${txn.customer.id}`}
                              className="hover:underline hover:text-primary"
                            >
                              {txn.customer.name || 'Walk-in Customer'}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">Walk-in Customer</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={isReturn ? 'secondary' : 'default'}
                            className={isReturn ? 'bg-orange-100 text-orange-700 border-orange-300' : 'bg-blue-100 text-blue-700 border-blue-300'}
                          >
                            {isReturn ? (
                              <><RotateCcw className="h-3 w-3 mr-1" />Return</>
                            ) : (
                              <><ShoppingCart className="h-3 w-3 mr-1" />Sale</>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {txn.delivery_type}
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-right font-semibold ${isReturn ? 'text-orange-700' : ''}`}>
                          {isReturn && '- '}{formatCurrency(Math.abs(txn.total_amount))}
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
                    )})}
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
                  <p className="text-sm text-muted-foreground flex items-center justify-between">
                    <span>Delivery Type</span>
                    {!isEditingDelivery && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2"
                        onClick={handleStartEditDelivery}
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                    )}
                  </p>
                  {isEditingDelivery ? (
                    <Select value={editDeliveryType} onValueChange={(v: 'pickup' | 'delivery') => setEditDeliveryType(v)}>
                      <SelectTrigger className="h-8 mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pickup">Pickup</SelectItem>
                        <SelectItem value="delivery">Delivery</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="font-semibold flex items-center gap-2">
                      {detailsTransaction.delivery_type === 'delivery' && <Truck className="h-4 w-4" />}
                      <span className="capitalize">{detailsTransaction.delivery_type}</span>
                    </p>
                  )}
                </div>
              </div>

              <Separator />

              {/* Delivery Address (if applicable or being edited) */}
              {(detailsTransaction.delivery_type === 'delivery' || (isEditingDelivery && editDeliveryType === 'delivery')) && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-semibold mb-2">Delivery Address</p>
                      {isEditingDelivery ? (
                        <Input
                          value={editDeliveryAddress}
                          onChange={(e) => setEditDeliveryAddress(e.target.value)}
                          placeholder="Enter delivery address"
                          className="h-8"
                        />
                      ) : (
                        <p className="text-sm">{detailsTransaction.delivery_address || 'Not provided'}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold mb-2">Delivery Phone</p>
                      {isEditingDelivery ? (
                        <Input
                          value={editDeliveryPhone}
                          onChange={(e) => setEditDeliveryPhone(e.target.value)}
                          placeholder="Enter delivery phone"
                          className="h-8"
                        />
                      ) : (
                        <p className="text-sm">{detailsTransaction.delivery_phone || 'Not provided'}</p>
                      )}
                    </div>
                  </div>
                  {isEditingDelivery && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveDeliveryType}>
                        Save Changes
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleCancelEditDelivery}>
                        Cancel
                      </Button>
                    </div>
                  )}
                  <Separator />
                </>
              )}

              {/* If editing and pickup is selected, show save button */}
              {isEditingDelivery && editDeliveryType === 'pickup' && (
                <>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveDeliveryType}>
                      Save Changes
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleCancelEditDelivery}>
                      Cancel
                    </Button>
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
                  <span>{formatCurrency((detailsTransaction.lines || []).reduce((s: number, l: any) => s + l.quantity * l.unit_price, 0))}</span>
                </div>
                {(detailsTransaction.discount_amount || 0) > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount{detailsTransaction.discount_percentage > 0 ? ` (${detailsTransaction.discount_percentage}%)` : ''}</span>
                    <span>-{formatCurrency(detailsTransaction.discount_amount)}</span>
                  </div>
                )}
                {(detailsTransaction as any).delivery_fee > 0 && (
                  <div className="flex justify-between text-blue-600">
                    <span>Delivery Fee</span>
                    <span>+{formatCurrency((detailsTransaction as any).delivery_fee)}</span>
                  </div>
                )}
                {(detailsTransaction as any).other_fees > 0 && (
                  <div className="flex justify-between text-amber-600">
                    <span>Other Fees {(detailsTransaction as any).other_fees_notes && `(${(detailsTransaction as any).other_fees_notes})`}</span>
                    <span>+{formatCurrency((detailsTransaction as any).other_fees)}</span>
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

              {/* Paper Invoice/OR cross-reference */}
              <div>
                <p className="text-sm font-semibold mb-2">Paper Invoice/OR</p>
                <p className="text-sm text-muted-foreground">
                  {detailsTransaction.manual_invoice_number ? (
                    <span className="font-mono font-medium text-foreground">{detailsTransaction.manual_invoice_number}</span>
                  ) : (
                    'Not recorded'
                  )}
                </p>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsTransactionId(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden A4 print template */}
      {printData && (
        <div style={{ position: 'absolute', left: '-9999px' }}>
          <div ref={printRef}>
            <A4ReceiptTemplate data={printData} />
          </div>
        </div>
      )}
    </div>
  )
}
