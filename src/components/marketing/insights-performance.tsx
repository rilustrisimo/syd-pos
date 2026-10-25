'use client'

import { BarChart3 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatSlot, manilaDayHour } from '@/lib/marketing/best-times'
import { engagementRate, summarizeAds, type InsightsData } from '@/lib/marketing/insights-data'

const pct = (n: number | null) => (n == null ? '—' : `${(n * 100).toFixed(1)}%`)
const peso = (n: number | null) => (n == null ? '—' : `₱${n.toFixed(2)}`)

export function InsightsPerformance({ data }: { data: InsightsData }) {
  const posts = [...data.posts]
    .map((p) => ({ p, rate: engagementRate(p) }))
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1))
  const ads = summarizeAds(data).sort((a, b) => (a.costPerResult ?? Infinity) - (b.costPerResult ?? Infinity))

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2"><BarChart3 className="w-4 h-4" /> What&apos;s performing (last 90 days)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="text-xs font-medium text-slate-600 mb-1.5">Posts by engagement rate ({posts.length})</p>
          {posts.length === 0 ? (
            <p className="text-xs text-slate-400">No post insights imported yet.</p>
          ) : (
            <div className="overflow-x-auto max-h-[320px] overflow-y-auto border rounded-md">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium">Posted</th>
                    <th className="text-left px-2 py-1.5 font-medium">Type</th>
                    <th className="text-left px-2 py-1.5 font-medium">Post</th>
                    <th className="text-right px-2 py-1.5 font-medium">Reach</th>
                    <th className="text-right px-2 py-1.5 font-medium">Eng. rate</th>
                    <th className="text-right px-2 py-1.5 font-medium">Follows</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.slice(0, 50).map(({ p, rate }) => {
                    const { day, hour } = manilaDayHour(p.published_at)
                    return (
                      <tr key={p.id} className="border-t">
                        <td className="px-2 py-1.5 whitespace-nowrap">{p.published_at.slice(0, 10)} · {formatSlot(day, hour)}</td>
                        <td className="px-2 py-1.5 capitalize">{p.platform === 'instagram' ? 'IG ' : 'FB '}{p.post_type ?? ''}</td>
                        <td className="px-2 py-1.5 max-w-[260px] truncate" title={p.text ?? ''}>
                          {p.permalink ? <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="hover:underline">{p.text || '(no text)'}</a> : (p.text || '(no text)')}
                          {p.concept_code && <span className="ml-1 text-slate-400 font-mono">[{p.concept_code}]</span>}
                        </td>
                        <td className="px-2 py-1.5 text-right">{p.reach?.toLocaleString() ?? '—'}</td>
                        <td className="px-2 py-1.5 text-right font-medium">{pct(rate)}</td>
                        <td className="px-2 py-1.5 text-right">{p.follows ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-medium text-slate-600 mb-1.5">Ads by cost per result ({ads.length})</p>
          {ads.length === 0 ? (
            <p className="text-xs text-slate-400">No ad results imported yet.</p>
          ) : (
            <div className="overflow-x-auto border rounded-md">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium">Ad / concept</th>
                    <th className="text-left px-2 py-1.5 font-medium">Audience</th>
                    <th className="text-right px-2 py-1.5 font-medium">Spend</th>
                    <th className="text-right px-2 py-1.5 font-medium">Results</th>
                    <th className="text-right px-2 py-1.5 font-medium">Cost / result</th>
                    <th className="text-right px-2 py-1.5 font-medium">Link clicks</th>
                  </tr>
                </thead>
                <tbody>
                  {ads.map((a) => (
                    <tr key={a.ad_name} className="border-t">
                      <td className="px-2 py-1.5 font-mono">{a.ad_name}</td>
                      <td className="px-2 py-1.5">{a.audience ?? '—'}{a.format ? ` · ${a.format}` : ''}</td>
                      <td className="px-2 py-1.5 text-right">{peso(a.spend)}</td>
                      <td className="px-2 py-1.5 text-right">{a.results}</td>
                      <td className="px-2 py-1.5 text-right font-medium">{peso(a.costPerResult)}</td>
                      <td className="px-2 py-1.5 text-right">{a.link_clicks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
