'use client'

import Link from 'next/link'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import type { InsightsBundle } from '@/lib/insights/bundle'
import { C, ChartTip, MiniTable, Panel, Pill, num, peso, pctText } from './ui'

const XYZ_HELP: Record<string, string> = { X: 'steady', Y: 'variable', Z: 'unpredictable' }
const ABC_HELP: Record<string, string> = { A: 'top 80% of sales', B: 'next 15%', C: 'last 5%' }
const ACTION: Record<string, string> = {
  AX: 'Never run out — tight reorder points', AY: 'Keep safety stock', AZ: 'Watch closely; order often in small lots',
  BX: 'Auto-reorder', BY: 'Normal safety stock', BZ: 'Order on demand',
  CX: 'Low stock, auto-reorder', CY: 'Minimal stock', CZ: 'Order only when requested / consider dropping',
}
const LEAK: Record<string, { label: string; tone: 'red' | 'amber' | 'violet' | 'blue' }> = {
  below_cost: { label: 'Below cost', tone: 'red' }, margin_drop: { label: 'Margin drop', tone: 'amber' },
  cost_not_passed: { label: 'Price too low', tone: 'violet' }, heavy_discount: { label: 'Discounts', tone: 'blue' },
}

export function ProductsTab({ b }: { b: InsightsBundle }) {
  const pr = b.products
  const cats = pr.categories.filter((c) => c.revenue > 0).slice(0, 12)
  const aCount = pr.counts.a
  const leakTotal = pr.leaks.reduce((a, l) => a + l.impact, 0)
  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="ABC–XYZ product matrix" takeaway={`${aCount} products (${pctText((aCount / Math.max(1, pr.counts.sold)) * 100, 0)} of those sold) make 80% of sales. Rows: share of sales; columns: how steady weekly demand is.`}>
          <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-1 text-xs">
            <div />
            {['X', 'Y', 'Z'].map((x) => <div key={x} className="text-center text-muted-foreground pb-1"><b>{x}</b> · {XYZ_HELP[x]}</div>)}
            {['A', 'B', 'C'].map((a) => [
              <div key={a} className="pr-2 text-muted-foreground self-center"><b>{a}</b><br /><span className="text-[10px]">{ABC_HELP[a]}</span></div>,
              ...['X', 'Y', 'Z'].map((x) => {
                const cell = pr.matrix[a + x]
                return (
                  <div key={a + x} className={`rounded-md p-2 ${a === 'A' ? 'bg-blue-50 dark:bg-blue-950/40' : a === 'B' ? 'bg-slate-50 dark:bg-slate-900/40' : 'bg-muted/40'}`}>
                    <p className="font-semibold">{cell.count} items · {peso(cell.revenue, { compact: true })}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{ACTION[a + x]}</p>
                  </div>
                )
              }),
            ])}
          </div>
        </Panel>
        <Panel title="Profit by category" takeaway={cats[0] ? `${cats[0].category} earns the most gross profit (${peso(cats[0].profit)}). GMROI = yearly profit per ₱1 of stock.` : undefined}>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={cats} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" fontSize={11} tickFormatter={(v) => peso(v, { compact: true })} />
                <YAxis type="category" dataKey="category" fontSize={11} width={90} />
                <Tooltip content={<ChartTip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="revenue" name="Revenue" fill={C.revenue} />
                <Bar dataKey="profit" name="Gross profit" fill={C.profit} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Categories: margin and stock productivity">
        <MiniTable head={['Category', 'Revenue', 'Profit', 'Margin', 'Stock value', 'GMROI', 'Turns/yr']}
          rows={pr.categories.slice(0, 20).map((c) => [c.category, peso(c.revenue), peso(c.profit), pctText(c.marginPct), peso(c.stockValue), c.gmroi == null ? '—' : c.gmroi.toFixed(2), c.turns == null ? '—' : c.turns.toFixed(1)])} />
      </Panel>

      <Panel title={`Margin leaks (${pr.leaks.length})`} takeaway={pr.leaks.length ? `About ${peso(leakTotal)} of profit at stake. Fix prices or stop below-cost sales.` : 'No margin leaks found. 👍'}>
        <MiniTable head={['Product', 'Issue', 'Detail', 'At stake']} align={['l', 'l', 'l', 'r']}
          rows={pr.leaks.slice(0, 25).map((l) => [<Link key={l.product_id} href={`/products/${l.product_id}`} className="hover:underline">{l.name}</Link>, <Pill key="p" tone={LEAK[l.kind].tone}>{LEAK[l.kind].label}</Pill>, <span key="d" className="text-xs text-muted-foreground">{l.detail}</span>, peso(l.impact)])} />
      </Panel>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Top products" takeaway="By revenue in the selected period.">
          <MiniTable head={['Product', 'Class', 'Sold', 'Revenue', 'Margin']}
            rows={pr.top.slice(0, 20).map((p) => [<Link key={p.product_id} href={`/products/${p.product_id}`} className="hover:underline">{p.name}</Link>, `${p.abc ?? ''}${p.xyz ?? ''}`, `${num(p.qty, 1)} ${p.uom}`, peso(p.revenue), pctText(p.marginPct)])} />
        </Panel>
        <div className="space-y-4">
          <Panel title="Price changes vs volume" takeaway="Last 8 weeks vs the 8 before. Shows whether price increases cost you volume.">
            <MiniTable head={['Product', 'Price', 'Volume', 'Revenue']}
              rows={pr.priceVolume.slice(0, 10).map((x) => [x.name, `${x.priceChange > 0 ? '+' : ''}${x.priceChange.toFixed(0)}%`, `${x.volumeChange > 0 ? '+' : ''}${x.volumeChange.toFixed(0)}%`, `${x.revenueChange > 0 ? '+' : ''}${x.revenueChange.toFixed(0)}%`])} empty="No notable price changes." />
          </Panel>
          <Panel title="Often bought together" takeaway="Display these side by side, or offer them as bundles.">
            <MiniTable head={['Product', 'With', 'Sales']} align={['l', 'l', 'r']} rows={pr.pairs.slice(0, 10).map((x) => [x.a, x.b, num(x.together)])} empty="Not enough data yet." />
          </Panel>
        </div>
      </div>
    </div>
  )
}
