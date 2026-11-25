'use client'

import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import type { InsightsBundle } from '@/lib/insights/bundle'
import { C, ChartTip, Kpi, MiniTable, Panel, monthName, num, peso, pctText } from './ui'

export function CashTab({ b }: { b: InsightsBundle }) {
  const cash = b.overview.cash
  const months = b.sales.months.map((m) => ({ ...m, label: monthName(m.month) + (m.partial ? '*' : ''), expenseRatio: m.revenue ? (m.expenses / m.revenue) * 100 : 0 }))
  const full = b.sales.months.filter((m) => !m.partial)
  const first3 = full.slice(0, 3), last3 = full.slice(-3)
  const avg = (xs: typeof full) => xs.reduce((a, m) => a + m.revenue, 0) / Math.max(1, xs.length)
  const growth = first3.length && last3.length ? ((avg(last3) - avg(first3)) / Math.max(1, avg(first3))) * 100 : null
  const tied = [
    { label: 'Stock on shelves', amount: cash.inventoryValue },
    { label: '…of which unsold 90+ days', amount: b.inventory.dead.buckets[1].value },
    { label: 'Customer utang (AR)', amount: cash.arOpen },
    { label: 'Owed to suppliers (AP)', amount: -cash.apOpen },
  ]
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Growth" value={growth == null ? '—' : `${growth > 0 ? '+' : ''}${growth.toFixed(0)}%`} sub="last 3 months vs first 3 months" />
        <Kpi label="Cash cycle" value={`${Math.round(cash.ccc)} days`} sub={`DIO ${Math.round(cash.dio)} + DSO ${Math.round(cash.dso)} − DPO ${Math.round(cash.dpo)}`} hint="How long a peso is tied up from paying suppliers to collecting from customers." />
        <Kpi label="Monthly expenses" value={peso(cash.monthlyExpenses, { compact: true })} sub="avg of last 3 months" />
        <Kpi label="Break-even" value={`${peso(cash.breakEvenMonthly, { compact: true })}/mo`} sub={`${peso(cash.breakEvenDaily)}/day of sales`} />
      </div>

      <Panel title="Monthly profit & loss" takeaway="Net = gross profit − recorded expenses. * = month in progress.">
        <div className="h-64">
          <ResponsiveContainer>
            <ComposedChart data={months}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(v) => peso(v, { compact: true })} width={56} />
              <Tooltip content={<ChartTip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="grossProfit" name="Gross profit" fill={C.profit} radius={[3, 3, 0, 0]} />
              <Bar dataKey="expenses" name="Expenses" fill={C.cost} radius={[3, 3, 0, 0]} />
              <Line dataKey="netProfit" name="Net profit" stroke={C.warn} strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3">
          <MiniTable head={['Month', 'Revenue', 'MoM', 'Gross profit', 'Margin', 'Expenses', 'Net', 'Purchases', 'Sales', 'Avg ticket']}
            rows={[...months].reverse().map((m) => [m.label, peso(m.revenue), m.momGrowth == null ? '—' : `${m.momGrowth > 0 ? '+' : ''}${m.momGrowth.toFixed(0)}%`, peso(m.grossProfit), pctText(m.marginPct), peso(m.expenses), <span key="n" className={m.netProfit < 0 ? 'text-red-600' : ''}>{peso(m.netProfit)}</span>, peso(m.purchases), num(m.sales), peso(m.avgTicket)])} />
        </div>
      </Panel>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Where cash is tied up" takeaway="Lower stock and faster collection free up cash for growth.">
          <MiniTable head={['', 'Amount']} rows={tied.map((t) => [t.label, peso(t.amount)])} />
          {cash.investorValue > 0 && <p className="text-xs text-muted-foreground mt-2">Investor-funded stock on hand: {peso(cash.investorValue)} ({pctText((cash.investorValue / Math.max(1, cash.inventoryValue)) * 100, 0)} of stock value).</p>}
        </Panel>
        <Panel title="Expenses vs revenue" takeaway="Expense ratio by month — watch for it creeping up.">
          <MiniTable head={['Month', 'Expenses', '% of revenue']} rows={[...months].reverse().slice(0, 8).map((m) => [m.label, peso(m.expenses), pctText(m.expenseRatio)])} />
        </Panel>
      </div>
    </div>
  )
}
