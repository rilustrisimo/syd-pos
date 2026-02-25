'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePurchaseOrders, usePOStats, useCancelPurchaseOrder, useDeletePurchaseOrder } from '@/hooks/usePurchases'
import { useAuthStore } from '@/lib/stores/auth'
import { useSuppliers } from '@/hooks/useSuppliers'
import { useBranches } from '@/hooks/useInventory'
import { formatCurrency, formatDate } from '@/lib/utils/formatting'
import type { POStatus } from '@/types/database'
import { toast } from 'sonner'
import {
  Plus,
  Search,
  Package,
  Truck,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Eye,
  MoreHorizontal,
  FileText,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const statusConfig: Record<POStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof Clock }> = {
  draft: { label: 'Draft', variant: 'outline', icon: FileText },
  sent: { label: 'Sent', variant: 'secondary', icon: Truck },
  confirmed: { label: 'Confirmed', variant: 'default', icon: CheckCircle },
  partially_received: { label: 'Partial', variant: 'secondary', icon: Package },
  received: { label: 'Received', variant: 'default', icon: CheckCircle },
  cancelled: { label: 'Cancelled', variant: 'destructive', icon: XCircle },
}

export default function PurchasesPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState<string>('')
  const [selectedStatus, setSelectedStatus] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const [cancellingPO, setCancellingPO] = useState<string | null>(null)
  const [deletingPO, setDeletingPO] = useState<string | null>(null)

  const { data: purchasesData, isLoading } = usePurchaseOrders({
    search: searchQuery || undefined,
    supplierId: selectedSupplier || undefined,
    status: selectedStatus as POStatus || undefined,
    page: currentPage,
    limit: 20,
  })

  const { data: suppliersData } = useSuppliers({ limit: 100 })
  const { user } = useAuthStore()
  const { data: stats } = usePOStats()
  const cancelMutation = useCancelPurchaseOrder()
  const deleteMutation = useDeletePurchaseOrder()

  const purchases = purchasesData?.data || []
  const totalPages = purchasesData?.totalPages || 1
  const suppliers = suppliersData?.data || []

  const handleCancel = async () => {
    if (!cancellingPO) return

    try {
      await cancelMutation.mutateAsync(cancellingPO)
      toast.success('Purchase order cancelled')
      setCancellingPO(null)
    } catch (error: any) {
      toast.error(error.message || 'Failed to cancel PO')
    }
  }

  const handleDelete = async () => {
    if (!deletingPO || !user?.id) return

    try {
      await deleteMutation.mutateAsync({ id: deletingPO, userId: user.id })
      toast.success('Purchase order deleted')
      setDeletingPO(null)
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete PO')
    }
  }

  const getStatusBadge = (status: POStatus) => {
    const config = statusConfig[status]
    const Icon = config.icon
    return (
      <Badge variant={config.variant} className="flex items-center gap-1 w-fit">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Purchase Orders</h1>
          <p className="text-muted-foreground">
            Create and manage purchase orders from suppliers
          </p>
        </div>
        <Link href="/purchases/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Purchase Order
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Draft</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.draft}</div>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(stats.totalDraftValue)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sent</CardTitle>
              <Truck className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.sent}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Confirmed</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.confirmed}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Partial</CardTitle>
              <Package className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.partiallyReceived}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Received</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.received}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Value</CardTitle>
              <AlertCircle className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(stats.totalPendingValue)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Purchases List */}
      <Card>
        <CardHeader>
          <CardTitle>Purchase Order List</CardTitle>
          <CardDescription>
            View and manage all purchase orders ({purchasesData?.total || 0} total)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search by PO number..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCurrentPage(1)
                }}
              />
            </div>

            <Select
              value={selectedSupplier}
              onValueChange={(value) => {
                setSelectedSupplier(value === 'all' ? '' : value)
                setCurrentPage(1)
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Suppliers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Suppliers</SelectItem>
                {suppliers.map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedStatus}
              onValueChange={(value) => {
                setSelectedStatus(value === 'all' ? '' : value)
                setCurrentPage(1)
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="partially_received">Partially Received</SelectItem>
                <SelectItem value="received">Received</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : purchases.length === 0 ? (
            <div className="text-center py-8">
              <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No purchase orders found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || selectedSupplier || selectedStatus
                  ? 'Try adjusting your filters'
                  : 'Create your first purchase order to get started'}
              </p>
              {!searchQuery && !selectedSupplier && !selectedStatus && (
                <Link href="/purchases/new">
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    New Purchase Order
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO Number</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Expected Delivery</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Created By</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchases.map((po) => (
                      <TableRow key={po.id}>
                        <TableCell>
                          <Link
                            href={`/purchases/${po.id}`}
                            className="font-mono text-sm text-primary hover:underline"
                          >
                            {po.po_number}
                          </Link>
                        </TableCell>
                        <TableCell>{formatDate(po.po_date)}</TableCell>
                        <TableCell className="font-medium">
                          {(po.supplier as any)?.name || '-'}
                        </TableCell>
                        <TableCell>
                          {po.expected_delivery_date
                            ? formatDate(po.expected_delivery_date)
                            : '-'}
                        </TableCell>
                        <TableCell>{getStatusBadge(po.status)}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatCurrency(po.total_amount)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {(po.created_by_user as any)?.full_name || '-'}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={`/purchases/${po.id}`}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  View Details
                                </Link>
                              </DropdownMenuItem>
                              {po.status === 'draft' && (
                                <DropdownMenuItem
                                  onClick={() => setCancellingPO(po.id)}
                                  className="text-destructive"
                                >
                                  <XCircle className="mr-2 h-4 w-4" />
                                  Cancel
                                </DropdownMenuItem>
                              )}
                              {user?.role && ['admin', 'manager'].includes(user.role) &&
                                !['partially_received', 'received'].includes(po.status) && (
                                  <DropdownMenuItem
                                    onClick={() => setDeletingPO(po.id)}
                                    className="text-destructive"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                          </DropdownMenu>
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
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={!!cancellingPO} onOpenChange={() => setCancellingPO(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Purchase Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this purchase order? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="mr-2 h-4 w-4" />
              )}
              Yes, cancel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingPO} onOpenChange={() => setDeletingPO(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Purchase Order</AlertDialogTitle>
            <AlertDialogDescription>
              This will hide the purchase order from all views and reports. The record is kept
              for audit purposes but will no longer appear in analytics or listings.
              Deletion is only allowed when no items have been received.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
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
