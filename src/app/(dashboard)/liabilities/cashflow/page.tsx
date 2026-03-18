'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, CalendarClock, FileWarning, Banknote, AlertTriangle, BarChart2, List } from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { useCashFlowProjection } from '@/hooks/useLiabilities'
import { formatCurrency, formatDate } from '@/lib/utils/formatting'

function DaysUntilDueBadge({ days }: { days: number }) {
  if (days < 0) return <Badge variant="destructive" className="text-xs">{Math.abs(days)}d overdue</Badge>
  if (days === 0) return <Badge className="text-xs bg-red-500 text-white">Today</Badge>
  if (days <= 3) return <Badge className="text-xs bg-orange-500 text-white">{days}d</Badge>
  if (days <= 7) return <Badge className="text-xs bg-amber-500 text-white">{days}d</Badge>
  return <Badge variant="secondary" className="text-xs">{days}d</Badge>
}

export default function CashFlowPage() {
  const [view, setView] = useState<'list' | 'chart'>('list')
  const { data: months, isLoading } = useCashFlowProjection(6)

  const chartData = months?.map(m => ({
    month: m.month_label.replace(/\d{4}/, '').trim().replace(',', ''),
    Payables: Math.round(m.payables_total),
    Loans: Math.round(m.loans_total),
    Total: Math.round(m.total_outflow),
  })) ?? []

  const grandTotal = months?.reduce((sum, m) => sum + m.total_outflow, 0) ?? 0
  const totalPayables = months?.reduce((sum, m) => sum + m.payables_total, 0) ?? 0
  const totalLoans = months?.reduce((sum, m) => sum + m.loans_total, 0) ?? 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Cash Flow Projection</h1>
          <p className="text-muted-foreground">Next 6 months of liability outflows — payables + loan installments</p>
        </div>
        <div className="flex gap-2">
          <Button variant={view === 'list' ? 'default' : 'outline'} size="sm" onClick={() => setView('list')}>
            <List className="mr-2 h-4 w-4" /> List
          </Button>
          <Button variant={view === 'chart' ? 'default' : 'outline'} size="sm" onClick={() => setView('chart')}>
            <BarChart2 className="mr-2 h-4 w-4" /> Chart
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">Total Outflow (6mo)</p>
            <p className="text-xl font-bold">{formatCurrency(grandTotal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">Payables</p>
            <p className="text-xl font-bold text-amber-600">{formatCurrency(totalPayables)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">Loan Installments</p>
            <p className="text-xl font-bold text-purple-600">{formatCurrency(totalLoans)}</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : view === 'chart' ? (
        /* Chart view */
        <Card>
          <CardHeader>
            <CardTitle>Monthly Outflow Breakdown</CardTitle>
            <CardDescription>Payables vs. loan installments per month</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fill: 'currentColor', fontSize: 12 }} />
                <YAxis tick={{ fill: 'currentColor', fontSize: 12 }} tickFormatter={v => `₱${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                  formatter={(value) => [formatCurrency(value as number), '']}
                />
                <Legend />
                <Bar dataKey="Payables" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Loans" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : (
        /* List view — month by month */
        <div className="space-y-4">
          {months?.map(month => (
            <Card key={`${month.year}-${month.month}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-muted-foreground" />
                    {month.month_label}
                  </CardTitle>
                  <div className="flex items-center gap-3">
                    {month.payables_total > 0 && (
                      <span className="text-xs text-amber-600 font-medium">
                        Payables: {formatCurrency(month.payables_total)}
                      </span>
                    )}
                    {month.loans_total > 0 && (
                      <span className="text-xs text-purple-600 font-medium">
                        Loans: {formatCurrency(month.loans_total)}
                      </span>
                    )}
                    <span className="font-bold">{formatCurrency(month.total_outflow)}</span>
                  </div>
                </div>
              </CardHeader>
              {month.items.length > 0 ? (
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {month.items
                      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
                      .map(item => (
                        <div
                          key={item.id}
                          className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${
                            item.days_until_due < 0 ? 'border-red-200 bg-red-50' : ''
                          }`}
                        >
                          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${
                            item.type === 'payable' ? 'bg-amber-100 text-amber-600' : 'bg-purple-100 text-purple-600'
                          }`}>
                            {item.type === 'payable'
                              ? <FileWarning className="h-3.5 w-3.5" />
                              : <Banknote className="h-3.5 w-3.5" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-medium">{item.reference}</span>
                              {item.status === 'overdue' && <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-semibold">{formatCurrency(item.amount_due)}</p>
                            <div className="flex items-center gap-1 justify-end mt-0.5">
                              <span className="text-xs text-muted-foreground">{formatDate(item.due_date)}</span>
                              <DaysUntilDueBadge days={item.days_until_due} />
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              ) : (
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground">No payments due this month</p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
