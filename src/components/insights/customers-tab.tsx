'use client'

import Link from 'next/link'
import type { InsightsBundle } from '@/lib/insights/bundle'
import { Kpi, MiniTable, Panel, Pill, monthName, num, peso, pctText } from './ui'

const SEG_TONE: Record<string, 'green' | 'blue' | 'violet' | 'amber' | 'red' | 'muted'> = {
  Champion: 'green', Loyal: 'blue', New: 'violet', Slipping: 'amber', 'At risk': 'red', Occasional: 'muted', Lost: 'muted',
}

export function CustomersTab({ b }: { b: InsightsBundle }) {
  const cu = b.customers
  const top5Share = cu.top.slice(0, 5).reduce((a, c) => a + c.sharePct, 0)
  const arTotal = cu.ar.buckets.reduce((a, x) => a + x.amount, 0) + cu.ar.walkinAr
  const over60 = cu.ar.buckets.slice(2).reduce((a, x) => a + x.amount, 0)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Named customers" value={num(cu.count)} sub={`walk-ins: ${pctText(cu.walkinShare, 0)} of sales`} />
        <Kpi label="Top 5 customers" value={pctText(top5Share, 0)} sub="of named-customer sales" hint="High share = depending on a few accounts." />
        <Kpi label="Receivables" value={peso(arTotal)} sub={`${peso(over60, { compact: true })} over 60 days`} />
        <Kpi label="Quote → sale" value={pctText(cu.quotations.rate, 0)} sub={`${num(cu.quotations.converted)} of ${num(cu.quotations.quotes)} quotations`} />
      </div>

      <Panel title="Customer segments" takeaway="Judged against each customer's own buying rhythm, not a fixed cutoff.">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {cu.segments.filter((s) => s.count > 0).map((s) => (
            <div key={s.segment} className="rounded-lg border p-3 space-y-1">
              <div className="flex items-center justify-between"><Pill tone={SEG_TONE[s.segment]}>{s.segment}</Pill><span className="text-sm font-semibold">{s.count}</span></div>
              <p className="text-xs">{peso(s.revenue, { compact: true })} total · {peso(s.rev90, { compact: true })} last 90d</p>
              <p className="text-[11px] text-muted-foreground leading-snug">{s.help}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title={`Call list: slipping & at-risk regulars (${cu.slipping.length})`} takeaway="Valuable customers buying later than their usual rhythm. A call or a delivery offer often brings them back.">
        <MiniTable head={['Customer', 'Segment', 'Last buy', 'Usual gap', 'Total', 'Trend 90d', 'Phone']} align={['l', 'l', 'r', 'r', 'r', 'r', 'l']}
          rows={cu.slipping.slice(0, 20).map((c) => [
            <Link key={c.customer_id} href={`/customers/${c.customer_id}`} className="hover:underline">{c.name}</Link>,
            <Pill key="s" tone={SEG_TONE[c.segment]}>{c.segment}</Pill>,
            `${c.recencyDays}d ago`, c.cadenceDays ? `~${Math.round(c.cadenceDays)}d` : '—', peso(c.revenue),
            c.trendPct == null ? '—' : `${c.trendPct > 0 ? '+' : ''}${c.trendPct.toFixed(0)}%`, c.phone ?? '',
          ])} empty="Nobody is slipping right now." />
      </Panel>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Top 20 customers">
          <MiniTable head={['Customer', 'Segment', 'Revenue', 'Share', 'Profit', 'Buys']}
            rows={cu.top.map((c) => [<Link key={c.customer_id} href={`/customers/${c.customer_id}`} className="hover:underline">{c.name}</Link>, <Pill key="s" tone={SEG_TONE[c.segment]}>{c.segment}</Pill>, peso(c.revenue), pctText(c.sharePct), peso(c.profit), num(c.buy_days)])} />
        </Panel>
        <div className="space-y-4">
          <Panel title="Receivables aging (utang)" takeaway={over60 > 0 ? `${peso(over60)} is over 60 days old. Old utang is the hardest to collect.` : 'All utang is under 60 days.'}>
            <MiniTable head={['Age', 'Customers', 'Amount']} rows={[...cu.ar.buckets.map((x) => [x.label, num(x.customers), peso(x.amount)]), ...(cu.ar.walkinAr > 0 ? [['Walk-in (unnamed)', '—', peso(cu.ar.walkinAr)]] : [])]} />
          </Panel>
          <Panel title="Biggest balances">
            <MiniTable head={['Customer', 'Owes', 'Oldest', 'Limit']}
              rows={cu.ar.debtors.slice(0, 10).map((c) => [<Link key={c.customer_id} href={`/customers/${c.customer_id}`} className="hover:underline">{c.name}</Link>, peso(c.open_ar), c.arAgeDays != null ? `${c.arAgeDays}d` : '—', c.credit_limit > 0 ? <span key="l" className={c.overLimit ? 'text-red-600' : ''}>{peso(c.credit_limit)}</span> : '—'])} empty="No unpaid balances." />
          </Panel>
        </div>
      </div>

      <Panel title="Retention by first-purchase month" takeaway="% of each month's new customers who bought again N months later.">
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead><tr className="text-muted-foreground"><th className="text-left pr-2 py-1">Cohort</th><th className="pr-2">New</th>{Array.from({ length: 11 }, (_, i) => <th key={i} className="px-1 font-normal">+{i + 1}</th>)}</tr></thead>
            <tbody>
              {cu.cohorts.map((c) => (
                <tr key={c.cohort}>
                  <td className="pr-2 py-0.5 whitespace-nowrap">{monthName(c.cohort)}</td>
                  <td className="pr-2 text-center">{c.size}</td>
                  {c.retention.map((r, i) => (
                    <td key={i} className="px-0.5">
                      {r == null ? null : <div className="w-9 rounded text-center py-0.5" style={{ background: `rgba(22,163,74,${0.08 + (r / 100) * 0.8})`, color: r > 50 ? 'white' : undefined }}>{r.toFixed(0)}%</div>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
