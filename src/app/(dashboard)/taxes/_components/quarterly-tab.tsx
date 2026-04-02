'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useQuarterlyTaxData, useTaxSettings } from '@/hooks/useTaxes'
import {
  computePercentageTax,
  compute8FlatQuarterlyAdvance,
  computeGraduatedQuarterlyAdvance,
  applyGraduatedTable,
} from '@/lib/utils/tax-calculator'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const QUARTER_LABELS = ['Q1 (Jan–Mar)', 'Q2 (Apr–Jun)', 'Q3 (Jul–Sep)', 'Q4 (Oct–Dec)']
const QUARTER_DUE_DATES = {
  '2551q': ['April 25', 'July 25', 'October 25', 'January 25 (next yr)'],
  '1701q': ['May 15',   'August 15', 'November 15', '(reconciled at Annual)'],
}

interface Props {
  branchId: string | null
  year: number
  quarter: number
  onQuarterChange: (q: number) => void
}

interface Row { label: string; value: number; sub?: string; bold?: boolean }

function DataRow({ label, value, sub, bold }: Row) {
  return (
    <div className={`flex justify-between py-1.5 border-b last:border-0 ${bold ? 'font-semibold' : ''}`}>
      <div>
        <span className="text-sm">{label}</span>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
      <span className={`text-sm ${bold ? 'text-foreground' : 'text-muted-foreground'}`}>
        ₱ {fmt(value)}
      </span>
    </div>
  )
}

export function QuarterlyTab({ branchId, year, quarter, onQuarterChange }: Props) {
  const { data: settings } = useTaxSettings(branchId)
  const { data, isLoading } = useQuarterlyTaxData(branchId, year, quarter)

  const calcs = useMemo(() => {
    if (!data) return null
    const pctTax = computePercentageTax(data.netGrossSales)

    // OSD deduction for this quarter
    const osdDeduction    = data.netGrossSales * 0.40
    const osdTaxableInc   = Math.max(0, data.netGrossSales - osdDeduction)
    const osdIncomeTax_q  = applyGraduatedTable(osdTaxableInc) // simplified quarterly view

    // Itemized deduction
    const itemizedDeduction   = data.cogs + data.expenses
    const itemizedTaxableInc  = Math.max(0, data.netGrossSales - itemizedDeduction)
    const itemizedIncomeTax_q = applyGraduatedTable(itemizedTaxableInc)

    // 8% flat advance
    const flatAdvance = compute8FlatQuarterlyAdvance(data.netGrossSales, 0)

    return { pctTax, osdDeduction, osdTaxableInc, osdIncomeTax_q, itemizedDeduction, itemizedTaxableInc, itemizedIncomeTax_q, flatAdvance }
  }, [data])

  return (
    <div className="space-y-4">
      {/* Quarter selector */}
      <div className="flex gap-2">
        {[1, 2, 3, 4].map(q => (
          <Button
            key={q}
            variant={quarter === q ? 'default' : 'outline'}
            size="sm"
            onClick={() => onQuarterChange(q)}
          >
            {QUARTER_LABELS[q - 1]}
          </Button>
        ))}
      </div>

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {!isLoading && data && calcs && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Source data */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Source Data — {QUARTER_LABELS[quarter - 1]} {year}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <DataRow label="Gross Sales"        value={data.grossSales} />
              <DataRow label="Returns"             value={data.returns} />
              <DataRow label="Net Gross Receipts"  value={data.netGrossSales} bold />
              <DataRow label="Cost of Goods Sold"  value={data.cogs} sub="from transaction lines" />
              <DataRow label="Operating Expenses"  value={data.expenses} sub="from expenses log" />
              <DataRow label="Gross Profit"        value={Math.max(0, data.netGrossSales - data.cogs)} bold />
            </CardContent>
          </Card>

          {/* % Tax */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex justify-between">
                <span>BIR 2551Q — Percentage Tax</span>
                <span className="text-muted-foreground font-normal text-xs">Due {QUARTER_DUE_DATES['2551q'][quarter - 1]}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <DataRow label="Net Gross Receipts" value={data.netGrossSales} />
              <DataRow label="× 3% Rate"           value={0} sub="(rate)" />
              <DataRow label="Percentage Tax Due"  value={calcs.pctTax} bold />
              <p className="text-xs text-muted-foreground mt-2">
                Not required if the business elects the 8% flat rate income tax option.
              </p>
            </CardContent>
          </Card>

          {/* Income Tax — 8% Flat */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex justify-between">
                <span>1701Q — Option A: 8% Flat Rate</span>
                <span className="text-muted-foreground font-normal text-xs">Due {QUARTER_DUE_DATES['1701q'][quarter - 1]}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <DataRow label="Quarterly Gross Receipts" value={data.netGrossSales} />
              <DataRow label="× 8% Rate"                value={0} sub="(no ₱250K deduction quarterly)" />
              <DataRow label="Income Tax Advance"       value={calcs.flatAdvance} bold />
              <DataRow label="Percentage Tax"           value={0} sub="Not required under 8% option" />
              <DataRow label="Total Quarterly Outlay"   value={calcs.flatAdvance} bold />
            </CardContent>
          </Card>

          {/* Income Tax — Graduated + OSD */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex justify-between">
                <span>1701Q — Option B: Graduated + OSD</span>
                <span className="text-muted-foreground font-normal text-xs">Due {QUARTER_DUE_DATES['1701q'][quarter - 1]}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <DataRow label="Quarterly Gross Receipts" value={data.netGrossSales} />
              <DataRow label="Less: 40% OSD"            value={calcs.osdDeduction} />
              <DataRow label="Taxable Income"           value={calcs.osdTaxableInc} />
              <DataRow label="Income Tax (graduated)"   value={calcs.osdIncomeTax_q} bold />
              <DataRow label="+ Percentage Tax"         value={calcs.pctTax} />
              <DataRow label="Total Quarterly Outlay"   value={calcs.osdIncomeTax_q + calcs.pctTax} bold />
            </CardContent>
          </Card>

          {/* Income Tax — Graduated + Itemized */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex justify-between">
                <span>1701Q — Option C: Graduated + Itemized Deductions</span>
                <span className="text-muted-foreground font-normal text-xs">Due {QUARTER_DUE_DATES['1701q'][quarter - 1]}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <div className="grid md:grid-cols-2 gap-x-8">
                <div>
                  <DataRow label="Quarterly Gross Receipts" value={data.netGrossSales} />
                  <DataRow label="Less: COGS"               value={data.cogs} />
                  <DataRow label="Less: Operating Expenses" value={data.expenses} />
                  <DataRow label="Total Deductions"         value={calcs.itemizedDeduction} />
                </div>
                <div>
                  <DataRow label="Taxable Income"           value={calcs.itemizedTaxableInc} bold />
                  <DataRow label="Income Tax (graduated)"   value={calcs.itemizedIncomeTax_q} bold />
                  <DataRow label="+ Percentage Tax"         value={calcs.pctTax} />
                  <DataRow label="Total Quarterly Outlay"   value={calcs.itemizedIncomeTax_q + calcs.pctTax} bold />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        * Quarterly income tax amounts shown are simplified estimates based on this quarter's data only.
        Actual quarterly advances (1701Q) use cumulative year-to-date figures and deduct prior-quarter payments.
        Use the Regime Comparison tab for a full-year picture.
      </p>
    </div>
  )
}
