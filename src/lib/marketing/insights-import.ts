// Parses CSV exports from Meta Business Suite (post insights), Meta Ads
// Manager (ad results) and Google Analytics 4 (reports) into rows for the
// social_post_metrics / ad_metrics / ga_metrics tables.
//
// Meta renames export columns fairly often, so each field has a list of
// known header aliases for auto-mapping, and the Insights page shows a
// column-mapping preview the user can correct before importing.
// Pure functions (no browser/server APIs), shared by the page and route.

export type InsightSource = 'meta_posts' | 'meta_ads' | 'meta_ads_hourly' | 'ga4'

export interface FieldSpec {
  key: string
  label: string
  required?: boolean
  aliases: string[]
}

export const SOURCE_LABELS: Record<InsightSource, string> = {
  meta_posts: 'Meta Business Suite — post insights',
  meta_ads: 'Meta Ads Manager — ad results',
  meta_ads_hourly: 'Meta Ads Manager — results by time of day',
  ga4: 'Google Analytics 4 — report',
}

export const SOURCE_FIELDS: Record<InsightSource, FieldSpec[]> = {
  meta_posts: [
    { key: 'external_id', label: 'Post ID', required: true, aliases: ['post id', 'media id', 'id', 'content id'] },
    { key: 'published_at', label: 'Publish time', required: true, aliases: ['publish time', 'published', 'publish date', 'date', 'post time', 'created time'] },
    { key: 'platform', label: 'Platform', aliases: ['platform', 'account', 'page name', 'account name', 'channel'] },
    { key: 'post_type', label: 'Post type', aliases: ['post type', 'type', 'media type', 'content type'] },
    { key: 'text', label: 'Description / caption', aliases: ['description', 'caption', 'title', 'message', 'post message'] },
    { key: 'permalink', label: 'Permalink', aliases: ['permalink', 'link', 'post link', 'url'] },
    { key: 'reach', label: 'Reach', aliases: ['reach', 'accounts reached', 'post reach'] },
    { key: 'impressions', label: 'Impressions / views', aliases: ['impressions', 'views', 'post impressions'] },
    { key: 'reactions', label: 'Reactions / likes', aliases: ['reactions', 'likes', 'reactions, comments and shares'] },
    { key: 'comments', label: 'Comments', aliases: ['comments'] },
    { key: 'shares', label: 'Shares', aliases: ['shares'] },
    { key: 'saves', label: 'Saves', aliases: ['saves', 'saved'] },
    { key: 'link_clicks', label: 'Link clicks', aliases: ['link clicks', 'clicks', 'total clicks'] },
    { key: 'video_views', label: 'Video / reel plays', aliases: ['3-second video views', 'video views', 'plays', 'reel plays'] },
    { key: 'follows', label: 'Follows', aliases: ['follows', 'new follows', 'follows from post'] },
  ],
  meta_ads: [
    { key: 'ad_name', label: 'Ad name', required: true, aliases: ['ad name', 'ad'] },
    { key: 'adset_name', label: 'Ad set name', aliases: ['ad set name', 'ad set'] },
    { key: 'campaign_name', label: 'Campaign name', aliases: ['campaign name', 'campaign'] },
    { key: 'period_start', label: 'Reporting starts', required: true, aliases: ['reporting starts', 'reporting start', 'day', 'date', 'starts'] },
    { key: 'period_end', label: 'Reporting ends', aliases: ['reporting ends', 'reporting end', 'ends'] },
    { key: 'impressions', label: 'Impressions', aliases: ['impressions'] },
    { key: 'reach', label: 'Reach', aliases: ['reach'] },
    { key: 'link_clicks', label: 'Link clicks', aliases: ['link clicks', 'clicks (all)', 'clicks'] },
    { key: 'results', label: 'Results', aliases: ['results'] },
    { key: 'result_type', label: 'Result indicator', aliases: ['result indicator', 'result type'] },
    { key: 'spend', label: 'Amount spent', aliases: ['amount spent (php)', 'amount spent', 'spend', 'cost'] },
    { key: 'follows', label: 'Follows / page likes', aliases: ['follows or likes', 'page likes', 'follows', 'instagram follows', 'facebook likes'] },
    { key: 'delivery_status', label: 'Delivery (status)', aliases: ['delivery', 'delivery status', 'ad delivery'] },
  ],
  meta_ads_hourly: [
    { key: 'time_of_day', label: 'Time of day', required: true, aliases: ["time of day (viewer's time zone)", 'time of day (ad account time zone)', 'time of day', 'hour of day'] },
    { key: 'period_start', label: 'Reporting starts', required: true, aliases: ['reporting starts', 'reporting start', 'day', 'date', 'starts'] },
    { key: 'period_end', label: 'Reporting ends', aliases: ['reporting ends', 'reporting end', 'ends'] },
    { key: 'impressions', label: 'Impressions', required: true, aliases: ['impressions'] },
    { key: 'results', label: 'Results', aliases: ['results'] },
    { key: 'link_clicks', label: 'Link clicks', aliases: ['link clicks', 'clicks (all)', 'clicks'] },
    { key: 'spend', label: 'Amount spent', aliases: ['amount spent (php)', 'amount spent', 'spend', 'cost'] },
  ],
  ga4: [
    { key: 'day_of_week', label: 'Day of week', aliases: ['day of week', 'day of week name', 'dayofweek', 'day'] },
    { key: 'hour', label: 'Hour', aliases: ['hour', 'hour of day'] },
    { key: 'utm_content', label: 'Session manual ad content', aliases: ['session manual ad content', 'manual ad content', 'ad content', 'utm content', 'session manual ad content (utm_content)'] },
    { key: 'source_medium', label: 'Session source / medium', aliases: ['session source / medium', 'source / medium', 'session source/medium'] },
    { key: 'sessions', label: 'Sessions', required: true, aliases: ['sessions'] },
    { key: 'users', label: 'Active users', aliases: ['active users', 'users', 'total users'] },
    { key: 'engaged_sessions', label: 'Engaged sessions', aliases: ['engaged sessions'] },
    { key: 'key_events', label: 'Key events', aliases: ['key events', 'conversions', 'generate_lead', 'key events (generate_lead)'] },
  ],
}

export interface ParsedCsv {
  headers: string[]
  rows: string[][]
  /** GA4 puts the report date range in its "#" comment lines. */
  periodStart: string | null
  periodEnd: string | null
}

// RFC4180-ish parser (quoted fields, doubled quotes, embedded newlines).
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const normalized = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i]
    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += char
      continue
    }
    if (char === '"') inQuotes = true
    else if (char === ',') { row.push(field); field = '' }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else field += char
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((f) => f.trim() !== ''))
}

function compactDate(value: string): string | null {
  const m = value.match(/(\d{4})(\d{2})(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

export function parseCsv(text: string): ParsedCsv {
  const all = parseCsvRows(text)
  let periodStart: string | null = null
  let periodEnd: string | null = null
  const data: string[][] = []
  for (const row of all) {
    const first = row[0]?.trim() ?? ''
    if (first.startsWith('#')) {
      const line = row.join(',')
      const start = line.match(/Start date:\s*(\d{8})/i)
      const end = line.match(/End date:\s*(\d{8})/i)
      if (start) periodStart = compactDate(start[1])
      if (end) periodEnd = compactDate(end[1])
      continue
    }
    data.push(row)
  }
  // GA4 exports can contain several tables separated by blank/comment
  // lines; keep the first one (header + rows with the same width), and
  // drop GA4's trailing "Grand total" style rows.
  const [headers = [], ...rest] = data
  const rows = rest.filter((r) => r.length >= Math.min(headers.length, 2) && !/^(grand )?total$/i.test(r[0]?.trim() ?? ''))
  return { headers: headers.map((h) => h.trim()), rows, periodStart, periodEnd }
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

export function detectSource(headers: string[]): InsightSource | null {
  const h = headers.map(norm)
  const has = (name: string) => h.some((x) => x === name || x.startsWith(`${name} `) || x.startsWith(`${name}(`))
  if (has('time of day') && (has('impressions') || has('amount spent'))) return 'meta_ads_hourly'
  if (has('ad name') && (has('amount spent') || has('reporting starts') || has('impressions'))) return 'meta_ads'
  if ((has('post id') || has('media id')) && (has('publish time') || has('reach') || has('permalink'))) return 'meta_posts'
  if (has('sessions') && (has('hour') || has('day of week') || has('session manual ad content') || has('active users'))) return 'ga4'
  return null
}

/** Maps each field to a column index (-1 = not mapped) using the aliases. */
export function autoMap(source: InsightSource, headers: string[]): Record<string, number> {
  const h = headers.map(norm)
  const mapping: Record<string, number> = {}
  const taken = new Set<number>()
  for (const field of SOURCE_FIELDS[source]) {
    let idx = -1
    for (const alias of field.aliases) {
      idx = h.findIndex((x, i) => !taken.has(i) && x === alias)
      if (idx !== -1) break
    }
    if (idx === -1) {
      for (const alias of field.aliases) {
        idx = h.findIndex((x, i) => !taken.has(i) && x.startsWith(alias))
        if (idx !== -1) break
      }
    }
    if (idx !== -1) taken.add(idx)
    mapping[field.key] = idx
  }
  return mapping
}

export function missingRequired(source: InsightSource, mapping: Record<string, number>): string[] {
  return SOURCE_FIELDS[source].filter((f) => f.required && (mapping[f.key] ?? -1) < 0).map((f) => f.label)
}

// ── Value parsing ──────────────────────────────────────────────

export function toInt(value: string | undefined): number | null {
  if (value == null) return null
  const cleaned = value.replace(/[,\s₱%]/g, '').replace(/^PHP/i, '')
  if (cleaned === '' || cleaned === '-' || /^n\/?a$/i.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? Math.round(n) : null
}

export function toNumber(value: string | undefined): number | null {
  if (value == null) return null
  const cleaned = value.replace(/[,\s₱]/g, '').replace(/^PHP/i, '')
  if (cleaned === '' || cleaned === '-') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

const MANILA_OFFSET = '+08:00'

/**
 * Meta exports post times as local wall-clock time without a zone; the
 * Business Suite account for this page is in Manila, so naive times are
 * read as Manila (UTC+8). Accepts "MM/DD/YYYY HH:mm", ISO, and
 * "YYYY-MM-DD HH:mm[:ss]". Returns an ISO string or null.
 */
export function parseManilaDateTime(value: string | undefined): string | null {
  if (!value) return null
  const v = value.trim()
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))) return new Date(v).toISOString()
  let m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i)
  if (m) {
    let hour = Number(m[4] ?? 0)
    if (m[7]) { const pm = m[7].toUpperCase() === 'PM'; if (pm && hour < 12) hour += 12; if (!pm && hour === 12) hour = 0 }
    const iso = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}T${String(hour).padStart(2, '0')}:${m[5] ?? '00'}:${m[6] ?? '00'}${MANILA_OFFSET}`
    return new Date(iso).toISOString()
  }
  m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/)
  if (m) {
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? '00'}:${m[5] ?? '00'}:${m[6] ?? '00'}${MANILA_OFFSET}`
    return new Date(iso).toISOString()
  }
  m = v.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00${MANILA_OFFSET}`).toISOString()
  return null
}

/** Date-only (YYYY-MM-DD) from any of the formats above. */
export function parseDateOnly(value: string | undefined): string | null {
  if (!value) return null
  const v = value.trim()
  const ymd = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`
  const compact = compactDate(v)
  if (compact && /^\d{8}$/.test(v)) return compact
  const mdy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`
  return null
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/** GA4 day of week: "0".."6" (Sunday = 0) or a day name. */
export function parseDayOfWeek(value: string | undefined): number | null {
  if (value == null) return null
  const v = value.trim().toLowerCase()
  if (/^[0-6]$/.test(v)) return Number(v)
  const idx = DAY_NAMES.findIndex((d) => d.startsWith(v.slice(0, 3)))
  return idx === -1 ? null : idx
}

function detectPlatform(value: string | undefined, permalink: string | undefined): 'facebook' | 'instagram' {
  const v = `${value ?? ''} ${permalink ?? ''}`.toLowerCase()
  return v.includes('instagram') ? 'instagram' : 'facebook'
}

/** Pulls a concept code out of a tagged sydconstruct.com link in the post text. */
export function extractConceptCode(text: string | undefined): string | null {
  const m = text?.match(/utm_content=([a-z0-9-]+)/i)
  return m ? m[1].toLowerCase() : null
}

// ── Row builders ───────────────────────────────────────────────

export interface BuildResult<T> {
  rows: T[]
  skipped: number
}

const get = (row: string[], mapping: Record<string, number>, key: string) => {
  const idx = mapping[key] ?? -1
  return idx >= 0 ? row[idx]?.trim() : undefined
}

export interface SocialPostRow {
  platform: 'facebook' | 'instagram'
  external_id: string
  published_at: string
  post_type: string | null
  text: string | null
  permalink: string | null
  reach: number | null
  impressions: number | null
  reactions: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  link_clicks: number | null
  video_views: number | null
  follows: number | null
  concept_code: string | null
}

export function buildSocialPostRows(parsed: ParsedCsv, mapping: Record<string, number>): BuildResult<SocialPostRow> {
  const rows: SocialPostRow[] = []
  let skipped = 0
  for (const r of parsed.rows) {
    const externalId = get(r, mapping, 'external_id')
    const publishedAt = parseManilaDateTime(get(r, mapping, 'published_at'))
    if (!externalId || !publishedAt) { skipped++; continue }
    const text = get(r, mapping, 'text') || null
    const permalink = get(r, mapping, 'permalink') || null
    rows.push({
      platform: detectPlatform(get(r, mapping, 'platform'), permalink ?? undefined),
      external_id: externalId,
      published_at: publishedAt,
      post_type: get(r, mapping, 'post_type') || null,
      text,
      permalink,
      reach: toInt(get(r, mapping, 'reach')),
      impressions: toInt(get(r, mapping, 'impressions')),
      reactions: toInt(get(r, mapping, 'reactions')),
      comments: toInt(get(r, mapping, 'comments')),
      shares: toInt(get(r, mapping, 'shares')),
      saves: toInt(get(r, mapping, 'saves')),
      link_clicks: toInt(get(r, mapping, 'link_clicks')),
      video_views: toInt(get(r, mapping, 'video_views')),
      follows: toInt(get(r, mapping, 'follows')),
      concept_code: extractConceptCode(text ?? undefined),
    })
  }
  return { rows, skipped }
}

export interface AdMetricRow {
  ad_name: string
  adset_name: string | null
  campaign_name: string | null
  period_start: string
  period_end: string
  impressions: number | null
  reach: number | null
  link_clicks: number | null
  results: number | null
  result_type: string | null
  spend: number | null
  follows: number | null
  delivery_status: string | null
}

export function buildAdRows(parsed: ParsedCsv, mapping: Record<string, number>): BuildResult<AdMetricRow> {
  const rows: AdMetricRow[] = []
  let skipped = 0
  for (const r of parsed.rows) {
    const adName = get(r, mapping, 'ad_name')
    const start = parseDateOnly(get(r, mapping, 'period_start'))
    if (!adName || !start) { skipped++; continue }
    rows.push({
      ad_name: adName,
      adset_name: get(r, mapping, 'adset_name') || null,
      campaign_name: get(r, mapping, 'campaign_name') || null,
      period_start: start,
      period_end: parseDateOnly(get(r, mapping, 'period_end')) ?? start,
      impressions: toInt(get(r, mapping, 'impressions')),
      reach: toInt(get(r, mapping, 'reach')),
      link_clicks: toInt(get(r, mapping, 'link_clicks')),
      results: toNumber(get(r, mapping, 'results')),
      result_type: get(r, mapping, 'result_type') || null,
      spend: toNumber(get(r, mapping, 'spend')),
      follows: toInt(get(r, mapping, 'follows')),
      delivery_status: get(r, mapping, 'delivery_status') || null,
    })
  }
  return { rows, skipped }
}

/** "19:00:00 - 19:59:59", "19:00", "7 PM" → 19. */
export function parseTimeOfDay(value: string | undefined): number | null {
  const m = value?.trim().match(/^(\d{1,2})(?::\d{2})?(?::\d{2})?\s*(am|pm)?/i)
  if (!m) return null
  let hour = Number(m[1])
  if (m[2]) { const pm = m[2].toLowerCase() === 'pm'; if (pm && hour < 12) hour += 12; if (!pm && hour === 12) hour = 0 }
  return hour >= 0 && hour <= 23 ? hour : null
}

/**
 * Ads Manager export with the "Time of day" breakdown → one row per hour
 * (dimension "ad_hour", summed across ads), stored in the generic
 * dimension/metrics table alongside GA4 rows. Feeds best posting times.
 */
export function buildAdHourlyRows(parsed: ParsedCsv, mapping: Record<string, number>): BuildResult<GaMetricRow> {
  const merged = new Map<string, GaMetricRow>()
  let skipped = 0
  for (const r of parsed.rows) {
    const hour = parseTimeOfDay(get(r, mapping, 'time_of_day'))
    const start = parseDateOnly(get(r, mapping, 'period_start'))
    if (hour == null || !start) { skipped++; continue }
    const end = parseDateOnly(get(r, mapping, 'period_end')) ?? start
    const metrics: Record<string, number> = {}
    for (const key of ['impressions', 'results', 'link_clicks', 'spend']) {
      const n = toNumber(get(r, mapping, key))
      if (n != null) metrics[key] = n
    }
    const id = `${hour}|${start}|${end}`
    const existing = merged.get(id)
    if (existing) {
      for (const [k, n] of Object.entries(metrics)) existing.metrics[k] = (existing.metrics[k] ?? 0) + n
    } else {
      merged.set(id, { dimension: 'ad_hour', dimension_value: String(hour), period_start: start, period_end: end, metrics })
    }
  }
  return { rows: [...merged.values()], skipped }
}

export interface GaMetricRow {
  dimension: string
  dimension_value: string
  period_start: string
  period_end: string
  metrics: Record<string, number>
}

/**
 * GA4 rows keyed by their dimension. Supported shapes:
 * day of week + hour → "day_hour" ("2-19" = Tuesday 7 PM), hour only →
 * "hour", manual ad content → "utm_content". Rows sharing a key (e.g. a
 * second dimension we don't store) are summed.
 */
export function buildGaRows(
  parsed: ParsedCsv,
  mapping: Record<string, number>,
  period: { start: string; end: string }
): BuildResult<GaMetricRow> {
  const merged = new Map<string, GaMetricRow>()
  let skipped = 0
  const hasDay = (mapping.day_of_week ?? -1) >= 0
  const hasHour = (mapping.hour ?? -1) >= 0
  const hasContent = (mapping.utm_content ?? -1) >= 0

  for (const r of parsed.rows) {
    let dimension: string
    let value: string
    if (hasDay && hasHour) {
      const day = parseDayOfWeek(get(r, mapping, 'day_of_week'))
      const hour = toInt(get(r, mapping, 'hour'))
      if (day == null || hour == null || hour < 0 || hour > 23) { skipped++; continue }
      dimension = 'day_hour'
      value = `${day}-${hour}`
    } else if (hasHour) {
      const hour = toInt(get(r, mapping, 'hour'))
      if (hour == null || hour < 0 || hour > 23) { skipped++; continue }
      dimension = 'hour'
      value = String(hour)
    } else if (hasContent) {
      const content = get(r, mapping, 'utm_content')
      if (!content || content === '(not set)') { skipped++; continue }
      dimension = 'utm_content'
      value = content.toLowerCase()
    } else {
      skipped++
      continue
    }

    const metrics: Record<string, number> = {}
    for (const key of ['sessions', 'users', 'engaged_sessions', 'key_events']) {
      const n = toNumber(get(r, mapping, key))
      if (n != null) metrics[key] = n
    }
    const id = `${dimension}|${value}`
    const existing = merged.get(id)
    if (existing) {
      for (const [k, n] of Object.entries(metrics)) existing.metrics[k] = (existing.metrics[k] ?? 0) + n
    } else {
      merged.set(id, { dimension, dimension_value: value, period_start: period.start, period_end: period.end, metrics })
    }
  }
  return { rows: [...merged.values()], skipped }
}
