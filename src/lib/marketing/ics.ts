// Calendar (.ics) files for the marketing routine and planned posts —
// imported once into Google Calendar, Apple Calendar or Outlook, no
// account connection needed. Times are Asia/Manila (UTC+8, no DST).

import { manilaToday } from '@/lib/marketing/best-times'

export interface IcsEvent {
  uid: string
  title: string
  /** YYYY-MM-DD, Manila. */
  date: string
  hour: number
  minute?: number
  durationMinutes?: number
  description?: string
  url?: string
  /** e.g. "FREQ=DAILY" or "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO" */
  rrule?: string
  /** Minutes before the start to alert (0 = at start). */
  alarmMinutesBefore?: number
}

const APP_URL = 'https://app.sydconstruct.com'

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

// RFC 5545: lines longer than 75 octets are folded with CRLF + space.
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const parts: string[] = []
  let current = ''
  let size = 0
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length
    if (size + n > (parts.length ? 74 : 75)) {
      parts.push(current)
      current = ''
      size = 0
    }
    current += ch
    size += n
  }
  parts.push(current)
  return parts.join('\r\n ')
}

const pad = (n: number) => String(n).padStart(2, '0')
const localStamp = (date: string, hour: number, minute = 0) => `${date.replace(/-/g, '')}T${pad(hour)}${pad(minute)}00`

export function buildIcs(calendarName: string, events: IcsEvent[]): string {
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SYD Construction Supplies//syd-pos marketing//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    'X-WR-TIMEZONE:Asia/Manila',
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Manila',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0800',
    'TZOFFSETTO:+0800',
    'TZNAME:PST',
    'END:STANDARD',
    'END:VTIMEZONE',
  ]
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}@sydconstruct.com`,
      `DTSTAMP:${now}`,
      `DTSTART;TZID=Asia/Manila:${localStamp(e.date, e.hour, e.minute)}`,
      `DURATION:PT${e.durationMinutes ?? 30}M`,
      `SUMMARY:${escapeText(e.title)}`,
    )
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`)
    if (e.url) lines.push(`URL:${e.url}`)
    if (e.rrule) lines.push(`RRULE:${e.rrule}`)
    if (e.alarmMinutesBefore != null) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeText(e.title)}`,
        `TRIGGER:-PT${e.alarmMinutesBefore}M`,
        'END:VALARM',
      )
    }
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

export function downloadIcs(filename: string, ics: string) {
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Next date (YYYY-MM-DD, Manila) falling on `weekday` (0 = Sunday), today included. */
function nextWeekday(weekday: number): string {
  const { date, day } = manilaToday()
  const offset = (weekday - day + 7) % 7
  return new Date(Date.parse(`${date}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10)
}

/**
 * The weekly marketing routine, as repeating events: one Monday session
 * (import data → plan the week → make every creative → schedule all of
 * it in Meta Business Suite), plus the ad refresh every other Monday.
 */
export function routineEvents(): IcsEvent[] {
  const monday = nextWeekday(1)
  return [
    {
      uid: 'syd-routine-weekly-import',
      title: 'SYD: import Meta + GA4 data into Insights',
      date: monday,
      hour: 9,
      durationMinutes: 20,
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      alarmMinutesBefore: 0,
      url: `${APP_URL}/marketing/insights`,
      description: [
        'Export and import on syd-pos → Marketing → Insights:',
        '1. Meta Business Suite → Insights → Content (last 28 days) → Export CSV.',
        '2. Ads Manager → Ads tab (last 7 days) → Export table data. Then again with Breakdown → By time → Time of day.',
        '3. GA4 → Explore → Free form (Day of week name × Hour, Sessions) → Export CSV.',
        '4. Click Analyze with AI and read the recommendations.',
        `${APP_URL}/marketing/insights`,
      ].join('\n'),
    },
    {
      uid: 'syd-routine-weekly-batch',
      title: "SYD: plan, create & schedule this week's posts",
      date: monday,
      hour: 9,
      minute: 30,
      durationMinutes: 120,
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      alarmMinutesBefore: 0,
      url: `${APP_URL}/marketing`,
      description: [
        '1. syd-pos → Marketing → Feed → Plan this week → tick the posts → Add to Feed.',
        '2. Make every creative in one go: Copy Canva prompt for images/carousels, Build Reel for reels.',
        '3. Meta Business Suite → Planner: schedule all 7 posts at their suggested times, with the caption, hashtags and tags from each card.',
        '4. Optional: Calendar reminders → "This week\'s posts" to see the week in your calendar.',
        `${APP_URL}/marketing`,
      ].join('\n'),
    },
    {
      uid: 'syd-routine-biweekly-concepts',
      title: 'SYD: refresh ad concepts',
      date: monday,
      hour: 11,
      minute: 30,
      durationMinutes: 30,
      rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO',
      alarmMinutesBefore: 0,
      url: `${APP_URL}/marketing/ideas`,
      description: [
        '1. Ads Manager: pause the 2-3 concepts with the highest cost per result (that spent at least about ₱150), and any marked "Creative limited" or "Creative fatigue".',
        '2. syd-pos → Marketing → Ideas → Generate ad concepts → add 2-3 new ones in different creative styles.',
        '3. Build them and add them to the same ad set. Name each ad with its concept code and use Copy ad link.',
        `${APP_URL}/marketing/ideas`,
      ].join('\n'),
    },
  ]
}

/** "Tue 8:00 PM" → { hour: 20, minute: 0 }. */
export function parseBestTime(value: string | null | undefined): { hour: number; minute: number } | null {
  const m = value?.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (!m) return null
  let hour = Number(m[1]) % 12
  if (m[3].toUpperCase() === 'PM') hour += 12
  return { hour, minute: Number(m[2]) }
}

export interface PlannedPostReminder {
  id: string
  title: string
  planned_for: string
  best_time: string | null
  format: string
  caption?: string | null
  hashtags?: string | null
  tags?: string | null
}

/**
 * The week's planned posts as calendar entries at their go-live times —
 * an overview only (no alerts), since everything is made and scheduled in
 * Meta during the Monday session. The notes keep the caption and tags.
 */
export function plannedPostEvents(posts: PlannedPostReminder[]): IcsEvent[] {
  return posts.map((p) => {
    const live = parseBestTime(p.best_time) ?? { hour: 19, minute: 0 }
    return {
      uid: `syd-post-${p.id}`,
      title: `SYD post goes live: ${p.title}`,
      date: p.planned_for,
      hour: live.hour,
      minute: live.minute,
      durationMinutes: 15,
      url: `${APP_URL}/marketing`,
      description: [
        `${p.format.toUpperCase()} — should be scheduled in Meta Business Suite for ${p.best_time ?? 'this time'}.`,
        p.caption ? `\nCaption:\n${p.caption}` : '',
        p.hashtags ? `\n${p.hashtags}` : '',
        p.tags ? `\nTag: ${p.tags}` : '',
        `\nCreative and full details: ${APP_URL}/marketing`,
      ].filter(Boolean).join('\n'),
    }
  })
}
