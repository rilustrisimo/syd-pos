'use client'

import { useMemo, useRef, useState } from 'react'
import { FileUp, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useImportInsights } from '@/hooks/useMarketingInsights'
import {
  SOURCE_FIELDS,
  SOURCE_LABELS,
  autoMap,
  buildAdRows,
  buildGaRows,
  buildSocialPostRows,
  detectSource,
  missingRequired,
  parseCsv,
  type InsightSource,
  type ParsedCsv,
} from '@/lib/marketing/insights-import'

const HOW_TO: Record<InsightSource, string[]> = {
  meta_posts: [
    'Open Meta Business Suite → Insights → Content (or Content → Posts & reels).',
    'Choose the date range (e.g. last 28 days) and include Facebook and Instagram.',
    'Click Export data → choose CSV, and include post-level metrics. Export Facebook and Instagram separately if asked.',
  ],
  meta_ads: [
    'Open Ads Manager → Ads tab, and set the date range.',
    'Columns: keep Ad name, Reach, Impressions, Results, Amount spent, Link clicks (add Follows or likes if you ran follower ads).',
    'Reports (or Export) → Export table data → CSV.',
  ],
  ga4: [
    'For best times: GA4 → Explore → Free form. Rows: "Day of week name" and "Hour". Values: Sessions, Active users, Key events. Then Export → CSV (or Download → CSV).',
    'For concepts: Reports → Acquisition → Traffic acquisition, change the dimension to "Session manual ad content", then Share → Download file → CSV.',
    'Import each export separately.',
  ],
}

const NONE = '-1'

export function InsightsImporter() {
  const importInsights = useImportInsights()
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedCsv | null>(null)
  const [source, setSource] = useState<InsightSource | null>(null)
  const [mapping, setMapping] = useState<Record<string, number>>({})
  const [period, setPeriod] = useState({ start: '', end: '' })
  const [guide, setGuide] = useState<InsightSource>('meta_posts')

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const result = parseCsv(await file.text())
      if (!result.headers.length || !result.rows.length) throw new Error('No rows found in this file')
      const detected = detectSource(result.headers)
      setFileName(file.name)
      setParsed(result)
      setSource(detected)
      setMapping(detected ? autoMap(detected, result.headers) : {})
      setPeriod({ start: result.periodStart ?? '', end: result.periodEnd ?? '' })
      if (!detected) toast.message("Couldn't tell which export this is — pick the type below.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not read the CSV')
    }
  }

  function chooseSource(next: InsightSource) {
    setSource(next)
    if (parsed) setMapping(autoMap(next, parsed.headers))
  }

  const preview = useMemo(() => {
    if (!parsed || !source) return null
    if (source === 'meta_posts') return buildSocialPostRows(parsed, mapping)
    if (source === 'meta_ads') return buildAdRows(parsed, mapping)
    if (!period.start || !period.end) return null
    return buildGaRows(parsed, mapping, period)
  }, [parsed, source, mapping, period])

  const missing = source ? missingRequired(source, mapping) : []
  const gaNeedsPeriod = source === 'ga4' && (!period.start || !period.end)

  async function handleImport() {
    if (!source || !preview?.rows.length) return
    try {
      const { saved } = await importInsights.mutateAsync({ source, rows: preview.rows })
      toast.success(`Imported ${saved} row${saved === 1 ? '' : 's'} from ${fileName}`)
      setParsed(null)
      setSource(null)
      setFileName(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2"><FileUp className="w-4 h-4" /> Import data</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-2">
            <p className="text-sm text-slate-600">
              Upload CSV exports from Meta and Google Analytics weekly. The planner learns from them. Re-uploading an overlapping date range just updates the numbers.
            </p>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
            <Button onClick={() => fileRef.current?.click()} className="gap-1.5">
              <Upload className="w-4 h-4" /> Choose CSV export
            </Button>
          </div>
          <div className="rounded-md border bg-slate-50 p-3 space-y-2">
            <div className="flex gap-1 flex-wrap">
              {(Object.keys(HOW_TO) as InsightSource[]).map((s) => (
                <Button key={s} size="sm" variant={guide === s ? 'default' : 'outline'} className="h-7 text-[11px]" onClick={() => setGuide(s)}>
                  {s === 'meta_posts' ? 'Meta posts' : s === 'meta_ads' ? 'Meta ads' : 'GA4'}
                </Button>
              ))}
            </div>
            <ol className="list-decimal pl-4 space-y-1 text-xs text-slate-600">
              {HOW_TO[guide].map((step) => <li key={step}>{step}</li>)}
            </ol>
          </div>
        </div>

        {parsed && (
          <div className="rounded-md border p-3 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{fileName}</span>
              <span className="text-xs text-slate-500">{parsed.rows.length} rows</span>
              <Select value={source ?? ''} onValueChange={(v) => chooseSource(v as InsightSource)}>
                <SelectTrigger className="h-8 w-72 text-xs ml-auto"><SelectValue placeholder="Which export is this?" /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(SOURCE_LABELS) as InsightSource[]).map((s) => (
                    <SelectItem key={s} value={s}>{SOURCE_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {source && (
              <>
                <p className="text-xs text-slate-500">Check the columns were matched correctly (fix any that weren&apos;t):</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {SOURCE_FIELDS[source].map((field) => (
                    <div key={field.key} className="flex items-center gap-2">
                      <span className={`text-xs w-36 flex-shrink-0 ${field.required ? 'font-medium' : 'text-slate-500'}`}>
                        {field.label}{field.required ? ' *' : ''}
                      </span>
                      <Select
                        value={String(mapping[field.key] ?? -1)}
                        onValueChange={(v) => setMapping((m) => ({ ...m, [field.key]: Number(v) }))}
                      >
                        <SelectTrigger className="h-7 text-xs flex-1 min-w-0"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>— not in this file —</SelectItem>
                          {parsed.headers.map((h, i) => (
                            <SelectItem key={`${h}-${i}`} value={String(i)}>{h || `(column ${i + 1})`}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>

                {source === 'ga4' && (
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="text-slate-600">Report period:</span>
                    <Input type="date" value={period.start} onChange={(e) => setPeriod((p) => ({ ...p, start: e.target.value }))} className="h-7 w-40 text-xs" />
                    <span>to</span>
                    <Input type="date" value={period.end} onChange={(e) => setPeriod((p) => ({ ...p, end: e.target.value }))} className="h-7 w-40 text-xs" />
                    {parsed.periodStart && <span className="text-slate-400">(read from the export)</span>}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-xs text-slate-500">
                    {missing.length
                      ? <span className="text-amber-700">Map the required columns: {missing.join(', ')}</span>
                      : gaNeedsPeriod
                        ? <span className="text-amber-700">Enter the report&apos;s date range.</span>
                        : preview
                          ? `${preview.rows.length} rows ready${preview.skipped ? `, ${preview.skipped} skipped (missing ID/date or blank)` : ''}.`
                          : ''}
                  </p>
                  <Button
                    size="sm"
                    onClick={handleImport}
                    disabled={!!missing.length || gaNeedsPeriod || !preview?.rows.length || importInsights.isPending}
                  >
                    {importInsights.isPending ? 'Importing...' : `Import ${preview?.rows.length ?? 0} rows`}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
