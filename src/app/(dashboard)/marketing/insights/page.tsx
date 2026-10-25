'use client'

import { useMemo } from 'react'
import { LineChart, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { InsightsImporter } from '@/components/marketing/insights-importer'
import { BestTimesHeatmap } from '@/components/marketing/best-times-heatmap'
import { InsightsPerformance } from '@/components/marketing/insights-performance'
import { useAnalyzeInsights, useMarketingInsights } from '@/hooks/useMarketingInsights'
import { bestTimesFrom } from '@/lib/marketing/insights-data'

export default function MarketingInsightsPage() {
  const { data, isLoading, error } = useMarketingInsights()
  const analyze = useAnalyzeInsights()
  const best = useMemo(() => (data ? bestTimesFrom(data) : null), [data])
  const analysis = analyze.data?.analysis

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <LineChart className="w-6 h-6" />
          Marketing Insights
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Import Meta and Google Analytics results, see when your people are active, and let AI read what&apos;s working
        </p>
      </div>

      <InsightsImporter />

      {isLoading && <div className="py-10 text-center text-sm text-slate-400">Loading insights…</div>}
      {error && <p className="text-sm text-red-600">{error instanceof Error ? error.message : 'Failed to load insights'}</p>}

      {data && best && (
        <>
          <BestTimesHeatmap best={best} />

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center justify-between gap-2 flex-wrap">
                <span className="flex items-center gap-2"><Sparkles className="w-4 h-4" /> AI analysis</span>
                <Button
                  size="sm"
                  onClick={() => analyze.mutate(undefined, { onError: (e) => toast.error(e.message) })}
                  disabled={analyze.isPending}
                >
                  {analyze.isPending ? 'Analyzing…' : analysis ? 'Analyze again' : 'Analyze with AI'}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!analysis ? (
                <p className="text-sm text-slate-500">
                  Gemini reads your imported results like a social media manager: what&apos;s working, what to stop, what to test next, when to post, and how to split your ad budget.
                </p>
              ) : (
                <div className="space-y-3 text-sm">
                  <p className="text-slate-700">{analysis.summary}</p>
                  <div className="grid gap-3 md:grid-cols-3">
                    <AnalysisList title="Working" items={analysis.working} tone="text-emerald-700" />
                    <AnalysisList title="Not working" items={analysis.not_working} tone="text-red-700" />
                    <AnalysisList title="Test next" items={analysis.next_tests} tone="text-blue-700" />
                  </div>
                  <p><span className="font-medium">When to post:</span> {analysis.posting_times}</p>
                  <p><span className="font-medium">Ad budget:</span> {analysis.budget_advice}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <InsightsPerformance data={data} />
        </>
      )}
    </div>
  )
}

function AnalysisList({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className={`text-xs font-semibold mb-1.5 ${tone}`}>{title}</p>
      {items.length ? (
        <ul className="list-disc pl-4 space-y-1 text-xs text-slate-700">
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : (
        <p className="text-xs text-slate-400">—</p>
      )}
    </div>
  )
}
