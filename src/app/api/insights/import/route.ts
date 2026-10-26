/**
 * POST /api/insights/import
 *
 * Saves rows parsed (and column-mapped) on the Marketing → Insights page
 * from a Meta Business Suite, Meta Ads Manager or GA4 CSV export. Upserts
 * on each table's natural key, so uploading an overlapping export again
 * updates the numbers instead of duplicating rows. Admin/manager only.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { InsightSource } from '@/lib/marketing/insights-import'

const TABLES: Record<InsightSource, { table: string; onConflict: string }> = {
  meta_posts: { table: 'social_post_metrics', onConflict: 'platform,external_id' },
  meta_ads: { table: 'ad_metrics', onConflict: 'ad_name,period_start,period_end' },
  // Hourly ad breakdown shares the generic dimension/metrics table with GA4.
  meta_ads_hourly: { table: 'ga_metrics', onConflict: 'dimension,dimension_value,period_start,period_end' },
  ga4: { table: 'ga_metrics', onConflict: 'dimension,dimension_value,period_start,period_end' },
}

const MAX_ROWS = 5000
const BATCH = 500

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: staffUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single() as { data: { role: string } | null }
    if (!staffUser || !['admin', 'manager'].includes(staffUser.role)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const { source, rows } = await request.json() as { source?: InsightSource; rows?: Record<string, unknown>[] }
    const target = source ? TABLES[source] : undefined
    if (!target) return NextResponse.json({ error: 'Unknown export type' }, { status: 400 })
    if (!Array.isArray(rows) || rows.length === 0) return NextResponse.json({ error: 'No rows to import' }, { status: 400 })
    if (rows.length > MAX_ROWS) {
      return NextResponse.json({ error: `Too many rows (${rows.length}); export a shorter date range (max ${MAX_ROWS}).` }, { status: 400 })
    }

    const importedAt = new Date().toISOString()
    let saved = 0
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH).map((r) => ({ ...r, imported_at: importedAt }))
      const { error } = await (supabase as any)
        .from(target.table)
        .upsert(batch, { onConflict: target.onConflict })
      if (error) {
        console.error('[insights/import]', target.table, error)
        return NextResponse.json({ error: `Saved ${saved} rows, then failed: ${error.message}` }, { status: 500 })
      }
      saved += batch.length
    }

    return NextResponse.json({ saved })
  } catch (err: any) {
    console.error('[insights/import]', err)
    return NextResponse.json({ error: err?.message || 'Import failed' }, { status: 500 })
  }
}
