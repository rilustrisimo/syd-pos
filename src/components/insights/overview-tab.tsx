'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { AlertTriangle, AlertCircle, Info } from 'lucide-react'
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import type { InsightsBundle } from '@/lib/insights/bundle'
import { C, ChartTip, Kpi, Panel, monthName, num, peso, pctText } from './ui'

const ICON = { critical: AlertCircle, warning: AlertTriangle, info: Info }
const TONE = { critical: 'text-red-600', warning: 'text-amber-600', info: 'text-blue-600' }

export function AlertsList({ alerts, limit }: { alerts: InsightsBundle['alerts']; limit?: number }) {
  const list = limit ? alerts.slice(0, limit) : alerts
  if (!list.length) return <p className="text-sm text-muted-foreground">No alerts right now. 👍</p>
  return (
    <ul className="space-y-2.5">
      {list.map((a) => {
        const Icon = ICON[a.level]
        const body = (
          <div className="flex gap-2">
            <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${TONE[a.level]}`} />
            <div className="min-w-0">
              <p className="text-sm font-medium leading-snug">{a.title}</p>
              <p className="text-xs text-muted-foreground leading-snug">{a.message}</p>
            </div>
          </div>
        )
        return <li key={a.key}>{a.href ? <Link href={a.href} className="block hover:opacity-80">{body}</Link> : body}</li>
      })}
    </ul>
  )
}

export function OverviewTab({ b, brief }: { b: InsightsBundle; brief: ReactNode }) {
  const { current: c, growth: g, cash } = b.overview
  const months = b.sales.months.map((m) => ({ ...m, label: monthName(m.month) + (m.partial ? '*' : '') }))
  const best = [...b.sales.months].filter((m) => !m.partial).sort((x, y) => y.revenue - x.revenue)[0]
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Revenue" value={peso(c.revenue)} delta={g.revenue} sub="vs prev. period" />
        <Kpi label="Gross profit" value={peso(c.grossProfit)} delta={g.grossProfit} sub={`${pctText(c.marginPct)} margin`} />
        <Kpi label="Net profit" value={peso(c.netProfit)} delta={g.netProfit} sub={`after ${peso(c.expenses, { compact: true })} expenses`} hint="Gross profit minus recorded expenses (payroll, rent, etc.) in the period." />
        <Kpi label="Sales" value={num(c.sales)} delta={g.sales} sub={`avg ticket ${peso(c.avgTicket)}`} />
        <Kpi label="Avg ticket" value={peso(c.avgTicket)} delta={g.avgTicket} sub={`${c.linesPerSale.toFixed(1)} items/sale`} />
        <Kpi label="New customers" value={num(c.newCustomers)} delta={g.newCustomers} />
        <Kpi label="Receivables (utang)" value={peso(cash.arOpen)} sub={`collected in ~${Math.round(cash.dso)} days`} hint="DSO: days of credit sales still unpaid." />
        <Kpi label="Stock value" value={peso(cash.inventoryValue, { compact: true })} sub={`${cash.turns.toFixed(1)} turns/yr · GMROI ${cash.gmroi.toFixed(2)}`} hint="GMROI = yearly gross profit per ₱1 of stock (hardware benchmark ≈ 1.8). Turns: hardware ≈ 4–6/yr." />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {brief}
          <Panel
            title="Monthly revenue & profit"
            takeaway={best ? `Best month so far: ${monthName(best.month)} (${peso(best.revenue)}). * = month in progress.` : undefined}
          >
            <div className="h-64">
              <ResponsiveContainer>
                <ComposedChart data={months}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={(v) => peso(v, { compact: true })} width={56} />
                  <Tooltip content={<ChartTip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="revenue" name="Revenue" fill={C.revenue} radius={[3, 3, 0, 0]} />
                  <Line dataKey="grossProfit" name="Gross profit" stroke={C.profit} strokeWidth={2} dot={false} />
                  <Line dataKey="netProfit" name="Net profit" stroke={C.warn} strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>
        <Panel title={`Alerts (${b.alerts.length})`} takeaway="What needs action now, most urgent first.">
          <AlertsList alerts={b.alerts} limit={12} />
        </Panel>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Cash cycle" value={`${Math.round(cash.ccc)} days`} hint="Days from paying suppliers to collecting from customers: DSO + DIO − DPO. Lower is better." sub={`stock ${Math.round(cash.dio)}d + utang ${Math.round(cash.dso)}d − supplier credit ${Math.round(cash.dpo)}d`} />
        <Kpi label="Break-even sales" value={`${peso(cash.breakEvenMonthly, { compact: true })}/mo`} sub={`≈ ${peso(cash.breakEvenDaily)}/day`} hint="Monthly expenses (avg of last 3 months) ÷ gross margin." />
        <Kpi label="Owed to suppliers" value={peso(cash.apOpen, { compact: true })} sub={`${peso(cash.apDue30, { compact: true })} due in 30 days`} />
        <Kpi label="Credit sales" value={pctText(c.creditShare)} sub="of revenue sold on credit" />
      </div>
    </div>
  )
}
