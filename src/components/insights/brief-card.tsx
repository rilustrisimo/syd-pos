'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { InsightsBrief } from '@/lib/insights/brief'
import { Panel, Pill, shortDate } from './ui'

export interface StoredBrief { id: string; kind: 'weekly' | 'monthly'; period_start: string; period_end: string; payload: InsightsBrief & { lang?: string }; created_at: string }

const LANG_KEY = 'insights-brief-lang'
const readLang = (): 'english' | 'taglish' => { try { return localStorage.getItem(LANG_KEY) === 'english' ? 'english' : 'taglish' } catch { return 'taglish' } }

export function useBriefs() {
  return useQuery<StoredBrief[]>({
    queryKey: ['insights-briefs'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch('/api/insights/brief')
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Failed to load briefs')
      return j.briefs
    },
  })
}

export function BriefCard() {
  const qc = useQueryClient()
  const { data: briefs, isLoading } = useBriefs()
  const [kind, setKind] = useState<'weekly' | 'monthly'>('weekly')
  const [lang, setLang] = useState<'english' | 'taglish'>(readLang)

  const gen = useMutation({
    mutationFn: async (k: 'weekly' | 'monthly') => {
      const res = await fetch('/api/insights/brief', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: k, lang }) })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Failed')
      return j.brief as StoredBrief
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['insights-briefs'] }),
    onError: (e: Error) => toast.error(e.message),
  })

  // Weekly brief: write one automatically when the latest is over 7 days old.
  const autoTried = useRef(false)
  useEffect(() => {
    if (isLoading || !briefs || autoTried.current || gen.isPending) return
    const latest = briefs.find((b) => b.kind === 'weekly')
    if (!latest || Date.now() - Date.parse(latest.created_at) > 7 * 86400_000) {
      autoTried.current = true
      gen.mutate('weekly')
    }
  }, [briefs, isLoading, gen])

  const brief = briefs?.find((b) => b.kind === kind)
  const p = brief?.payload
  return (
    <Panel
      title="AI business brief"
      takeaway={brief ? `${kind === 'weekly' ? 'Week' : 'Month'} of ${shortDate(brief.period_start)} – ${shortDate(brief.period_end)} · written ${new Date(brief.created_at).toLocaleDateString('en-PH')}` : 'Gemini reads all the numbers and writes what matters and what to do.'}
      action={
        <div className="flex items-center gap-1 flex-wrap justify-end">
          {(['weekly', 'monthly'] as const).map((k) => <Button key={k} size="sm" variant={kind === k ? 'default' : 'outline'} className="h-7 px-2 text-xs" onClick={() => setKind(k)}>{k === 'weekly' ? 'Weekly' : 'Monthly'}</Button>)}
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => { const v = lang === 'taglish' ? 'english' : 'taglish'; setLang(v); try { localStorage.setItem(LANG_KEY, v) } catch {} }}>{lang === 'taglish' ? 'Taglish' : 'English'}</Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={gen.isPending} onClick={() => gen.mutate(kind)}>
            {gen.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}<span className="ml-1">{brief ? 'Rewrite' : 'Write'}</span>
          </Button>
        </div>
      }
    >
      {gen.isPending && !p ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Writing the brief…</p>
      ) : !p ? (
        <p className="text-sm text-muted-foreground">No {kind} brief yet. Click Write.</p>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="font-semibold flex gap-2"><Sparkles className="h-4 w-4 text-violet-600 shrink-0 mt-0.5" />{p.headline}</p>
          <p className="text-muted-foreground leading-relaxed">{p.summary}</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><p className="text-xs font-semibold text-green-700 mb-1">Wins</p><ul className="list-disc pl-4 space-y-0.5 text-xs">{p.wins.map((w, i) => <li key={i}>{w}</li>)}</ul></div>
            <div><p className="text-xs font-semibold text-red-700 mb-1">Concerns</p><ul className="list-disc pl-4 space-y-0.5 text-xs">{p.concerns.map((w, i) => <li key={i}>{w}</li>)}</ul></div>
          </div>
          <div>
            <p className="text-xs font-semibold mb-1">Do this {kind === 'weekly' ? 'week' : 'month'}</p>
            <ol className="space-y-1.5">
              {p.actions.map((a, i) => (
                <li key={i} className="flex gap-2 text-xs"><Pill tone={a.priority === 'high' ? 'red' : a.priority === 'medium' ? 'amber' : 'muted'}>{a.priority}</Pill><span><b>{a.action}</b> <span className="text-muted-foreground">{a.why}</span></span></li>
              ))}
            </ol>
          </div>
          {(p.buy_list.length > 0 || p.customers_to_call.length > 0) && (
            <div className="grid sm:grid-cols-2 gap-3">
              {p.buy_list.length > 0 && <div><p className="text-xs font-semibold mb-1">Buy list</p><ul className="space-y-0.5 text-xs">{p.buy_list.map((x, i) => <li key={i}><b>{x.product}</b> — {x.quantity} <span className="text-muted-foreground">({x.reason})</span></li>)}</ul></div>}
              {p.customers_to_call.length > 0 && <div><p className="text-xs font-semibold mb-1">Customers to call</p><ul className="space-y-0.5 text-xs">{p.customers_to_call.map((x, i) => <li key={i}><b>{x.name}</b> <span className="text-muted-foreground">— {x.reason}</span></li>)}</ul></div>}
            </div>
          )}
          <p className="text-xs border-t pt-2"><b>Outlook:</b> {p.outlook}</p>
        </div>
      )}
    </Panel>
  )
}
