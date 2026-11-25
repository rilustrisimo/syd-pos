'use client'

// PO page (admins only): which investors this PO's received stock is tagged
// to — a sidebar card grouped by investor, and small tags under each line.

import Link from 'next/link'
import { PiggyBank } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils/formatting'
import type { POInvestmentShare } from '@/lib/supabase/queries/investments'

const qtyText = (n: number) => n.toLocaleString('en-PH', { maximumFractionDigits: 2 })

function sharesForLine(shares: POInvestmentShare[], lineId: string, productId: string) {
  return shares.filter((s) => (s.po_line_id ? s.po_line_id === lineId : s.product?.id === productId))
}

/** Under a PO line: "Juan Dela Cruz · 50" per investor tagged on it. */
export function LineInvestorTags({ shares, lineId, productId }: { shares: POInvestmentShare[]; lineId: string; productId: string }) {
  const mine = sharesForLine(shares, lineId, productId)
  if (!mine.length) return null
  // One tag per investor even if they were tagged more than once.
  const byInvestor = new Map<string, { name: string; id: string; tagged: number; unsold: number }>()
  for (const s of mine) {
    if (!s.investment) continue
    const cur = byInvestor.get(s.investment.id) ?? { name: s.investment.investor_name, id: s.investment.id, tagged: 0, unsold: 0 }
    cur.tagged += s.qty_tagged
    cur.unsold += s.qty_remaining
    byInvestor.set(s.investment.id, cur)
  }
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {[...byInvestor.values()].map((inv) => (
        <Link
          key={inv.id}
          href={`/investments/${inv.id}`}
          className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] text-violet-700 hover:bg-violet-100"
          title={`${qtyText(inv.unsold)} of ${qtyText(inv.tagged)} still unsold`}
        >
          <PiggyBank className="h-3 w-3" /> {inv.name} · {qtyText(inv.tagged)}
        </Link>
      ))}
    </div>
  )
}

/** Sidebar card: each investor with the products, quantities and cost tagged to them from this PO. */
export function POInvestorsCard({ shares, onTag }: { shares: POInvestmentShare[]; onTag: () => void }) {
  const groups = new Map<string, { inv: NonNullable<POInvestmentShare['investment']>; rows: POInvestmentShare[] }>()
  for (const s of shares) {
    if (!s.investment) continue
    const g = groups.get(s.investment.id) ?? { inv: s.investment, rows: [] }
    g.rows.push(s)
    groups.set(s.investment.id, g)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2"><PiggyBank className="h-4 w-4 text-violet-600" /> Investors</CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-4">
        {groups.size === 0 ? (
          <div className="space-y-2">
            <p className="text-muted-foreground">Not tagged to any investor — this stock is store-owned.</p>
            <Button size="sm" variant="outline" onClick={onTag}>Tag to Investment</Button>
          </div>
        ) : (
          [...groups.values()].map(({ inv, rows }) => {
            const cost = rows.reduce((a, r) => a + r.qty_tagged * r.unit_cost, 0)
            return (
              <div key={inv.id} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <Link href={`/investments/${inv.id}`} className="font-semibold hover:underline">{inv.investor_name}</Link>
                  <span className="text-xs text-muted-foreground font-mono">{inv.code}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {inv.profit_share_pct}% of profit{inv.status === 'closed' ? ' · closed' : ''}
                </p>
                <ul className="space-y-1">
                  {rows.map((r) => (
                    <li key={r.id} className="flex justify-between gap-2">
                      <span className="truncate">{r.product?.name ?? 'Product'}</span>
                      <span className="font-mono whitespace-nowrap">
                        {qtyText(r.qty_tagged)}
                        {r.qty_remaining < r.qty_tagged && (
                          <span className="text-muted-foreground"> ({qtyText(r.qty_remaining)} unsold)</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-between border-t pt-1.5 text-xs">
                  <span className="text-muted-foreground">Tagged cost</span>
                  <span className="font-mono">{formatCurrency(cost)}</span>
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
