'use client'

import { BarChart3 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatSlot, manilaDayHour } from '@/lib/marketing/best-times'
import { engagementRate, summarizeAds, type InsightsData } from '@/lib/marketing/insights-data'

const pct = (n: number | null) => (n == null ? '—' : `${(n * 100).toFixed(1)}%`)

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border px-2.5 py-2" title={hint}>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-800">{value}</p>
    </div>
  )
}
const peso = (n: number | null) => (n == null ? '—' : `₱${n.toFixed(2)}`)

export function InsightsPerformance({ data }: { data: InsightsData }) {
  const posts = [...data.posts]
    .map((p) => ({ p, rate: engagementRate(p) }))
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1))
  const ads = summarizeAds(data).sort((a, b) => a.resultType.localeCompare(b.resultType) || (a.costPerResult ?? Infinity) - (b.costPerResult ?? Infinity))
  const totals = ads.length
    ? (() => {
        const spend = ads.reduce((s, a) => s + a.spend, 0)
        const impressions = ads.reduce((s, a) => s + a.impressions, 0)
        return {
          spend,
          impressions,
          reach: Math.max(...ads.map((a) => a.reach)),
          clicks: ads.reduce((s, a) => s + a.link_clicks, 0),
          cpm: impressions ? (spend / impressions) * 1000 : null,
        }
      })()
    : null

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
          <p className="text-xs font-medium text-slate-600 mb-1.5">Ads ({ads.length})</p>
          {ads.length === 0 ? (
            <p className="text-xs text-slate-400">No ad results imported yet.</p>
          ) : (
            <>
              {totals && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-2">
                  <Stat label="Spend" value={peso(totals.spend)} />
                  <Stat label="People reached" value={totals.reach.toLocaleString()} hint="largest reach of any single ad" />
                  <Stat label="Impressions" value={totals.impressions.toLocaleString()} />
                  <Stat label="Avg CPM" value={peso(totals.cpm)} hint="cost per 1,000 impressions" />
                  <Stat label="Link clicks" value={totals.clicks.toLocaleString()} />
                </div>
              )}
              <div className="overflow-x-auto border rounded-md">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="text-left px-2 py-1.5 font-medium">Ad / concept</th>
                      <th className="text-left px-2 py-1.5 font-medium">Goal</th>
                      <th className="text-right px-2 py-1.5 font-medium">Results</th>
                      <th className="text-right px-2 py-1.5 font-medium">Cost / result</th>
                      <th className="text-right px-2 py-1.5 font-medium">Reach</th>
                      <th className="text-right px-2 py-1.5 font-medium">Impressions</th>
                      <th className="text-right px-2 py-1.5 font-medium" title="Average times each person saw it">Freq.</th>
                      <th className="text-right px-2 py-1.5 font-medium" title="Cost per 1,000 impressions">CPM</th>
                      <th className="text-right px-2 py-1.5 font-medium" title="Link clicks ÷ impressions">CTR</th>
                      <th className="text-right px-2 py-1.5 font-medium">Spend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ads.map((a) => (
                      <tr key={a.ad_name} className="border-t">
                        <td className="px-2 py-1.5">
                          <span className="font-mono">{a.ad_name}</span>
                          {a.creativeWarning && (
                            <span
                              className="ml-1.5 inline-block rounded bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-medium"
                              title="Meta treats this creative as too similar to others or worn out. Replace it with one in a different style and format."
                            >
                              {a.deliveryStatus}
                            </span>
                          )}
                          {(a.audience || a.campaign_name) && (
                            <span className="block text-[10px] text-slate-400">
                              {[a.campaign_name, a.audience, a.format].filter(Boolean).join(' · ')} · ~{a.days} days
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">{a.resultType}</td>
                        <td className="px-2 py-1.5 text-right">{a.results}</td>
                        <td className="px-2 py-1.5 text-right font-medium">{peso(a.costPerResult)}</td>
                        <td className="px-2 py-1.5 text-right">{a.reach.toLocaleString()}</td>
                        <td className="px-2 py-1.5 text-right">{a.impressions.toLocaleString()}</td>
                        <td className={`px-2 py-1.5 text-right ${a.frequency != null && a.frequency > 3 ? 'text-amber-700 font-medium' : ''}`}>
                          {a.frequency != null ? a.frequency.toFixed(1) : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right">{peso(a.cpm)}</td>
                        <td className="px-2 py-1.5 text-right">{pct(a.ctr)}</td>
                        <td className="px-2 py-1.5 text-right">{peso(a.spend)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Compare cost per result only between ads with the same goal (calls, follows and clicks are different). A frequency above 3 means the same people see it often, so it&apos;s time to refresh the creative.
              </p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
