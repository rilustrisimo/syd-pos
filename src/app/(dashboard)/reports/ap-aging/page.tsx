'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, FileWarning, ArrowLeft, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { useAPAging, type APAgingSupplier, type LiabilityPayable } from '@/hooks/useLiabilities'
import { formatCurrency, formatDate } from '@/lib/utils/formatting'

function AgingBadge({ label, amount }: { label: string; amount: number }) {
  if (amount === 0) return null
  const colorMap: Record<string, string> = {
    'Current': 'bg-green-100 text-green-700',
    '1-30 Days': 'bg-yellow-100 text-yellow-700',
    '31-60 Days': 'bg-orange-100 text-orange-700',
    '61-90 Days': 'bg-red-100 text-red-700',
    '90+ Days': 'bg-red-200 text-red-900',
  }
  return (
    <div className={`rounded px-2 py-1 text-xs font-medium ${colorMap[label] ?? 'bg-muted text-muted-foreground'}`}>
      <p className="whitespace-nowrap">{label}</p>
      <p className="font-semibold">{formatCurrency(amount)}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    paid: { label: 'Paid', className: 'bg-green-100 text-green-700 border-green-200' },
    partial: { label: 'Partial', className: 'bg-blue-100 text-blue-700 border-blue-200' },
    unpaid: { label: 'Unpaid', className: 'bg-amber-100 text-amber-700 border-amber-200' },
    overdue: { label: 'Overdue', className: 'bg-red-100 text-red-700 border-red-200' },
  }
  const s = map[status] ?? { label: status, className: '' }
  return <Badge variant="outline" className={s.className}>{s.label}</Badge>
}

export default function APAgingPage() {
  const { data: suppliers, isLoading } = useAPAging()
  const [selectedSupplier, setSelectedSupplier] = useState<APAgingSupplier | null>(null)

  const totalOutstanding = suppliers?.reduce((sum, s) => sum + s.total_outstanding, 0) ?? 0
  const totalCurrent = suppliers?.reduce((sum, s) => sum + s.current, 0) ?? 0
  const total1_30 = suppliers?.reduce((sum, s) => sum + s.days_1_30, 0) ?? 0
  const total31_60 = suppliers?.reduce((sum, s) => sum + s.days_31_60, 0) ?? 0
  const total61_90 = suppliers?.reduce((sum, s) => sum + s.days_61_90, 0) ?? 0
  const total91Plus = suppliers?.reduce((sum, s) => sum + s.days_91_plus, 0) ?? 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">AP Aging</h1>
        <p className="text-muted-foreground">Accounts Payable aging analysis — outstanding supplier balances</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-1">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">Total AP</p>
            <p className="text-xl font-bold">{formatCurrency(totalOutstanding)}</p>
            <p className="text-xs text-muted-foreground">{suppliers?.length ?? 0} suppliers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">Current</p>
            <p className="text-lg font-bold text-green-600">{formatCurrency(totalCurrent)}</p>
            <p className="text-xs text-muted-foreground">Not yet due</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">1-30 Days</p>
            <p className="text-lg font-bold text-yellow-600">{formatCurrency(total1_30)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">31-90 Days</p>
            <p className="text-lg font-bold text-orange-600">{formatCurrency(total31_60 + total61_90)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">90+ Days</p>
            <p className="text-lg font-bold text-red-600">{formatCurrency(total91Plus)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Supplier Aging Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileWarning className="h-5 w-5 text-amber-500" />
            Supplier Aging Breakdown
          </CardTitle>
          <CardDescription>Click a supplier row to view individual payables</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Total Outstanding</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">1-30 Days</TableHead>
                  <TableHead className="text-right">31-60 Days</TableHead>
                  <TableHead className="text-right">61-90 Days</TableHead>
                  <TableHead className="text-right">90+ Days</TableHead>
                  <TableHead className="text-right"># Payables</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center">
                      <Loader2 className="inline h-6 w-6 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : !suppliers || suppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                      No outstanding payables
                    </TableCell>
                  </TableRow>
                ) : (
                  suppliers.map(s => (
                    <TableRow
                      key={s.supplier_id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedSupplier(s)}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {(s.days_91_plus > 0 || s.days_61_90 > 0) && (
                            <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                          )}
                          {s.supplier_name}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold font-mono">{formatCurrency(s.total_outstanding)}</TableCell>
                      <TableCell className="text-right font-mono text-green-600">{s.current > 0 ? formatCurrency(s.current) : '—'}</TableCell>
                      <TableCell className="text-right font-mono text-yellow-600">{s.days_1_30 > 0 ? formatCurrency(s.days_1_30) : '—'}</TableCell>
                      <TableCell className="text-right font-mono text-orange-600">{s.days_31_60 > 0 ? formatCurrency(s.days_31_60) : '—'}</TableCell>
                      <TableCell className="text-right font-mono text-red-500">{s.days_61_90 > 0 ? formatCurrency(s.days_61_90) : '—'}</TableCell>
                      <TableCell className="text-right font-mono text-red-700 font-semibold">{s.days_91_plus > 0 ? formatCurrency(s.days_91_plus) : '—'}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{s.payable_count}</TableCell>
                    </TableRow>
                  ))
                )}

                {/* Totals row */}
                {suppliers && suppliers.length > 0 && (
                  <TableRow className="border-t-2 font-semibold bg-muted/30">
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(totalOutstanding)}</TableCell>
                    <TableCell className="text-right font-mono text-green-600">{totalCurrent > 0 ? formatCurrency(totalCurrent) : '—'}</TableCell>
                    <TableCell className="text-right font-mono text-yellow-600">{total1_30 > 0 ? formatCurrency(total1_30) : '—'}</TableCell>
                    <TableCell className="text-right font-mono text-orange-600">{total31_60 > 0 ? formatCurrency(total31_60) : '—'}</TableCell>
                    <TableCell className="text-right font-mono text-red-500">{total61_90 > 0 ? formatCurrency(total61_90) : '—'}</TableCell>
                    <TableCell className="text-right font-mono text-red-700">{total91Plus > 0 ? formatCurrency(total91Plus) : '—'}</TableCell>
                    <TableCell className="text-right">{suppliers.reduce((sum, s) => sum + s.payable_count, 0)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Supplier Detail Modal */}
      <Dialog open={!!selectedSupplier} onOpenChange={() => setSelectedSupplier(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {selectedSupplier?.supplier_name}
              <Badge variant="outline" className="text-sm">
                {formatCurrency(selectedSupplier?.total_outstanding ?? 0)} outstanding
              </Badge>
            </DialogTitle>
          </DialogHeader>

          {selectedSupplier && (
            <div className="space-y-4">
              {/* Aging buckets */}
              <div className="flex flex-wrap gap-2">
                <AgingBadge label="Current" amount={selectedSupplier.current} />
                <AgingBadge label="1-30 Days" amount={selectedSupplier.days_1_30} />
                <AgingBadge label="31-60 Days" amount={selectedSupplier.days_31_60} />
                <AgingBadge label="61-90 Days" amount={selectedSupplier.days_61_90} />
                <AgingBadge label="90+ Days" amount={selectedSupplier.days_91_plus} />
              </div>

              {/* Payable list */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payable #</TableHead>
                    <TableHead>Invoice Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedSupplier.payables.map((p: LiabilityPayable) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link
                          href={`/liabilities/payables/${p.id}`}
                          className="font-mono text-sm hover:underline"
                          onClick={() => setSelectedSupplier(null)}
                        >
                          {p.payable_number}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(p.invoice_date)}</TableCell>
                      <TableCell className="text-sm">
                        <div>{formatDate(p.due_date)}</div>
                        {p.days_until_due < 0 && (
                          <span className="text-xs text-red-600 font-medium">{Math.abs(p.days_until_due)}d overdue</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(p.total_amount)}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">{formatCurrency(p.balance)}</TableCell>
                      <TableCell><StatusBadge status={p.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
