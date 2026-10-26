'use client'

import { Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DAY_SHORT, formatHour, formatSlot, manilaToday, type BestTimes } from '@/lib/marketing/best-times'

const CONFIDENCE_STYLE = {
  low: 'bg-amber-50 text-amber-800 border-amber-200',
  medium: 'bg-sky-50 text-sky-700 border-sky-200',
  high: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

const HOURS = Array.from({ length: 24 }, (_, h) => h)

export function BestTimesHeatmap({ best }: { best: BestTimes }) {
  const today = manilaToday().day
  const todaySlots = best.topSlots[today]

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 flex-wrap">
          <Clock className="w-4 h-4" /> Best times to post (Manila time)
          <Badge variant="outline" className={CONFIDENCE_STYLE[best.confidence]}>{best.confidence} confidence</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md bg-slate-900 text-white px-3 py-2 text-sm">
          <span className="text-[#ffc107] font-semibold">Today:</span>{' '}
          {todaySlots.map((s) => formatHour(s.hour)).join(' · ')}
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-[36px_repeat(24,minmax(0,1fr))] gap-px text-[9px] text-slate-400 mb-0.5">
              <span />
              {HOURS.map((h) => <span key={h} className="text-center">{h % 3 === 0 ? (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`) : ''}</span>)}
            </div>
            {best.grid.map((row, day) => (
              <div key={day} className="grid grid-cols-[36px_repeat(24,minmax(0,1fr))] gap-px mb-px">
                <span className={`text-[11px] ${day === today ? 'font-bold text-slate-900' : 'text-slate-500'}`}>{DAY_SHORT[day]}</span>
                {row.map((score, hour) => {
                  const top = best.topSlots[day].some((s) => s.hour === hour)
                  return (
                    <div
                      key={hour}
                      title={`${formatSlot(day, hour)} — ${(score * 100).toFixed(0)}`}
                      className={`h-5 rounded-sm ${top ? 'ring-1 ring-slate-900' : ''}`}
                      style={{ backgroundColor: `rgba(37, 99, 235, ${0.06 + score * 0.9})` }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-slate-500">
          Based on {best.postCount} post{best.postCount === 1 ? '' : 's'}, {best.sessionCount} website session{best.sessionCount === 1 ? '' : 's'} and {best.adImpressions.toLocaleString()} ad impressions by hour.
          {' '}Mix: {Math.round(best.weights.posts * 100)}% your post results, {Math.round(best.weights.site * 100)}% website visits, {Math.round(best.weights.ads * 100)}% ad responses by hour,
          {' '}{Math.round(best.weights.assumption * 100)}% starting assumption (local lunch and evening peaks), which fades as you import more data.
          Outlined cells are each day&apos;s top 3.
        </p>
      </CardContent>
    </Card>
  )
}
