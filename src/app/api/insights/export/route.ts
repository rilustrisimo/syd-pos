/**
 * GET /api/insights/export?from=&to=&branch=
 *
 * Admin only. A zip for AI analysis: a detailed Markdown report (context,
 * definitions, KPIs, tables, forecast, caveats, suggested questions) plus
 * clean CSVs. Customer names are included (owner's choice).
 */

import { NextResponse } from 'next/server'
import { zipSync, strToU8 } from 'fflate'
import { createClient } from '@/lib/supabase/server'
import { getTodayPH } from '@/lib/utils/datetime'
import { requireAdmin, parseRange } from '@/lib/insights/auth'
import { loadRawInsights } from '@/lib/insights/data'
import { buildBundle } from '@/lib/insights/bundle'
import { buildCsvs, buildMarkdown } from '@/lib/insights/report'

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
    const { data: shop } = await (supabase as any).from('shop_settings').select('store_name').limit(1).maybeSingle()

    const base = `SYD_insights_${range.from}_to_${range.to}`
    const files: Record<string, Uint8Array> = { [`${base}.md`]: strToU8(buildMarkdown(bundle, { storeName: shop?.store_name || undefined })) }
    for (const [name, content] of Object.entries(buildCsvs(bundle, raw))) if (content) files[`data/${name}`] = strToU8(content)
    files['README.txt'] = strToU8(
      `Upload the .md file (and any CSVs in data/) to ChatGPT, Claude or Gemini and ask, for example:\n` +
      `"You are a retail analyst for a Philippine hardware store. Read this report and give me the 5 most important decisions for next month, with numbers."\n`
    )
    const zip = zipSync(files, { level: 6 })
    return new NextResponse(Buffer.from(zip), {
      headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${base}.zip"` },
    })
  } catch (err: any) {
    console.error('[insights/export]', err)
    return NextResponse.json({ error: err?.message || 'Export failed' }, { status: 500 })
  }
}
