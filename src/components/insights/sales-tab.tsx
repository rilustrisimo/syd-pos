'use client'

import { useState } from 'react'
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts'
import type { InsightsBundle } from '@/lib/insights/bundle'
import { Button } from '@/components/ui/button'
import { C, ChartTip, MiniTable, Panel, num, peso, pctText, shortDate } from './ui'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const METHOD: Record<string, string> = { cash: 'Cash', gcash: 'GCash', maya: 'Maya', bank_transfer: 'Bank transfer', credit: 'Credit', government_withholding: 'Gov. withholding' }

function weekly(daily: InsightsBundle['sales']['daily']) {
  const out: { label: string; revenue: number; profit: number }[] = []
  for (let i = 0; i < daily.length; i += 7) {
    const chunk = daily.slice(i, i + 7)
    out.push({ label: shortDate(chunk[0].date), revenue: chunk.reduce((a, d) => a + d.revenue, 0), profit: chunk.reduce((a, d) => a + d.profit, 0) })
  }
  return out
}

export function SalesTab({ b }: { b: InsightsBundle }) {
  const [grain, setGrain] = useState<'day' | 'week'>(b.sales.daily.length > 62 ? 'week' : 'day')
  const series = grain === 'day' ? b.sales.daily.map((d) => ({ label: shortDate(d.date), revenue: d.revenue, profit: d.profit })) : weekly(b.sales.daily)
  const p = b.sales.patterns
  const bestDay = [...p.weekday].sort((a, x) => x.avg - a.avg)[0]
  const slowDay = [...p.weekday].filter((d) => d.avg > 0).sort((a, x) => a.avg - x.avg)[0]

  // Heatmap
  const cells = new Map(b.sales.hourly.map((h) => [`${h.dow}-${h.hour}`, h]))
  const hours = b.sales.hourly.length ? [...new Set(b.sales.hourly.map((h) => h.hour))].sort((a, x) => a - x) : []
  const hMin = hours.length ? Math.min(...hours) : 7, hMax = hours.length ? Math.max(...hours) : 18
  const maxRev = Math.max(1, ...b.sales.hourly.map((h) => h.revenue))
  const peak = [...b.sales.hourly].sort((a, x) => x.revenue - a.revenue)[0]
  const payTotal = b.sales.paymentMix.reduce((a, m) => a + m.amount, 0)
  const d = b.sales.deliveries

  return (
    <div className="space-y-4">
      <Panel
        title="Sales trend"
        takeaway={`${num(b.overview.current.tradingDays)} trading days · ${peso(b.overview.current.revenuePerDay)} per trading day on average.`}
        action={<div className="flex gap-1">{(['day', 'week'] as const).map((g) => <Button key={g} size="sm" variant={grain === g ? 'default' : 'outline'} className="h-7 px-2 text-xs" onClick={() => setGrain(g)}>{g === 'day' ? 'Daily' : 'Weekly'}</Button>)}</div>}
      >
        <div className="h-64">
          <ResponsiveContainer>
            <AreaChart data={series}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" fontSize={11} minTickGap={16} />
              <YAxis fontSize={11} tickFormatter={(v) => peso(v, { compact: true })} width={56} />
              <Tooltip content={<ChartTip />} />
              <Area dataKey="revenue" name="Revenue" stroke={C.revenue} fill={C.revenue} fillOpacity={0.15} />
              <Area dataKey="profit" name="Gross profit" stroke={C.profit} fill={C.profit} fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid md:grid-cols-2 gap-4">
        <Panel title="Best days of the week" takeaway={bestDay && slowDay ? `${bestDay.label} is busiest; ${slowDay.label} is slowest (${Math.round((1 - slowDay.avg / Math.max(1, bestDay.avg)) * 100)}% lower). Schedule deliveries/restocking on slow days.` : undefined}>
          <div className="h-48">
            <ResponsiveContainer>
              <BarChart data={p.weekday}>
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => peso(v, { compact: true })} width={52} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="avg" name="Avg revenue/day" radius={[3, 3, 0, 0]}>
                  {p.weekday.map((w) => <Cell key={w.label} fill={w.label === bestDay?.label ? C.revenue : C.muted} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Payday effect" takeaway={`Payday days (15th–16th, 30th–1st) average ${p.paydayLift >= 0 ? '+' : ''}${p.paydayLift.toFixed(0)}% vs other days. ${p.paydayLift > 8 ? 'Have fast movers fully stocked before paydays.' : ''}`}>
          <div className="h-48">
            <ResponsiveContainer>
              <BarChart data={p.dayOfMonth}>
                <XAxis dataKey="label" fontSize={10} />
                <YAxis fontSize={11} tickFormatter={(v) => peso(v, { compact: true })} width={52} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="avg" name="Avg revenue/day" radius={[3, 3, 0, 0]}>
                  {p.dayOfMonth.map((x) => <Cell key={x.label} fill={x.label.includes('payday') ? C.warn : C.muted} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Busy hours" takeaway={peak ? `Peak: ${DAYS[peak.dow]} around ${peak.hour}:00. Put more staff on the counter then.` : undefined}>
        <div className="overflow-x-auto">
          <table className="text-[10px] border-separate border-spacing-0.5">
            <thead><tr><th />{Array.from({ length: hMax - hMin + 1 }, (_, i) => <th key={i} className="font-normal text-muted-foreground w-7">{hMin + i}</th>)}</tr></thead>
            <tbody>
              {DAYS.map((dn, di) => (
                <tr key={dn}>
                  <td className="pr-1 text-muted-foreground">{dn}</td>
                  {Array.from({ length: hMax - hMin + 1 }, (_, i) => {
                    const c = cells.get(`${di}-${hMin + i}`)
                    const a = c ? 0.08 + 0.92 * (c.revenue / maxRev) : 0
                    return <td key={i} title={c ? `${dn} ${hMin + i}:00 · ${peso(c.revenue)} · ${c.sales_count} sales` : ''} className="w-7 h-5 rounded-sm" style={{ background: c ? `rgba(37,99,235,${a})` : 'var(--muted)' }} />
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid md:grid-cols-3 gap-4">
        <Panel title="How customers pay" takeaway="Money actually received in the period, by method.">
          <MiniTable head={['Method', 'Amount', 'Share']} rows={b.sales.paymentMix.map((m) => [METHOD[m.method] ?? m.method, peso(m.amount), pctText((m.amount / Math.max(1, payTotal)) * 100)])} />
        </Panel>
        <Panel title="Deliveries by distance" takeaway={`${pctText(b.overview.current.deliveryShare)} of sales are delivered.`}>
          <MiniTable head={['Distance', 'Trips', 'Sales', 'Fees']} rows={d.bands.map((x) => [x.label, num(x.count), peso(x.revenue, { compact: true }), peso(x.fees, { compact: true })])} />
        </Panel>
        <Panel title="Top delivery areas">
          <MiniTable head={['Area', 'Trips', 'Sales']} rows={d.places.slice(0, 8).map((x) => [x.place, num(x.count), peso(x.revenue, { compact: true })])} empty="No deliveries in this period." />
        </Panel>
      </div>

      {b.sales.branches.length > 1 && (
        <Panel title="Branches">
          <MiniTable head={['Branch', 'Revenue', 'Gross profit', 'Margin', 'Sales', 'Avg ticket']} rows={b.sales.branches.map((x) => [x.branch, peso(x.revenue), peso(x.grossProfit), pctText(x.marginPct), num(x.sales), peso(x.avgTicket)])} />
        </Panel>
      )}
    </div>
  )
}
