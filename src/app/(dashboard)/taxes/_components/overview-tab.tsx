'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertTriangle, CheckCircle2, Clock, CalendarDays, Plus, TrendingUp } from 'lucide-react'
import { useTaxSettings, useTaxPayments, useAnnualTaxData } from '@/hooks/useTaxes'
import { generateDeadlines, computeRegimeComparison, applyLBTSchedule, type TaxDeadline } from '@/lib/utils/tax-calculator'
import { getTodayPH } from '@/lib/utils/datetime'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const TAX_LABELS: Record<string, string> = {
  '2551q':             'BIR 2551Q — Percentage Tax',
  '1701q':             'BIR 1701Q — Income Tax (Quarterly)',
  '1701a':             'BIR 1701A — Annual Income Tax',
  '0605':              'BIR 0605 — Annual Registration',
  'lbt':               'Local Business Tax (LGU)',
  'mayors_permit':     "Mayor's Permit",
  'barangay_clearance':'Barangay Clearance',
}

function urgencyColor(d: TaxDeadline): string {
  if (d.is_overdue)          return 'bg-red-100 border-red-300 text-red-800'
  if (d.days_until_due <= 7) return 'bg-orange-100 border-orange-300 text-orange-800'
  if (d.days_until_due <= 30)return 'bg-yellow-100 border-yellow-300 text-yellow-800'
  return 'bg-muted border text-muted-foreground'
}

function urgencyBadge(d: TaxDeadline) {
  if (d.is_overdue)          return <Badge variant="destructive">Overdue</Badge>
  if (d.days_until_due <= 7) return <Badge className="bg-orange-500 text-white">{d.days_until_due}d</Badge>
  if (d.days_until_due <= 30)return <Badge className="bg-yellow-500 text-white">{d.days_until_due}d</Badge>
  return <Badge variant="outline">{d.days_until_due}d</Badge>
}

interface Props {
  branchId: string | null
  year: number
  onNavigate: (tab: string) => void
}

export function OverviewTab({ branchId, year, onNavigate }: Props) {
  const today = new Date(getTodayPH() + 'T00:00:00+08:00')

  const { data: settings } = useTaxSettings(branchId)
  const { data: payments = [] } = useTaxPayments(branchId ?? null, year)
  const { data: annualData, isLoading } = useAnnualTaxData(branchId, year)

  const deadlines = useMemo(() => generateDeadlines(year, today), [year, today.toDateString()])

  // Estimate amounts for each deadline based on live data
  const estimatedAmounts = useMemo(() => {
    if (!annualData || !settings) return {} as Record<string, number>
    const comparison = computeRegimeComparison({
      annualGrossSales: annualData.netGrossSales,
      annualCOGS:       annualData.cogs,
      annualExpenses:   annualData.expenses,
      quarterlyGrossSales: annualData.quarterlyGrossSales,
    })
    const bestTax = Math.min(
      comparison.optionA.totalTax,
      comparison.optionB.totalTax,
      comparison.optionC.totalTax,
    )
    const qGross = annualData.quarterlyGrossSales

    return {
      '2551q_1': qGross[0] * 0.03,
      '2551q_2': qGross[1] * 0.03,
      '2551q_3': qGross[2] * 0.03,
      '2551q_4': qGross[3] * 0.03,
      '1701a':   bestTax,
      '0605':    settings.bir_registration_amount,
      'lbt':     applyLBTSchedule(annualData.priorYearGrossSales, settings.lbt_rate),
      'mayors_permit':      settings.mayors_permit_amount,
      'barangay_clearance': settings.barangay_clearance_amount,
    } as Record<string, number>
  }, [annualData, settings])

  const paidKeys = useMemo(() => {
    const keys = new Set<string>()
    payments.forEach(p => {
      keys.add(`${p.tax_type}_${p.period_quarter ?? 'annual'}_${p.period_year}`)
    })
    return keys
  }, [payments])

  const ytdPaid = useMemo(() =>
    payments.reduce((s, p) => s + Number(p.amount_paid), 0),
  [payments])

  const totalEstimated = useMemo(() =>
    Object.values(estimatedAmounts).reduce((s, v) => s + v, 0),
  [estimatedAmounts])

  const upcomingDeadlines = deadlines
    .filter(d => d.period_year === year || (d.tax_type === '2551q' && d.period_year === year - 1 && d.period_quarter === 4))
    .filter(d => !d.is_overdue || d.days_until_due >= -30)
    .slice(0, 8)

  const overdueCount = deadlines.filter(d => d.is_overdue).length
  const nextDeadline = deadlines.find(d => !d.is_overdue)

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Next Due</div>
            {nextDeadline ? (
              <>
                <div className="text-lg font-bold mt-1">{nextDeadline.due_date}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{nextDeadline.label}</div>
                <div className="text-xs font-medium text-orange-600 mt-1">
                  in {nextDeadline.days_until_due} days
                </div>
              </>
            ) : (
              <div className="text-lg font-bold mt-1">None</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Est. Total Tax {year}</div>
            {isLoading ? (
              <div className="text-lg font-bold mt-1 text-muted-foreground">Loading…</div>
            ) : (
              <>
                <div className="text-lg font-bold mt-1">₱ {fmt(totalEstimated)}</div>
                <div className="text-xs text-muted-foreground mt-0.5">best regime</div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">YTD Paid</div>
            <div className="text-lg font-bold mt-1 text-green-600">₱ {fmt(ytdPaid)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{payments.length} payment(s) recorded</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Outstanding</div>
            <div className={`text-lg font-bold mt-1 ${totalEstimated - ytdPaid > 0 ? 'text-destructive' : 'text-green-600'}`}>
              ₱ {fmt(Math.max(0, totalEstimated - ytdPaid))}
            </div>
            {overdueCount > 0 && (
              <div className="flex items-center gap-1 text-xs text-destructive mt-0.5">
                <AlertTriangle className="h-3 w-3" />
                {overdueCount} overdue
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Deadlines list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Upcoming Deadlines — {year}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {upcomingDeadlines.map((d, i) => {
            const paidKey = `${d.tax_type}_${d.period_quarter ?? 'annual'}_${d.period_year}`
            const isPaid  = paidKeys.has(paidKey)
            const estKey  = d.period_quarter ? `${d.tax_type}_${d.period_quarter}` : d.tax_type
            const estAmt  = estimatedAmounts[estKey] ?? 0

            return (
              <div
                key={i}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 ${isPaid ? 'opacity-50' : urgencyColor(d)}`}
              >
                <div className="flex items-center gap-3">
                  {isPaid
                    ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    : d.is_overdue
                      ? <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                      : <Clock className="h-4 w-4 shrink-0" />
                  }
                  <div>
                    <div className="text-sm font-medium">
                      {TAX_LABELS[d.tax_type] || d.tax_type}
                      {d.period_quarter && <span className="ml-1 text-xs">(Q{d.period_quarter})</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">Due {d.due_date}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-right">
                  {estAmt > 0 && (
                    <div className="text-sm font-medium">₱ {fmt(estAmt)}</div>
                  )}
                  {isPaid
                    ? <Badge variant="outline" className="text-green-600 border-green-400">Paid</Badge>
                    : urgencyBadge(d)
                  }
                </div>
              </div>
            )
          })}
          {upcomingDeadlines.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No deadlines for this year.</p>
          )}
        </CardContent>
      </Card>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => onNavigate('comparison')}>
          <TrendingUp className="mr-1.5 h-3.5 w-3.5" />
          View Regime Comparison
        </Button>
        <Button variant="outline" size="sm" onClick={() => onNavigate('payments')}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Record a Payment
        </Button>
        <Button variant="outline" size="sm" onClick={() => onNavigate('quarterly')}>
          <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
          Quarterly Breakdown
        </Button>
      </div>
    </div>
  )
}

