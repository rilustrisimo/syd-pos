'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ResponsiveContainer, ComposedChart, Area, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceArea } from 'recharts'
import { CloudRain } from 'lucide-react'
import type { InsightsBundle } from '@/lib/insights/bundle'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { downloadCSV } from '@/lib/utils/export'
import { C, ChartTip, Kpi, MiniTable, Panel, Pill, monthName, num, peso, pctText, shortDate } from './ui'
import { STATUS } from './inventory-tab'

const CLS: Record<string, string> = { smooth: 'Steady', erratic: 'Up & down', intermittent: 'Occasional', lumpy: 'Occasional, big orders', none: '—' }

export function ForecastTab({ b }: { b: InsightsBundle }) {
  const f = b.forecast
  const [q, setQ] = useState('')
  const [onlyOrder, setOnlyOrder] = useState(true)

  const months = [
    ...b.sales.months.filter((m) => !m.partial).slice(-6).map((m) => ({ label: monthName(m.month), actual: m.revenue, forecast: null as number | null, band: null as [number, number] | null, month: m.month })),
    ...f.total12.map((m) => ({ label: monthName(m.month), actual: m.actualToDate, forecast: m.revenue, band: [m.lo, m.hi] as [number, number], month: m.month })),
  ]
  // Contiguous runs of season months (the chart can span two years).
  const runs = (mm: string[]) => {
    const out: { x1: string; x2: string }[] = []
    months.forEach((m, i) => {
      if (!mm.includes(m.month.slice(5, 7))) return
      const prev = months[i - 1]
      if (prev && mm.includes(prev.month.slice(5, 7)) && out.length) out[out.length - 1].x2 = m.label
      else out.push({ x1: m.label, x2: m.label })
    })
    return out
  }
  const dry = runs(['02', '03', '04', '05'])
  const rainy = runs(['07', '08', '09'])
  const peak = [...f.total12].sort((a, x) => x.revenue - a.revenue)[0]
  const low = [...f.total12].sort((a, x) => a.revenue - x.revenue)[0]
  const yearTotal = f.total12.reduce((a, m) => a + m.revenue, 0)

  const reorder = useMemo(() => {
    const byId = new Map(b.inventory.reorder.map((r) => [r.product_id, r]))
    return f.products.map((p) => ({ ...p, r: byId.get(p.product_id) }))
      .filter((p) => (!q || p.name.toLowerCase().includes(q.toLowerCase())) && (!onlyOrder || p.r?.status === 'order_now' || p.r?.status === 'order_soon'))
  }, [b.inventory.reorder, f.products, q, onlyOrder])

  const weeks = [
    ...f.weeklyActual.map((w) => ({ label: shortDate(w.week), actual: w.revenue, forecast: null as number | null })),
    ...f.nextWeeks.map((w, i) => ({ label: shortDate(w.week) + (i === 0 ? ' (this wk)' : ''), actual: null as number | null, forecast: w.revenue })),
  ]
  const bt = f.backtest
  const heavyDays = f.rain.filter((r) => r.heavy)

  const exportOrders = () => downloadCSV(reorder.map((p) => ({
    product: p.name, category: p.category, unit: p.uom, demand_class: CLS[p.cls], forecast_4w: p.total4w.toFixed(1),
    on_hand: p.r?.onHand ?? '', reorder_point: p.r?.reorderPoint.toFixed(1) ?? '', suggest_order: p.r?.suggestQty ?? '', lead_days: p.r?.leadDays ?? '', status: p.r ? STATUS[p.r.status].label : '',
  })), `order-plan-${b.meta.today}.csv`)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Next 12 months" value={peso(yearTotal, { compact: true })} sub="forecast revenue" />
        <Kpi label="Peak month ahead" value={peak ? monthName(peak.month) : '—'} sub={peak ? peso(peak.revenue, { compact: true }) : ''} />
        <Kpi label="Slowest month ahead" value={low ? monthName(low.month) : '—'} sub={low ? peso(low.revenue, { compact: true }) : ''} />
        <Kpi label="Forecast accuracy" value={bt.products ? pctText(100 - bt.wape4wModel, 0) : '—'} hint="Rolling backtest on top products over the last 8 weeks: 100% − WAPE of 4-week totals. Compared to a simple 'same as last 4 weeks' guess." sub={bt.products ? `simple guess: ${pctText(100 - bt.wape4wNaive, 0)}` : 'needs 16+ weeks of sales'} />
      </div>

      <Panel title="Revenue: last 6 months and next 12" takeaway={`Shaded: dry-season build months (Feb–May, usually busiest) and rainy months (Jul–Sep, usually slowest). Band = 80% likely range. Based on ${f.historyMonths} full months of history, blended with the PH construction season pattern until we have 2 years.`}>
        <div className="h-72">
          <ResponsiveContainer>
            <ComposedChart data={months}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              {dry.map((r) => <ReferenceArea key={'d' + r.x1} x1={r.x1} x2={r.x2} fill="#fde68a" fillOpacity={0.25} />)}
              {rainy.map((r) => <ReferenceArea key={'r' + r.x1} x1={r.x1} x2={r.x2} fill="#93c5fd" fillOpacity={0.2} />)}
              <XAxis dataKey="label" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(v) => peso(v, { compact: true })} width={56} />
              <Tooltip content={<ChartTip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area dataKey="band" name="Likely range" stroke="none" fill={C.band} fillOpacity={0.35} />
              <Bar dataKey="actual" name="Actual" fill={C.revenue} radius={[3, 3, 0, 0]} />
              <Line dataKey="forecast" name="Forecast" stroke={C.forecast} strokeWidth={2} strokeDasharray="5 4" dot />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Weekly: last 8 weeks and next 4" takeaway="Next weeks include holidays, paydays and the rain forecast.">
          <div className="h-56">
            <ResponsiveContainer>
              <ComposedChart data={weeks}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" fontSize={10} />
                <YAxis fontSize={11} tickFormatter={(v) => peso(v, { compact: true })} width={52} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="actual" name="Actual" fill={C.revenue} radius={[3, 3, 0, 0]} />
                <Bar dataKey="forecast" name="Forecast" fill={C.forecast} fillOpacity={0.6} radius={[3, 3, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Next 16 days: rain, paydays, holidays" takeaway={`Heavy rain (20mm+) has changed daily sales by ${pctText((f.effects.rainFactor - 1) * 100, 0)} (${f.effects.rainSamples} rainy days seen). Holidays: ${pctText((f.effects.holidayFactor - 1) * 100, 0)}. Paydays: ${f.effects.paydayFactor >= 1 ? '+' : ''}${pctText((f.effects.paydayFactor - 1) * 100, 0)}.`}>
          {f.rain.length === 0 ? <p className="text-sm text-muted-foreground">Weather forecast unavailable right now.</p> : (
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1">
              {f.rain.map((r) => (
                <div key={r.day} className={`rounded-md border p-1.5 text-center text-[11px] ${r.heavy ? 'bg-blue-50 border-blue-300 dark:bg-blue-950/40' : ''}`} title={r.holiday ?? ''}>
                  <p className="font-medium">{shortDate(r.day)}</p>
                  <p className="flex items-center justify-center gap-0.5 text-muted-foreground"><CloudRain className="h-3 w-3" />{Math.round(r.rain_mm)}mm</p>
                  {r.holiday && <p className="text-red-600 truncate">holiday</p>}
                  {!r.holiday && r.payday && <p className="text-amber-600">payday</p>}
                </div>
              ))}
            </div>
          )}
          {heavyDays.length > 0 && <p className="text-xs mt-2">⚠️ Heavy rain on {heavyDays.map((h) => shortDate(h.day)).join(', ')}: fewer walk-ins; plan deliveries around it.</p>}
          {f.holidays.length > 0 && <p className="text-xs text-muted-foreground mt-2">Next holidays: {f.holidays.slice(0, 4).map((h) => `${shortDate(h.day)} ${h.name}`).join(' · ')}</p>}
        </Panel>
      </div>

      <Panel title="Categories: next 3 months" takeaway="Revenue forecast per category, for planning big supplier orders and cash.">
        <MiniTable head={['Category', 'Avg last 3 mo', ...(f.categories[0]?.months ?? []).map((m, i) => monthName(m.month) + (i === 0 ? ' (now)' : ''))]}
          rows={f.categories.map((c) => [c.category, peso(c.last3Avg, { compact: true }), ...c.months.map((m) => <span key={m.month} title={`${peso(m.lo)} – ${peso(m.hi)}`}>{peso(m.revenue, { compact: true })}</span>)])} />
      </Panel>

      <Panel
        title="Order plan: next 4 weeks per product"
        takeaway="Reorder point = demand during delivery time + safety stock (95% service for A items, 90% B, 85% C). Lead times come from your POs."
        action={<Button size="sm" variant="outline" className="h-7 text-xs" onClick={exportOrders}>Export CSV</Button>}
      >
        <div className="flex flex-wrap gap-2 mb-3 items-center">
          <Input placeholder="Search product…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 max-w-xs" />
          <Button size="sm" variant={onlyOrder ? 'default' : 'outline'} className="h-8 text-xs" onClick={() => setOnlyOrder(!onlyOrder)}>{onlyOrder ? 'Showing: needs ordering' : 'Showing: all forecasted'}</Button>
          <Link href="/purchases/reorder" className="text-xs text-blue-600 hover:underline">Open Reorder Suggestions →</Link>
        </div>
        <MiniTable head={['Product', 'Pattern', 'Wk 1', 'Wk 2', 'Wk 3', 'Wk 4', 'On hand', 'Reorder pt', 'Order', 'Status']}
          rows={reorder.slice(0, 60).map((p) => [
            <span key="n"><Link href={`/products/${p.product_id}`} className="hover:underline">{p.name}</Link> <span className="text-[10px] text-muted-foreground">{p.uom}</span></span>,
            <span key="c" className="text-xs text-muted-foreground" title={p.method === 'cautious' ? 'Out of stock for long stretches: forecast spreads past sales over at least 8 weeks' : p.method === 'average' ? 'Recent average tested more accurate than the model for this product' : 'Demand model tested more accurate than a recent average'}>{CLS[p.cls]}{p.method === 'cautious' ? ' · little data' : ''}</span>,
            ...p.weeks.map((w) => <span key={w.week} title={`${num(w.lo, 1)} – ${num(w.hi, 1)}`}>{num(w.qty, 1)}</span>),
            num(p.r?.onHand, 1), num(p.r?.reorderPoint, 1), p.r?.suggestQty ? <b key="o">{num(p.r.suggestQty)}</b> : '—',
            p.r ? <Pill key="s" tone={STATUS[p.r.status].tone}>{STATUS[p.r.status].label}</Pill> : '',
          ])} empty="Nothing needs ordering right now." />
      </Panel>
    </div>
  )
}
