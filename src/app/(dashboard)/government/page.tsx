'use client'

import Link from 'next/link'
import { Building2, ClipboardList, FileText, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useGovernmentStats, useGovernmentTransactions } from '@/hooks/useGovernmentTransactions'
import { useGovernmentCanvases } from '@/hooks/useGovernmentCanvases'

function fmt(n: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(n)
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  paid:    { label: 'Paid',    variant: 'default' },
  partial: { label: 'Partial', variant: 'secondary' },
  unpaid:  { label: 'Unpaid',  variant: 'destructive' },
}

export default function GovernmentDashboard() {
  const { data: stats, isLoading: statsLoading } = useGovernmentStats()
  const { data: recentTxns } = useGovernmentTransactions({ page: 1, limit: 5 })
  const { data: recentCanvases } = useGovernmentCanvases(1, 5)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-blue-600" />
            Government Module
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage government canvasses, sales, and payments.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/government/canvass/new">
            <Button>
              <ClipboardList className="h-4 w-4 mr-2" />
              New Canvass
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsLoading ? '—' : (stats?.totalTransactions ?? 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{statsLoading ? '—' : (stats?.pendingCount ?? 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Outstanding</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-red-600">{statsLoading ? '—' : fmt(stats?.totalOutstanding ?? 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Withholding</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-blue-600">{statsLoading ? '—' : fmt(stats?.totalWithholding ?? 0)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Sales + Recent Canvasses */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Sales */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Government Sales</CardTitle>
            <Link href="/government/sales">
              <Button variant="ghost" size="sm">View all</Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {!recentTxns?.data?.length ? (
              <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground text-sm">
                <TrendingUp className="h-8 w-8 opacity-30" />
                No government sales yet
              </div>
            ) : (
              <div className="divide-y">
                {recentTxns.data.map((txn: any) => (
                  <Link key={txn.id} href={`/government/sales/${txn.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-muted/40 transition-colors">
                    <div>
                      <div className="text-sm font-semibold">{txn.government_agency || txn.customer?.name || '—'}</div>
                      <div className="text-xs text-muted-foreground">{txn.transaction_number} · {txn.po_number ? `PO# ${txn.po_number}` : 'No PO#'}</div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-1">
                      <div className="text-sm font-bold">{fmt(txn.total_amount)}</div>
                      <Badge variant={statusConfig[txn.payment_status]?.variant ?? 'outline'} className="text-xs">
                        {statusConfig[txn.payment_status]?.label ?? txn.payment_status}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Canvasses */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Canvasses</CardTitle>
            <Link href="/government/canvass">
              <Button variant="ghost" size="sm">View all</Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {!recentCanvases?.data?.length ? (
              <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground text-sm">
                <ClipboardList className="h-8 w-8 opacity-30" />
                No government canvasses yet
              </div>
            ) : (
              <div className="divide-y">
                {recentCanvases.data.map((canvas: any) => (
                  <Link key={canvas.id} href={`/government/canvass/${canvas.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-muted/40 transition-colors">
                    <div>
                      <div className="text-sm font-semibold">{canvas.government_agency || '—'}</div>
                      <div className="text-xs text-muted-foreground">{canvas.canvas_number} · {canvas.canvas_date?.slice(0, 10)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold">{fmt(canvas.total_amount)}</div>
                      {canvas.po_number && <div className="text-xs text-muted-foreground">PO# {canvas.po_number}</div>}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
