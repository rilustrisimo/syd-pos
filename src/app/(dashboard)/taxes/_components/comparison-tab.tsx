'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { CheckCircle2, Info } from 'lucide-react'
import { useAnnualTaxData, useTaxSettings } from '@/hooks/useTaxes'
import { computeRegimeComparison, type RegimeResult } from '@/lib/utils/tax-calculator'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

function RegimeCard({ regime }: { regime: RegimeResult }) {
  return (
    <Card className={`relative ${regime.recommended ? 'ring-2 ring-green-500' : ''}`}>
      {regime.recommended && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-green-500 text-white flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Lowest Tax
          </Badge>
        </div>
      )}
      <CardHeader className="pb-2 pt-5">
        <CardTitle className="text-sm text-center">{regime.label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex justify-between border-b pb-1">
          <span className="text-muted-foreground">Gross Sales</span>
          <span>₱ {fmt(regime.grossSales)}</span>
        </div>
        <div className="flex justify-between border-b pb-1">
          <span className="text-muted-foreground">Less: {regime.deductionLabel}</span>
          <span className="text-destructive">– ₱ {fmt(regime.deductions)}</span>
        </div>
        <div className="flex justify-between border-b pb-1 font-medium">
          <span>Taxable Income</span>
          <span>₱ {fmt(regime.taxableIncome)}</span>
        </div>
        <div className="flex justify-between border-b pb-1">
          <span className="text-muted-foreground">Income Tax</span>
          <span>₱ {fmt(regime.incomeTax)}</span>
        </div>
        <div className="flex justify-between border-b pb-1">
          <span className="text-muted-foreground">Percentage Tax (2551Q)</span>
          {regime.percentageTax > 0
            ? <span>₱ {fmt(regime.percentageTax)}</span>
            : <span className="text-green-600 text-xs font-medium">Not required</span>
          }
        </div>
        <div className="flex justify-between pt-1 font-bold text-base">
          <span>TOTAL TAX</span>
          <span className={regime.recommended ? 'text-green-600' : ''}>
            ₱ {fmt(regime.totalTax)}
          </span>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Effective Rate</span>
          <span>{(regime.effectiveRate * 100).toFixed(2)}% of gross sales</span>
        </div>
        {regime.note && (
          <div className="flex gap-1.5 items-start text-xs text-muted-foreground bg-muted rounded p-2 mt-2">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            {regime.note}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface Props { branchId: string | null; year: number }

export function ComparisonTab({ branchId, year }: Props) {
  const { data: annualData, isLoading } = useAnnualTaxData(branchId, year)
  const { data: settings } = useTaxSettings(branchId)

  const comparison = useMemo(() => {
    if (!annualData) return null
    return computeRegimeComparison({
      annualGrossSales:     annualData.netGrossSales,
      annualCOGS:           annualData.cogs,
      annualExpenses:       annualData.expenses,
      quarterlyGrossSales:  annualData.quarterlyGrossSales,
    })
  }, [annualData])

  if (isLoading) return (
    <div className="grid md:grid-cols-3 gap-4">
      <Skeleton className="h-80" /><Skeleton className="h-80" /><Skeleton className="h-80" />
    </div>
  )

  if (!annualData || !comparison) return (
    <p className="text-muted-foreground text-sm text-center py-8">No sales data available for {year}.</p>
  )

  const savings_AB = comparison.optionB.totalTax - comparison.optionA.totalTax
  const savings_AC = comparison.optionC.totalTax - comparison.optionA.totalTax

  return (
    <div className="space-y-6">
      {/* Data basis */}
      <div className="flex flex-wrap gap-4 text-sm bg-muted/50 rounded-lg p-3">
        <div><span className="text-muted-foreground">Annual Gross Sales:</span> <strong>₱ {fmt(annualData.netGrossSales)}</strong></div>
        <div><span className="text-muted-foreground">COGS:</span> <strong>₱ {fmt(annualData.cogs)}</strong></div>
        <div><span className="text-muted-foreground">Operating Expenses:</span> <strong>₱ {fmt(annualData.expenses)}</strong></div>
        <div><span className="text-muted-foreground">Year:</span> <strong>{year}</strong></div>
        {annualData.netGrossSales < annualData.quarterlyGrossSales.reduce((a,b)=>a+b,0) && (
          <div className="text-xs text-muted-foreground italic w-full">
            * Partial year data — projections are based on year-to-date figures only.
          </div>
        )}
      </div>

      {/* 3-column comparison */}
      <div className="grid md:grid-cols-3 gap-6 pt-3">
        <RegimeCard regime={comparison.optionA} />
        <RegimeCard regime={comparison.optionB} />
        <RegimeCard regime={comparison.optionC} />
      </div>

      {/* Savings summary */}
      {comparison.optionA.totalTax > 0 && (
        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-4">
            <div className="font-semibold text-green-800 mb-2">Potential Savings vs. Graduated Rate</div>
            <div className="grid md:grid-cols-2 gap-2 text-sm text-green-800">
              {savings_AB > 0 && (
                <div>Opting for 8% Flat (vs OSD): <strong>save ₱ {fmt(savings_AB)}</strong></div>
              )}
              {savings_AC > 0 && (
                <div>Opting for 8% Flat (vs Itemized): <strong>save ₱ {fmt(savings_AC)}</strong></div>
              )}
              {savings_AB <= 0 && savings_AC <= 0 && (
                <div>Graduated rate is already the lowest option for this year's figures.</div>
              )}
            </div>
            <p className="text-xs text-green-700 mt-2">
              ⚠ Consult a BIR-accredited tax practitioner before filing. The 8% option must be elected on your 1st quarter 1701Q and cannot be changed mid-year.
            </p>
          </CardContent>
        </Card>
      )}

      {annualData.netGrossSales === 0 && (
        <p className="text-center text-muted-foreground text-sm py-4">
          No sales recorded for {year} yet. Data will populate as transactions are processed.
        </p>
      )}
    </div>
  )
}
