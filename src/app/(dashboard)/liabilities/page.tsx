'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  FileWarning,
  Banknote,
  CalendarClock,
  AlertTriangle,
  ArrowRight,
  TrendingDown,
  Clock,
  Loader2,
} from 'lucide-react'
import Link from 'next/link'
import { useLiabilitySummary, useUpcomingPayments } from '@/hooks/useLiabilities'
import { formatCurrency } from '@/lib/utils/formatting'

function SummaryCard({
  title,
  value,
  description,
  icon: Icon,
  iconColor,
  href,
}: {
  title: string
  value: string
  description: string
  icon: React.ElementType
  iconColor?: string
  href?: string
}) {
  const content = (
    <Card className={href ? 'hover:bg-muted/50 transition-colors cursor-pointer' : ''}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-5 w-5 ${iconColor || 'text-muted-foreground'}`} />
      </CardHeader>
      <CardContent>
        <div className="text-xl sm:text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
  if (href) return <Link href={href}>{content}</Link>
  return content
}

function DaysUntilDueBadge({ days }: { days: number }) {
  if (days < 0) {
    return (
      <Badge variant="destructive" className="text-xs whitespace-nowrap">
        {Math.abs(days)}d overdue
      </Badge>
    )
  }
  if (days === 0) {
    return <Badge className="text-xs bg-red-500 text-white whitespace-nowrap">Due today</Badge>
  }
  if (days <= 3) {
    return <Badge className="text-xs bg-orange-500 text-white whitespace-nowrap">{days}d left</Badge>
  }
  if (days <= 7) {
    return <Badge className="text-xs bg-amber-500 text-white whitespace-nowrap">{days}d left</Badge>
  }
  return <Badge variant="secondary" className="text-xs whitespace-nowrap">{days}d left</Badge>
}

export default function LiabilitiesPage() {
  const { data: summary, isLoading: summaryLoading } = useLiabilitySummary()
  const { data: upcoming, isLoading: upcomingLoading } = useUpcomingPayments(30)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Liabilities</h1>
        <p className="text-muted-foreground">
          Track business obligations — supplier payables and loan amortizations
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {summaryLoading ? (
          <div className="col-span-2 lg:col-span-4 flex h-24 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <SummaryCard
              title="Payables Outstanding"
              value={formatCurrency(summary?.total_payables_outstanding ?? 0)}
              description="Total AP balance unpaid"
              icon={FileWarning}
              iconColor={summary?.total_payables_outstanding ? 'text-amber-500' : undefined}
              href="/liabilities/payables"
            />
            <SummaryCard
              title="Overdue Payables"
              value={formatCurrency(summary?.payables_overdue ?? 0)}
              description={`${summary?.payables_overdue_count ?? 0} payable${(summary?.payables_overdue_count ?? 0) !== 1 ? 's' : ''} overdue`}
              icon={AlertTriangle}
              iconColor={summary?.payables_overdue ? 'text-red-500' : undefined}
              href="/liabilities/payables"
            />
            <SummaryCard
              title="Loan Obligations"
              value={formatCurrency(summary?.total_loan_obligations ?? 0)}
              description={`${summary?.active_loans_count ?? 0} active loan${(summary?.active_loans_count ?? 0) !== 1 ? 's' : ''}`}
              icon={Banknote}
              iconColor="text-purple-500"
              href="/liabilities/loans"
            />
            <SummaryCard
              title="Due in 7 Days"
              value={formatCurrency(summary?.upcoming_7_days_total ?? 0)}
              description={`${summary?.upcoming_7_days_count ?? 0} payment${(summary?.upcoming_7_days_count ?? 0) !== 1 ? 's' : ''} coming up`}
              icon={Clock}
              iconColor={summary?.upcoming_7_days_count ? 'text-orange-500' : undefined}
            />
          </>
        )}
      </div>

      {/* Quick links */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href="/liabilities/payables"
          className="flex items-center gap-3 rounded-lg border p-4 hover:bg-muted/50 transition-colors"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
            <FileWarning className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="font-medium">Payables</p>
            <p className="text-sm text-muted-foreground">Supplier trade credit terms</p>
          </div>
          <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
        </Link>

        <Link
          href="/liabilities/loans"
          className="flex items-center gap-3 rounded-lg border p-4 hover:bg-muted/50 transition-colors"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
            <Banknote className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <p className="font-medium">Loans</p>
            <p className="text-sm text-muted-foreground">Business loan amortizations</p>
          </div>
          <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
        </Link>

        <Link
          href="/liabilities/cashflow"
          className="flex items-center gap-3 rounded-lg border p-4 hover:bg-muted/50 transition-colors"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
            <CalendarClock className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="font-medium">Cash Flow</p>
            <p className="text-sm text-muted-foreground">6-month outflow projection</p>
          </div>
          <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
        </Link>
      </div>

      {/* Upcoming payments (next 30 days) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Upcoming Payments</CardTitle>
            <CardDescription>Next 30 days — payables and loan installments</CardDescription>
          </div>
          <Link href="/liabilities/cashflow">
            <Button variant="ghost" size="sm">
              Full calendar <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {upcomingLoading ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : upcoming && upcoming.length > 0 ? (
            <div className="space-y-3">
              {upcoming.slice(0, 10).map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded ${
                      item.type === 'payable'
                        ? 'bg-amber-100 text-amber-600'
                        : 'bg-purple-100 text-purple-600'
                    }`}
                  >
                    {item.type === 'payable' ? (
                      <FileWarning className="h-4 w-4" />
                    ) : (
                      <Banknote className="h-4 w-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{item.reference}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                  </div>
                  <span className="text-sm font-semibold shrink-0">
                    {formatCurrency(item.amount_due)}
                  </span>
                  <DaysUntilDueBadge days={item.days_until_due} />
                </div>
              ))}
              {upcoming.length > 10 && (
                <p className="text-sm text-muted-foreground text-center pt-2">
                  +{upcoming.length - 10} more — <Link href="/liabilities/cashflow" className="underline">view all</Link>
                </p>
              )}
            </div>
          ) : (
            <div className="flex h-32 items-center justify-center text-muted-foreground">
              <div className="text-center">
                <TrendingDown className="mx-auto h-8 w-8 mb-2" />
                <p>No upcoming payments in the next 30 days</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
