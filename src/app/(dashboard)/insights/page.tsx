'use client'

// Business Insights (admin only): KPIs and growth, sales patterns, product
// and margin analysis, customers & credit, inventory health, forecasts with
// reorder plan, alerts, the weekly AI brief, a PDF report and an AI export.

import { useMemo, useState } from 'react'
import { Download, FileText, Loader2, ShieldAlert, Bot } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/stores/auth'
import { useInsights } from '@/hooks/useInsights'
import { getTodayPH } from '@/lib/utils/datetime'
import { addDays, addMonths, monthStart } from '@/lib/insights/dates'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { OverviewTab } from '@/components/insights/overview-tab'
import { SalesTab } from '@/components/insights/sales-tab'
import { ProductsTab } from '@/components/insights/products-tab'
import { CustomersTab } from '@/components/insights/customers-tab'
import { InventoryTab } from '@/components/insights/inventory-tab'
import { ForecastTab } from '@/components/insights/forecast-tab'
import { CashTab } from '@/components/insights/cash-tab'
import { BriefCard, useBriefs } from '@/components/insights/brief-card'

type Preset = 'last7' | 'last30' | 'this_month' | 'last_month' | 'last90' | 'ytd' | 'custom'
const PRESETS: { value: Preset; label: string }[] = [
  { value: 'last7', label: '7 days' }, { value: 'last30', label: '30 days' }, { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' }, { value: 'last90', label: '90 days' }, { value: 'ytd', label: 'Year to date' }, { value: 'custom', label: 'Custom' },
]

function rangeFor(p: Preset, today: string) {
  switch (p) {
    case 'last7': return { from: addDays(today, -6), to: today }
    case 'last30': return { from: addDays(today, -29), to: today }
    case 'this_month': return { from: monthStart(today), to: today }
    case 'last_month': return { from: addMonths(monthStart(today), -1), to: addDays(monthStart(today), -1) }
    case 'last90': return { from: addDays(today, -89), to: today }
    case 'ytd': return { from: `${today.slice(0, 4)}-01-01`, to: today }
    default: return { from: monthStart(today), to: today }
  }
}

export default function InsightsPage() {
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'
  const today = getTodayPH()
  const [preset, setPreset] = useState<Preset>('last30')
  const [custom, setCustom] = useState(() => rangeFor('last30', today))
  const [branch, setBranch] = useState<string | null>(null)
  const [tab, setTab] = useState('overview')
  const [exporting, setExporting] = useState(false)
  const range = useMemo(() => (preset === 'custom' ? custom : rangeFor(preset, today)), [preset, custom, today])
  const { data: b, isLoading, error, isFetching } = useInsights({ ...range, branch }, isAdmin)
  const { data: briefs } = useBriefs()

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
        <ShieldAlert className="h-10 w-10 mb-3" />
        <p>Only admins can view business insights.</p>
      </div>
    )
  }

  const exportForAI = async () => {
    setExporting(true)
    try {
      const q = new URLSearchParams(range)
      if (branch) q.set('branch', branch)
      const res = await fetch(`/api/insights/export?${q}`)
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Export failed')
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `SYD_insights_${range.from}_to_${range.to}.zip`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setExporting(false)
    }
  }

  const downloadPdf = async () => {
    if (!b) return
    const { downloadInsightsPdf } = await import('@/lib/insights/pdf')
    // Use the AI brief when it covers this exact period (e.g. "Last month" + monthly brief).
    const match = briefs?.find((x) => x.period_start === range.from && x.period_end === range.to)
    downloadInsightsPdf(b, match?.payload ?? null)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Business Insights</h1>
          <p className="text-sm text-muted-foreground">How SYD is growing, what to order, who to call, and what&apos;s coming. {isFetching && !isLoading && <Loader2 className="inline h-3 w-3 animate-spin" />}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={downloadPdf} disabled={!b}><FileText className="h-4 w-4 mr-1" />PDF report</Button>
          <Button size="sm" variant="outline" onClick={exportForAI} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Bot className="h-4 w-4 mr-1" />}Export for AI<Download className="h-3 w-3 ml-1 opacity-60" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((p) => <Button key={p.value} size="sm" variant={preset === p.value ? 'default' : 'outline'} className="h-8 text-xs" onClick={() => setPreset(p.value)}>{p.label}</Button>)}
        </div>
        {preset === 'custom' && (
          <div className="flex items-center gap-1">
            <Input type="date" className="h-8 w-36" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" className="h-8 w-36" value={custom.to} min={custom.from} max={today} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} />
          </div>
        )}
        {b && b.meta.branches.length > 1 && (
          <select className="h-8 rounded-md border bg-background px-2 text-xs" value={branch ?? ''} onChange={(e) => setBranch(e.target.value || null)}>
            <option value="">All branches</option>
            {b.meta.branches.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        )}
        <span className="text-xs text-muted-foreground">{range.from} → {range.to}, compared with the {b ? `${b.meta.rangeDays} days before` : 'period before'}</span>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/30">{(error as Error).message}</div>
      ) : isLoading || !b ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>
          <Skeleton className="h-72" />
          <p className="text-xs text-muted-foreground">Crunching a year of sales, stock and customers…</p>
        </div>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <div className="overflow-x-auto -mx-1 px-1">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="sales">Sales</TabsTrigger>
              <TabsTrigger value="products">Products & margins</TabsTrigger>
              <TabsTrigger value="customers">Customers & credit</TabsTrigger>
              <TabsTrigger value="inventory">Inventory</TabsTrigger>
              <TabsTrigger value="forecast">Forecast</TabsTrigger>
              <TabsTrigger value="cash">Cash & growth</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="overview"><OverviewTab b={b} brief={<BriefCard />} /></TabsContent>
          <TabsContent value="sales"><SalesTab b={b} /></TabsContent>
          <TabsContent value="products"><ProductsTab b={b} /></TabsContent>
          <TabsContent value="customers"><CustomersTab b={b} /></TabsContent>
          <TabsContent value="inventory"><InventoryTab b={b} /></TabsContent>
          <TabsContent value="forecast"><ForecastTab b={b} /></TabsContent>
          <TabsContent value="cash"><CashTab b={b} /></TabsContent>
        </Tabs>
      )}
    </div>
  )
}
