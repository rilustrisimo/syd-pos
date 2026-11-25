/**
 * GET /api/insights?from=YYYY-MM-DD&to=YYYY-MM-DD&branch=<uuid>
 *
 * Admin only. Returns the full Insights bundle (KPIs, sales patterns,
 * products, customers, inventory, forecasts, alerts). Also posts one daily
 * summary notification for admins when there are critical/warning alerts.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTodayPH } from '@/lib/utils/datetime'
import { requireAdmin, parseRange } from '@/lib/insights/auth'
import { loadRawInsights } from '@/lib/insights/data'
import { buildBundle, slimForPage } from '@/lib/insights/bundle'

export const maxDuration = 60

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const auth = await requireAdmin(supabase as any)
    if (auth.error) return auth.error

    const today = getTodayPH()
    const range = parseRange(new URL(req.url), today)
    const raw = await loadRawInsights(supabase as any, { ...range, today })
    const bundle = buildBundle(raw)
    await notifyOncePerDay(supabase as any, bundle.alerts, today).catch((e) => console.warn('[insights] notify failed', e?.message))
    return NextResponse.json(slimForPage(bundle), { headers: { 'Cache-Control': 'private, max-age=300' } })
  } catch (err: any) {
    console.error('[insights]', err)
    return NextResponse.json({ error: err?.message || 'Failed to build insights' }, { status: 500 })
  }
}

/** One short summary per day (no names/amounts: notifications are readable by all staff). */
async function notifyOncePerDay(db: any, alerts: { level: string }[], today: string) {
  const critical = alerts.filter((a) => a.level === 'critical').length
  const warning = alerts.filter((a) => a.level === 'warning').length
  if (!critical && !warning) return
  const { data: existing } = await db.from('notifications').select('id')
    .eq('type', 'insights_daily').gte('created_at', `${today}T00:00:00+08:00`).limit(1)
  if (existing?.length) return
  await db.from('notifications').insert({
    type: 'insights_daily',
    title: 'Business Insights: items need attention',
    message: [critical && `${critical} urgent`, warning && `${warning} warning${warning > 1 ? 's' : ''}`].filter(Boolean).join(', ') + ' — open Insights to review.',
    entity_type: 'insights',
    target_roles: ['admin'],
    metadata: { critical, warning, href: '/insights' },
  })
}
