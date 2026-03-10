'use client'

import { useState, useMemo } from 'react'
import { useTransactions, useTransaction, useCreateReturn, useSoftDeleteTransaction } from '@/hooks/useTransactions'
import { getTransaction } from '@/lib/supabase/queries/transactions'
import { useBranches } from '@/hooks/useInventory'
import { useAuthStore } from '@/lib/stores/auth'
import { toast } from 'sonner'
import { RETURN_REASON_CODES } from '@/lib/supabase/queries/transactions'
import {
  Search,
  RotateCcw,
  Receipt,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Package,
  Check,
  X,
  Eye,
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
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

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

interface ReturnLine {
  lineId: string
  productId: string
  productName: string
  productCode: string
  variantId: string | null
  maxQuantity: number
  quantity: number
  uomId: string
  uomName: string
  unitPrice: number
  cogsPerUnit: number
  selected: boolean
  should_restock: boolean
  return_reason: 'customer_request' | 'wrong_item' | 'defective' | 'damaged' | 'expired' | 'quality_issue' | 'other'
}

export default function ReturnsPage() {
  const { user } = useAuthStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [branchFilter, setBranchFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [detailsTransactionId, setDetailsTransactionId] = useState<string | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)

  // Return dialog state
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null)
  const [returnLines, setReturnLines] = useState<ReturnLine[]>([])
  const [returnReason, setReturnReason] = useState('')
  const [returnNotes, setReturnNotes] = useState('')
  const [refundMethod, setRefundMethod] = useState<'cash' | 'gcash' | 'maya' | 'bank_transfer' | 'store_credit'>('cash')
  const [refundReference, setRefundReference] = useState('')

  const { data: branches } = useBranches()
  const { data: transactionsData, isLoading } = useTransactions({
    search: searchQuery || undefined,
    transaction_type: 'sale',
    payment_status: 'paid',
    branch_id: branchFilter !== 'all' ? branchFilter : undefined,
    page: currentPage,
    limit: 20,
  })

  const { data: selectedTransaction, isLoading: isLoadingTransaction } = useTransaction(
    selectedTransactionId || ''
  )

  const createReturn = useCreateReturn()
  const softDeleteTransaction = useSoftDeleteTransaction()
  const [deleteTransactionId, setDeleteTransactionId] = useState<string | null>(null)

  const transactions = transactionsData?.transactions || []
  const totalPages = transactionsData?.totalPages || 1

  // Initialize return lines when transaction is selected
  const handleSelectTransaction = (txnId: string) => {
    setSelectedTransactionId(txnId)
    setReturnLines([])
    setReturnReason('')
    setReturnNotes('')
    setRefundMethod('cash')
    setRefundReference('')
  }

  // View transaction details
  const handleViewDetails = async (txnId: string) => {
    setDetailsTransactionId(txnId)
    setLoadingDetails(true)
    try {
      const txn = await getTransaction(txnId)
      // The details will be displayed, but we're just fetching to ensure we have full data
    } catch (err: any) {
      toast.error('Failed to load transaction details')
    } finally {
      setLoadingDetails(false)
    }
  }

  // Populate return lines when transaction data loads
  useMemo(() => {
    if (selectedTransaction?.lines) {
      const lines: ReturnLine[] = selectedTransaction.lines.map((line: any) => ({
        lineId: line.id,
        productId: line.product_id,
        productName: line.product?.name || 'Product',
        productCode: line.product?.code || '',
        variantId: line.variant_id,
        maxQuantity: line.quantity,
        quantity: 0,
        uomId: line.uom_id,
        uomName: line.uom?.abbreviation || line.uom?.name || 'pc',
        unitPrice: line.unit_price,
        cogsPerUnit: line.cogs_per_unit,
        selected: false,
        should_restock: true,
        return_reason: 'customer_request' as const,
      }))
      setReturnLines(lines)
    }
  }, [selectedTransaction])

  // Calculate refund total
  const refundTotal = useMemo(() => {
    return returnLines
      .filter(line => line.selected && line.quantity > 0)
      .reduce((sum, line) => sum + (line.quantity * line.unitPrice), 0)
  }, [returnLines])

  // Toggle line selection
  const toggleLineSelection = (lineId: string) => {
    setReturnLines(prev => prev.map(line => {
      if (line.lineId === lineId) {
        const newSelected = !line.selected
        return {
          ...line,
          selected: newSelected,
          quantity: newSelected ? line.maxQuantity : 0,
        }
      }
      return line
    }))
  }

  // Update line quantity
  const updateLineQuantity = (lineId: string, quantity: number) => {
    setReturnLines(prev => prev.map(line => {
      if (line.lineId === lineId) {
        return {
          ...line,
          quantity: Math.min(Math.max(0, quantity), line.maxQuantity),
        }
      }
      return line
    }))
  }

  // Update line restock
  const toggleLineRestock = (lineId: string) => {
    setReturnLines(prev => prev.map(line => {
      if (line.lineId === lineId) {
        return { ...line, should_restock: !line.should_restock }
      }
      return line
    }))
  }

  // Update line reason code
  const updateLineReasonCode = (lineId: string, return_reason: ReturnLine['return_reason']) => {
    setReturnLines(prev => prev.map(line => {
      if (line.lineId === lineId) {
        // Auto-set should_restock based on reason (damaged/expired/defective/quality_issue = don't restock)
        return {
          ...line,
          return_reason,
          should_restock: ['damaged', 'expired', 'defective', 'quality_issue'].includes(return_reason) ? false : line.should_restock,
        }
      }
      return line
    }))
  }

  // Process return
  const handleProcessReturn = async () => {
    if (!selectedTransaction || !user) return

    const selectedLines = returnLines.filter(line => line.selected && line.quantity > 0)

    if (selectedLines.length === 0) {
      toast.error('Please select at least one item to return')
      return
    }

    if (!returnReason.trim()) {
      toast.error('Please provide a reason for the return')
      return
    }

    try {
      await createReturn.mutateAsync({
        input: {
          original_transaction_id: selectedTransaction.id,
          branch_id: selectedTransaction.branch_id,
          customer_id: selectedTransaction.customer_id,
          reason: returnReason,
          notes: returnNotes || null,
        },
        lines: selectedLines.map(line => ({
          original_line_id: line.lineId,
          product_id: line.productId,
          variant_id: line.variantId,
          quantity: line.quantity,
          uom_id: line.uomId,
          unit_price: line.unitPrice,
          cogs_per_unit: line.cogsPerUnit,
          should_restock: line.should_restock,
          return_reason: line.return_reason,
        })),
        refund: {
          refund_method: refundMethod,
          amount: refundTotal,
          reference_number: refundReference || null,
          notes: `Refund for ${selectedTransaction.transaction_number}`,
        },
        userId: user.id,
      })

      toast.success('Return processed successfully')
      setSelectedTransactionId(null)
    } catch (error: any) {
      toast.error(error.message || 'Failed to process return')
    }
  }

  const hasSelectedItems = returnLines.some(line => line.selected && line.quantity > 0)

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Returns & Refunds</h1>
          <p className="text-muted-foreground">
            Process product returns and issue refunds
          </p>
        </div>
      </div>

      {/* Instructions */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>How to process a return</AlertTitle>
        <AlertDescription>
          Search for the original transaction, click &quot;Return&quot;, select the items being returned,
          specify quantities and reason, then process the refund.
        </AlertDescription>
      </Alert>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Find Transaction</CardTitle>
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
          <CardTitle>Paid Transactions</CardTitle>
          <CardDescription>
            {transactionsData?.total || 0} transactions available for return
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
                {searchQuery || branchFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Paid transactions will appear here'}
              </p>
            </div>
          ) : (
            <>
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Transaction #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
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
                          {txn.lines && txn.lines.length > 0 ? (
                            <Badge variant="outline">
                              {txn.lines.length} {txn.lines.length === 1 ? 'item' : 'items'}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">No items</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(txn.total_amount)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewDetails(txn.id)}
                              title="View transaction details"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSelectTransaction(txn.id)}
                            >
                              <RotateCcw className="h-4 w-4 mr-1" />
                              Return
                            </Button>
                            {user?.role && ['admin', 'manager'].includes(user.role) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteTransactionId(txn.id)}
                                className="text-destructive hover:text-destructive"
                                title="Delete transaction"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
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

      {/* Return Dialog */}
      <Dialog
        open={!!selectedTransactionId}
        onOpenChange={(open) => !open && setSelectedTransactionId(null)}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              Process Return
            </DialogTitle>
            <DialogDescription>
              {selectedTransaction?.transaction_number} - Select items to return
            </DialogDescription>
          </DialogHeader>

          {isLoadingTransaction ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex-1 overflow-auto space-y-4 py-4">
              {/* Transaction Info */}
              <div className="flex flex-wrap gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Customer:</span>{' '}
                  <span className="font-medium">
                    {(selectedTransaction?.customer as any)?.name || 'Walk-in Customer'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Date:</span>{' '}
                  <span className="font-medium">
                    {selectedTransaction && formatDate(selectedTransaction.transaction_date)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Original Total:</span>{' '}
                  <span className="font-medium">
                    {selectedTransaction && formatCurrency(selectedTransaction.total_amount)}
                  </span>
                </div>
              </div>

              <Separator />

              {/* Items to Return */}
              <div>
                <h4 className="font-semibold mb-4 flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Select Items to Return
                </h4>
                <div className="space-y-2.5">
                  {returnLines.map((line) => (
                    <div
                      key={line.lineId}
                      className={`border rounded-lg p-4 transition-all ${
                        line.selected 
                          ? 'border-primary bg-primary/5 shadow-sm' 
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id={`line-${line.lineId}`}
                          checked={line.selected}
                          onCheckedChange={() => toggleLineSelection(line.lineId)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-4">
                            <Label
                              htmlFor={`line-${line.lineId}`}
                              className="font-medium cursor-pointer flex-1"
                            >
                              {line.productName}
                              <span className="text-muted-foreground ml-2 text-sm font-normal">
                                ({line.productCode})
                              </span>
                            </Label>
                            <div className="text-right whitespace-nowrap">
                              <span className="text-sm font-medium">
                                {formatCurrency(line.unitPrice)}
                              </span>
                              <span className="text-muted-foreground text-sm"> / {line.uomName}</span>
                            </div>
                          </div>

                          {line.selected && (
                            <div className="space-y-3 mt-3 pt-3 border-t">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Quantity Control */}
                                <div className="space-y-2">
                                  <Label className="text-sm font-medium">Quantity</Label>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      className="h-9 w-9"
                                      onClick={() => updateLineQuantity(line.lineId, line.quantity - 1)}
                                      disabled={line.quantity <= 1}
                                    >
                                      -
                                    </Button>
                                    <div className="flex-1 min-w-0">
                                      <Input
                                        type="number"
                                        min={1}
                                        max={line.maxQuantity}
                                        value={line.quantity}
                                        onChange={(e) => updateLineQuantity(line.lineId, parseInt(e.target.value) || 0)}
                                        className="h-9 text-center"
                                      />
                                      <p className="text-xs text-muted-foreground text-center mt-1">
                                        Max: {line.maxQuantity} {line.uomName}
                                      </p>
                                    </div>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      className="h-9 w-9"
                                      onClick={() => updateLineQuantity(line.lineId, line.quantity + 1)}
                                      disabled={line.quantity >= line.maxQuantity}
                                    >
                                      +
                                    </Button>
                                  </div>
                                </div>

                                {/* Return Reason */}
                                <div className="space-y-2">
                                  <Label className="text-sm font-medium">Reason</Label>
                                  <Select
                                    value={line.return_reason}
                                    onValueChange={(v) => updateLineReasonCode(line.lineId, v as ReturnLine['return_reason'])}
                                  >
                                    <SelectTrigger className="h-9">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(RETURN_REASON_CODES).map(([code, label]) => (
                                        <SelectItem key={code} value={code}>
                                          {label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>

                              {/* Restock checkbox and Subtotal */}
                              <div className="flex items-center justify-between pt-2">
                                <div className="flex items-center gap-2">
                                  <Checkbox
                                    id={`restock-${line.lineId}`}
                                    checked={line.should_restock}
                                    onCheckedChange={() => toggleLineRestock(line.lineId)}
                                  />
                                  <Label htmlFor={`restock-${line.lineId}`} className="text-sm cursor-pointer flex items-center gap-1.5">
                                    <Package className="h-4 w-4" />
                                    Restock
                                  </Label>
                                  {!line.should_restock && (
                                    <span className="text-xs text-amber-600 font-medium">
                                      (Won't be added back to inventory)
                                    </span>
                                  )}
                                </div>
                                <div className="text-right">
                                  <p className="text-xs text-muted-foreground">Subtotal</p>
                                  <p className="text-lg font-semibold">
                                    {formatCurrency(line.quantity * line.unitPrice)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Return Reason */}
              <div className="space-y-2">
                <Label htmlFor="returnReason" className="text-sm font-medium">
                  Return Reason <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="returnReason"
                  placeholder="Explain why this return is being processed..."
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="returnNotes" className="text-sm font-medium">Additional Notes</Label>
                <Textarea
                  id="returnNotes"
                  placeholder="Any additional notes..."
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  rows={2}
                />
              </div>

              <Separator />

              {/* Refund Details */}
              <div className="space-y-4">
                <h4 className="font-semibold">Refund Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Refund Method</Label>
                    <Select
                      value={refundMethod}
                      onValueChange={(v) => setRefundMethod(v as typeof refundMethod)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">💵 Cash</SelectItem>
                        <SelectItem value="gcash">📱 GCash</SelectItem>
                        <SelectItem value="maya">📱 Maya</SelectItem>
                        <SelectItem value="bank_transfer">🏦 Bank Transfer</SelectItem>
                        <SelectItem value="store_credit">🎫 Store Credit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {refundMethod !== 'cash' && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Reference Number</Label>
                      <Input
                        placeholder="Enter reference number"
                        value={refundReference}
                        onChange={(e) => setRefundReference(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-medium">Total Refund Amount:</span>
                    <span className="text-2xl font-bold text-primary">{formatCurrency(refundTotal)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setSelectedTransactionId(null)}
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button
              onClick={handleProcessReturn}
              disabled={!hasSelectedItems || !returnReason.trim() || createReturn.isPending}
            >
              {createReturn.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Process Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transaction Details Dialog */}
      <Dialog open={!!detailsTransactionId} onOpenChange={(open) => !open && setDetailsTransactionId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Transaction Details</DialogTitle>
            <DialogDescription>
              {transactions.find(t => t.id === detailsTransactionId)?.transaction_number}
            </DialogDescription>
          </DialogHeader>

          {loadingDetails ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {(() => {
                const txn = transactions.find(t => t.id === detailsTransactionId)
                if (!txn) return null

                return (
                  <div className="space-y-6">
                    {/* Customer & Transaction Info */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Customer</p>
                        <p className="font-semibold">{txn.customer?.name || 'Walk-in Customer'}</p>
                        {txn.customer?.phone && (
                          <p className="text-sm">{txn.customer.phone}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Date & Time</p>
                        <p className="font-semibold">{formatDate(txn.transaction_date)}</p>
                        <p className="text-sm">{formatTime(txn.transaction_date)}</p>
                      </div>
                    </div>

                    <Separator />

                    {/* Items List */}
                    <div>
                      <p className="text-sm font-semibold mb-3">Items</p>
                      <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
                        {(txn.lines || []).map((line: any) => (
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
                        <span>{formatCurrency(txn.subtotal)}</span>
                      </div>
                      {txn.discount_amount > 0 && (
                        <div className="flex justify-between text-green-600">
                          <span>Discount</span>
                          <span>-{formatCurrency(txn.discount_amount)}</span>
                        </div>
                      )}
                      {txn.tax_amount > 0 && (
                        <div className="flex justify-between">
                          <span>Tax</span>
                          <span>{formatCurrency(txn.tax_amount)}</span>
                        </div>
                      )}
                      <Separator />
                      <div className="flex justify-between font-bold text-lg">
                        <span>Total</span>
                        <span>{formatCurrency(txn.total_amount)}</span>
                      </div>
                    </div>

                    {/* Payments */}
                    <div>
                      <p className="text-sm font-semibold mb-3">Payments</p>
                      <div className="space-y-2 border rounded-lg p-3 bg-blue-50">
                        {(txn.payments || []).map((payment: any) => (
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
                          <span className="font-bold text-lg">{formatCurrency(txn.amount_paid)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Notes */}
                    {txn.notes && (
                      <div>
                        <p className="text-sm font-semibold mb-2">Notes</p>
                        <p className="text-sm p-3 bg-amber-50 rounded-lg border">{txn.notes}</p>
                      </div>
                    )}
                  </div>
                )
              })()}
            </>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsTransactionId(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Transaction Confirmation */}
      <AlertDialog open={!!deleteTransactionId} onOpenChange={() => setDeleteTransactionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Transaction</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the transaction from all views and analytics. The record is kept
              for audit purposes but will no longer appear in reports or listings.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteTransactionId || !user?.id) return
                try {
                  await softDeleteTransaction.mutateAsync({
                    transactionId: deleteTransactionId,
                    userId: user.id,
                  })
                  toast.success('Transaction deleted')
                  setDeleteTransactionId(null)
                } catch (err: any) {
                  toast.error(err.message || 'Failed to delete transaction')
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {softDeleteTransaction.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
