'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useBranches, useInventoryMovements } from '@/hooks/useInventory'
import type { Branch } from '@/lib/supabase/queries/inventory'
import {
  ArrowLeft,
  Loader2,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Package,
  ShoppingCart,
  RotateCcw,
  ArrowRightLeft,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

export default function InventoryMovementsPage() {
  const [selectedBranch, setSelectedBranch] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  const { data: branches } = useBranches()
  const branchesList: Branch[] = branches || []
  const { data: movementsData, isLoading } = useInventoryMovements({
    branchId: selectedBranch || undefined,
    movementType: selectedType || undefined,
    page: currentPage,
    limit: 50,
  })

  const movements = movementsData?.data || []
  const totalPages = movementsData?.totalPages || 1

  const getMovementIcon = (type: string) => {
    switch (type) {
      case 'purchase':
        return <Package className="h-4 w-4" />
      case 'sale':
        return <ShoppingCart className="h-4 w-4" />
      case 'adjustment':
        return <RefreshCw className="h-4 w-4" />
      case 'return':
        return <RotateCcw className="h-4 w-4" />
      case 'transfer':
        return <ArrowRightLeft className="h-4 w-4" />
      default:
        return <Package className="h-4 w-4" />
    }
  }

  const getMovementColor = (type: string, quantityChange: number) => {
    if (quantityChange > 0) {
      return 'text-green-600'
    }
    return 'text-red-600'
  }

  const formatMovementType = (type: string) => {
    return type.charAt(0).toUpperCase() + type.slice(1)
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-4">
        <Link href="/inventory">
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventory Movement History</h1>
          <p className="text-muted-foreground">
            Complete audit trail of all inventory changes
          </p>
        </div>
      </div>

      {/* Movements Table */}
      <Card>
        <CardHeader>
          <CardTitle>Movement Log</CardTitle>
          <CardDescription>
            View all inventory transactions including purchases, sales, adjustments, and
            transfers
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="w-full md:w-64">
              <Select
                value={selectedBranch || 'all'}
                onValueChange={(value) => {
                  setSelectedBranch(value === 'all' ? '' : value)
                  setCurrentPage(1)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  {branchesList?.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-full md:w-64">
              <Select
                value={selectedType || 'all'}
                onValueChange={(value) => {
                  setSelectedType(value === 'all' ? '' : value)
                  setCurrentPage(1)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="purchase">Purchase</SelectItem>
                  <SelectItem value="sale">Sale</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                  <SelectItem value="return">Return</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : movements.length === 0 ? (
            <div className="text-center py-8">
              <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No movements found</h3>
              <p className="text-muted-foreground">
                No inventory movements match your current filters
              </p>
            </div>
          ) : (
            <>
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead className="text-right">Change</TableHead>
                      <TableHead className="text-right">Before</TableHead>
                      <TableHead className="text-right">After</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((movement: any) => {
                      const quantityChange = Number(movement.quantity_change)
                      const isIncrease = quantityChange > 0

                      return (
                        <TableRow key={movement.id}>
                          <TableCell className="whitespace-nowrap">
                            {new Date(movement.created_at).toLocaleString('en-PH', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getMovementIcon(movement.movement_type)}
                              <Badge variant="outline">
                                {formatMovementType(movement.movement_type)}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">
                                {movement.product?.name || 'Unknown Product'}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {movement.product?.code}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{movement.branch?.name || 'Unknown'}</TableCell>
                          <TableCell className="text-right">
                            <div
                              className={`flex items-center justify-end gap-1 font-medium ${getMovementColor(
                                movement.movement_type,
                                quantityChange
                              )}`}
                            >
                              {isIncrease ? (
                                <TrendingUp className="h-4 w-4" />
                              ) : (
                                <TrendingDown className="h-4 w-4" />
                              )}
                              {isIncrease ? '+' : ''}
                              {quantityChange.toLocaleString()}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {Number(movement.quantity_before).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {Number(movement.quantity_after).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {movement.created_by_user?.name || 'System'}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-xs">
                            <div className="text-sm text-muted-foreground truncate">
                              {movement.notes || '-'}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
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
    </div>
  )
}
