'use client'

import Link from 'next/link'
import type { InsightsBundle } from '@/lib/insights/bundle'
import { Kpi, MiniTable, Panel, Pill, num, peso, pctText, monthName } from './ui'

export const STATUS: Record<string, { label: string; tone: 'red' | 'amber' | 'green' | 'violet' | 'muted' }> = {
  order_now: { label: 'Order now', tone: 'red' }, order_soon: { label: 'Order soon', tone: 'amber' }, ok: { label: 'OK', tone: 'green' },
  overstock: { label: 'Overstock', tone: 'violet' }, dead: { label: 'Dead stock', tone: 'muted' }, no_demand: { label: 'No demand', tone: 'muted' },
}

export function InventoryTab({ b }: { b: InsightsBundle }) {
  const inv = b.inventory
  const cash = b.overview.cash
  const counts = inv.statusCounts
  const overValue = inv.overstock.reduce((a, r) => a + r.stockValue, 0)
  const sh = inv.shrinkage
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Stock value (at cost)" value={peso(cash.inventoryValue, { compact: true })} sub={cash.investorValue > 0 ? `${peso(cash.investorValue, { compact: true })} investor-owned` : `${Math.round(cash.dio)} days of stock`} />
        <Kpi label="Sales lost to stockouts" value={peso(inv.lostSales90, { compact: true })} sub="estimated, last 90 days" hint="Days out of stock × usual daily sales when in stock × price." />
        <Kpi label="Dead stock (90+ days)" value={peso(inv.dead.buckets[1].value, { compact: true })} sub={`${num(inv.dead.buckets[1].items)} items unsold`} />
        <Kpi label="Stock losses" value={peso(sh.totalLosses + sh.totalCount, { compact: true })} sub={`damage/theft ${peso(sh.totalLosses, { compact: true })} · stocktake ${peso(sh.totalCount, { compact: true })}`} hint="From stock adjustments by reason. Data-entry corrections are shown separately and not counted as losses." />
      </div>

      <Panel title="Stock health" takeaway={`${counts.order_now ?? 0} to order now · ${counts.order_soon ?? 0} soon · ${counts.overstock ?? 0} overstocked (${peso(overValue, { compact: true })}) · ${counts.dead ?? 0} dead.`}>
        <div className="flex flex-wrap gap-2">
          {Object.entries(STATUS).map(([k, s]) => <span key={k} className="flex items-center gap-1 text-xs"><Pill tone={s.tone}>{s.label}</Pill>{counts[k] ?? 0}</span>)}
        </div>
      </Panel>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Stockouts that cost sales" takeaway="Raise the reorder point or order earlier for these.">
          <MiniTable head={['Product', 'Days out (90d)', 'Lost sales', 'Status']}
            rows={inv.stockoutProducts.slice(0, 15).map((r) => [<Link key={r.product_id} href={`/products/${r.product_id}`} className="hover:underline">{r.name}</Link>, num(r.stockoutDays90), peso(r.lostSales90), <Pill key="s" tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill>])} empty="No stockouts in the last 90 days." />
        </Panel>
        <Panel title="Dead stock" takeaway="Cash sitting on the shelf. Promo, bundle with fast movers, or return to supplier.">
          <MiniTable head={['Product', 'On hand', 'Value', 'Last sold']}
            rows={inv.dead.list.slice(0, 15).map((r) => [<Link key={r.product_id} href={`/products/${r.product_id}`} className="hover:underline">{r.name}</Link>, `${num(r.onHand, 1)} ${r.uom}`, peso(r.stockValue), r.daysSinceSale == null ? 'never' : `${r.daysSinceSale}d ago`])} empty="No dead stock. 👍" />
          <div className="flex gap-3 mt-3 text-xs text-muted-foreground flex-wrap">
            {inv.dead.buckets.map((x) => <span key={x.days}>{x.days}+ days: <b className="text-foreground">{peso(x.value, { compact: true })}</b> ({x.items})</span>)}
          </div>
        </Panel>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Overstock" takeaway="More than 120 days of supply at the current selling rate.">
          <MiniTable head={['Product', 'On hand', 'Days of supply', 'Value']}
            rows={inv.overstock.slice(0, 12).map((r) => [r.name, `${num(r.onHand, 1)} ${r.uom}`, r.daysOfCover == null ? '∞' : num(r.daysOfCover), peso(r.stockValue)])} empty="Nothing overstocked." />
        </Panel>
        <Panel title="Suppliers: delivery time & on-time" takeaway="Set each supplier's usual delivery time (Suppliers → Edit). Until set, reorder points assume 2 days, because POs are usually entered on the day stock arrives.">
          <MiniTable head={['Supplier', 'POs', 'Delivery time', 'On time', 'Bought']}
            rows={inv.suppliers.slice(0, 12).map((s) => [s.supplier, num(s.pos), s.setLeadDays != null ? `${s.setLeadDays}d (set)` : <span key="l" className="text-amber-600">not set</span>, s.onTimePct == null ? '—' : pctText(s.onTimePct, 0), peso(s.total, { compact: true })])} empty="No received POs with delivery dates yet." />
        </Panel>
      </div>

      <Panel title="Stock adjustments by reason" takeaway={`Damage/theft/expired: ${peso(sh.totalLosses)} · stocktake differences: ${peso(sh.totalCount)} · corrections/other (not counted as losses): ${peso(sh.totalCorrections)}. Pick the right reason when adjusting so these stay meaningful.`}>
        <div className="grid md:grid-cols-2 gap-4">
          <MiniTable head={['Month', 'Damage/theft', 'Stocktake', 'Corrections']} rows={sh.months.map((m) => [monthName(m.month), peso(m.losses), peso(m.count), peso(m.corrections)])} empty="No adjustments." />
          <MiniTable head={['Product', 'Qty lost', 'Value']} rows={sh.top.slice(0, 10).map((p) => [p.name, num(p.qtyLost, 1), peso(p.losses + p.count)])} empty="No losses." />
        </div>
      </Panel>
    </div>
  )
}
