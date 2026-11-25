'use client'

// Small shared building blocks for the Insights tabs.

import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export const C = {
  revenue: '#2563eb', profit: '#16a34a', cost: '#94a3b8', warn: '#f59e0b', danger: '#dc2626',
  forecast: '#7c3aed', band: '#c4b5fd', muted: '#cbd5e1',
}

export const peso = (n: number | null | undefined, opts: { compact?: boolean } = {}) => {
  const v = Number(n ?? 0)
  if (opts.compact && Math.abs(v) >= 1000) {
    if (Math.abs(v) >= 1_000_000) return `₱${(v / 1_000_000).toFixed(2)}M`
    return `₱${(v / 1000).toFixed(Math.abs(v) >= 100_000 ? 0 : 1)}k`
  }
  return '₱' + v.toLocaleString('en-PH', { maximumFractionDigits: 0 })
}
export const num = (n: number | null | undefined, d = 0) => Number(n ?? 0).toLocaleString('en-PH', { maximumFractionDigits: d })
export const pctText = (n: number | null | undefined, d = 1) => (n == null || !isFinite(n) ? '—' : `${n.toFixed(d)}%`)
export const shortDate = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
export const monthName = (ym: string) => new Date(ym.slice(0, 7) + '-01T00:00:00').toLocaleDateString('en-PH', { month: 'short', year: '2-digit' })

export function Delta({ value, invert = false, suffix = '%' }: { value: number | null | undefined; invert?: boolean; suffix?: string }) {
  if (value == null || !isFinite(value)) return <span className="text-xs text-muted-foreground">no prior data</span>
  const good = invert ? value < 0 : value > 0
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', Math.abs(value) < 0.5 ? 'text-muted-foreground' : good ? 'text-green-600' : 'text-red-600')}>
      <Icon className="h-3 w-3" />{Math.abs(value).toFixed(1)}{suffix}
    </span>
  )
}

export function Kpi({ label, value, delta, invert, hint, sub }: { label: string; value: ReactNode; delta?: number | null; invert?: boolean; hint?: string; sub?: ReactNode }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="px-4 space-y-1">
        <p className="text-xs text-muted-foreground flex items-center gap-1" title={hint}>
          {label}{hint && <Info className="h-3 w-3 opacity-60" />}
        </p>
        <p className="text-xl font-semibold tracking-tight">{value}</p>
        <div className="flex items-center gap-2 min-h-4">
          {delta !== undefined && <Delta value={delta} invert={invert} />}
          {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
        </div>
      </CardContent>
    </Card>
  )
}

/** A titled card with a one-line "so what" takeaway under the title. */
export function Panel({ title, takeaway, children, action, className }: { title: string; takeaway?: ReactNode; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <Card className={cn('gap-3', className)}>
      <CardHeader className="pb-0">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-sm">{title}</CardTitle>
            {takeaway && <p className="text-xs text-muted-foreground leading-relaxed">{takeaway}</p>}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export function MiniTable({ head, rows, empty = 'Nothing to show.', align }: { head: string[]; rows: ReactNode[][]; empty?: string; align?: ('l' | 'r')[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground border-b">
            {head.map((h, i) => <th key={i} className={cn('py-1.5 px-1 font-medium whitespace-nowrap', (align?.[i] ?? (i === 0 ? 'l' : 'r')) === 'r' ? 'text-right' : 'text-left')}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-0">
              {r.map((c, j) => <td key={j} className={cn('py-1.5 px-1', (align?.[j] ?? (j === 0 ? 'l' : 'r')) === 'r' ? 'text-right font-mono text-xs whitespace-nowrap' : 'text-left')}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Pill({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'green' | 'red' | 'amber' | 'blue' | 'violet' }) {
  const tones = {
    muted: 'bg-muted text-muted-foreground', green: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', violet: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  }
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', tones[tone])}>{children}</span>
}

export function ChartTip({ active, payload, label, fmt = peso, labelFmt }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-background p-2.5 shadow-md text-xs space-y-0.5">
      <p className="font-medium">{labelFmt ? labelFmt(label) : label}</p>
      {payload.filter((p: any) => p.value != null && p.dataKey !== 'band').map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {fmt(Array.isArray(p.value) ? p.value[1] : p.value)}</p>
      ))}
    </div>
  )
}
