'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, FileText, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/stores/auth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useGovernmentTransactions, useDeleteGovernmentSale } from '@/hooks/useGovernmentTransactions'

function fmt(n: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(n)
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  paid:    { label: 'Paid',    variant: 'default' },
  partial: { label: 'Partial', variant: 'secondary' },
  unpaid:  { label: 'Unpaid',  variant: 'destructive' },
}

export default function GovernmentSalesList() {
  const { user } = useAuthStore()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const limit = 20

  const deleteSale = useDeleteGovernmentSale()

  async function handleDelete(txnId: string, txnNumber: string) {
    if (!confirm(`Delete sale ${txnNumber}? This will reverse inventory movements.`)) return
    try {
      await deleteSale.mutateAsync({ transactionId: txnId, userId: user?.id || '' })
      toast.success('Sale deleted and inventory reversed.')
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete sale')
    }
  }

  const { data, isLoading } = useGovernmentTransactions({
    page,
    limit,
    search: search || undefined,
    payment_status: (statusFilter || undefined) as any,
  })

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6 text-blue-600" />
          Government Sales
        </h1>
        <Link href="/government/sales/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />New Sale
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Input
          placeholder="Search agency or PO#…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="max-w-xs"
        />
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v === '_all' ? '' : v); setPage(1) }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All statuses</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !data?.data?.length ? (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <FileText className="h-10 w-10 opacity-25" />
              <p>No government sales found.</p>
              <Link href="/government/sales/new">
                <Button variant="outline" size="sm">Create first sale</Button>
              </Link>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>TXN #</TableHead>
                    <TableHead>Agency</TableHead>
                    <TableHead>PO Number</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Materials</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead className="text-center">Delivery</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((txn: any) => {
                    const materials = txn.subtotal || 0
                    const cogs = (txn.lines || []).reduce(
                      (s: number, l: any) => s + (Number(l.quantity) * Number(l.cogs_per_unit || 0)),
                      0
                    )
                    const profit = materials - cogs
                    return (
                      <TableRow key={txn.id} className="cursor-pointer hover:bg-muted/40">
                        <TableCell>
                          <Link href={`/government/sales/${txn.id}`} className="font-mono text-sm hover:underline">
                            {txn.transaction_number}
                          </Link>
                        </TableCell>
                        <TableCell className="font-medium">{txn.government_agency || txn.customer?.name || '—'}</TableCell>
                        <TableCell>{txn.po_number ? `PO# ${txn.po_number}` : <span className="text-muted-foreground text-xs italic">None</span>}</TableCell>
                        <TableCell>{txn.transaction_date?.slice(0, 10)}</TableCell>
                        <TableCell className="text-right font-medium">{fmt(materials)}</TableCell>
                        <TableCell className={`text-right font-semibold ${profit >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                          {profit >= 0 ? '+' : ''}{fmt(profit)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={txn.is_delivered ? 'default' : 'secondary'}
                                 className={txn.is_delivered ? 'bg-green-600' : ''}>
                            {txn.is_delivered ? 'Delivered' : 'Pending'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={statusConfig[txn.payment_status]?.variant ?? 'outline'}>
                            {statusConfig[txn.payment_status]?.label ?? txn.payment_status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(txn.id, txn.transaction_number)}
                            disabled={deleteSale.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              {(data.total > limit) && (
                <div className="flex justify-center gap-2 py-4">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                  <span className="flex items-center text-sm text-muted-foreground px-2">
                    Page {page} of {Math.ceil(data.total / limit)}
                  </span>
                  <Button variant="outline" size="sm" disabled={page >= Math.ceil(data.total / limit)} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
