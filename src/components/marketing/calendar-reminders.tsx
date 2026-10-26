'use client'

import { CalendarPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useContentSuggestions, type ContentSuggestion } from '@/hooks/useContentSuggestions'
import { manilaToday } from '@/lib/marketing/best-times'
import { buildIcs, downloadIcs, plannedPostEvents, routineEvents, type PlannedPostReminder } from '@/lib/marketing/ics'

export function toPostReminder(s: ContentSuggestion): PlannedPostReminder | null {
  const idea = s.source_idea
  if (!idea?.planned_for) return null
  return {
    id: s.id,
    title: idea.title,
    planned_for: idea.planned_for,
    best_time: idea.best_time,
    format: s.format ?? 'post',
    caption: s.caption_final ?? s.caption_draft,
    tags: idea.tags,
  }
}

/**
 * Calendar files (.ics) with the marketing routine and the planned posts,
 * for Google Calendar / Apple Calendar / Outlook — no account connection.
 */
export function CalendarReminders() {
  // All statuses (the Feed list itself is filtered by its tab).
  const { data: suggestions = [] } = useContentSuggestions()
  const today = manilaToday().date
  const upcoming = suggestions
    .filter((s) => s.status !== 'rejected')
    .map(toPostReminder)
    .filter((p): p is PlannedPostReminder => !!p && p.planned_for >= today)
    .sort((a, b) => a.planned_for.localeCompare(b.planned_for))

  function downloadRoutine() {
    downloadIcs('syd-marketing-routine.ics', buildIcs('SYD marketing routine', routineEvents()))
    toast.success('Routine reminders downloaded. Open the file to add them to your calendar.')
  }

  function downloadPlanned() {
    downloadIcs(`syd-planned-posts-${today}.ics`, buildIcs('SYD planned posts', plannedPostEvents(upcoming)))
    toast.success(`${upcoming.length} planned post${upcoming.length === 1 ? '' : 's'} downloaded. Open the file to add them.`)
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2"><CalendarPlus className="w-4 h-4" /> Calendar reminders</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={downloadRoutine}>
            <CalendarPlus className="w-4 h-4" /> Routine reminders
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={downloadPlanned} disabled={!upcoming.length}>
            <CalendarPlus className="w-4 h-4" /> This week&apos;s posts ({upcoming.length})
          </Button>
        </div>
        <p className="text-[11px] text-slate-500">
          <span className="font-medium">Routine</span> (add once) — one weekly session every Monday: 9:00 import Meta + GA4 data · 9:30–11:30 plan the week, make every creative and schedule all posts in Meta Business Suite · every other Monday 11:30 refresh ad concepts.{' '}
          <span className="font-medium">This week&apos;s posts</span> (optional): shows each planned post in your calendar at its go-live time, no alerts, with the caption in the notes.
        </p>
        <p className="text-[11px] text-slate-400">
          Phone: open the downloaded file to add it. Google Calendar on a computer: Settings → Import &amp; export → Import.
        </p>
      </CardContent>
    </Card>
  )
}
