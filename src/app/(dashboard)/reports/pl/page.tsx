'use client'

import { useState } from 'react'
import { usePLReport } from '@/hooks/useDashboard'
import { formatCurrency } from '@/lib/utils/formatting'
import { getTodayPH } from '@/lib/utils/datetime'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Receipt,
  Loader2,
  Calendar,
  BarChart3,
  Download,
  ChevronDown,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { downloadCSV } from '@/lib/utils/export'
import { toast } from 'sonner'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'

// ─── Date preset helpers (same as sales report) ───────────────────────────────

function formatLocalDate(year: number, month: number, day: number): string {
  const yyyy = year.toString()
  const mm = (month + 1).toString().padStart(2, '0')
  const dd = day.toString().padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function getPresetRange(preset: string): { from: string; to: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()

  switch (preset) {
    case 'today':
      return { from: getTodayPH(), to: getTodayPH() }
    case 'yesterday': {
      const yest = new Date(y, m, d - 1)
      return {
        from: formatLocalDate(yest.getFullYear(), yest.getMonth(), yest.getDate()),
        to: formatLocalDate(yest.getFullYear(), yest.getMonth(), yest.getDate()),
      }
    }
    case 'this_week': {
      const dow = now.getDay()
      const weekStart = new Date(y, m, d - dow)
      return {
        from: formatLocalDate(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()),
        to: getTodayPH(),
      }
    }
    case 'this_month':
      return { from: formatLocalDate(y, m, 1), to: getTodayPH() }
    case 'last_month': {
      const firstOfLast = new Date(y, m - 1, 1)
      const lastOfLast = new Date(y, m, 0)
      return {
        from: formatLocalDate(firstOfLast.getFullYear(), firstOfLast.getMonth(), firstOfLast.getDate()),
        to: formatLocalDate(lastOfLast.getFullYear(), lastOfLast.getMonth(), lastOfLast.getDate()),
      }
    }
    case 'this_quarter': {
      const qStart = new Date(y, Math.floor(m / 3) * 3, 1)
      return {
        from: formatLocalDate(qStart.getFullYear(), qStart.getMonth(), qStart.getDate()),
        to: getTodayPH(),
      }
    }
    case 'this_year':
      return { from: formatLocalDate(y, 0, 1), to: getTodayPH() }
    case 'last_year':
      return { from: formatLocalDate(y - 1, 0, 1), to: formatLocalDate(y - 1, 11, 31) }
    default:
      return { from: formatLocalDate(y, m, 1), to: getTodayPH() }
  }
}

const DATE_PRESETS = [
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'this_week' },
  { label: 'This Month', value: 'this_month' },
  { label: 'Last Month', value: 'last_month' },
  { label: 'This Quarter', value: 'this_quarter' },
  { label: 'This Year', value: 'this_year' },
  { label: 'Last Year', value: 'last_year' },
  { label: 'Custom', value: 'custom' },
]

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-background p-3 shadow-md text-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  subtitle,
  positive,
  icon: Icon,
  highlight,
}: {
  title: string
  value: string
  subtitle?: string
  positive?: boolean
  icon: React.ElementType
  highlight?: boolean
}) {
  return (
    <Card className={highlight ? 'ring-2 ring-primary' : ''}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div
          className={`text-2xl font-bold ${
            positive === undefined
              ? ''
              : positive
              ? 'text-green-600'
              : 'text-red-600'
          }`}
        >
          {value}
        </div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PLReportPage() {
  const defaultRange = getPresetRange('this_month')
  const [preset, setPreset] = useState('this_month')
  const [dateFrom, setDateFrom] = useState(defaultRange.from)
  const [dateTo, setDateTo] = useState(defaultRange.to)

  const { data: report, isLoading, isFetching } = usePLReport(dateFrom, dateTo)

  const handlePreset = (value: string) => {
    setPreset(value)
    if (value !== 'custom') {
      const range = getPresetRange(value)
      setDateFrom(range.from)
      setDateTo(range.to)
    }
  }

  // Build horizontal bar data for expenses by category
  const categoryData = (report?.expenses_by_category ?? [])
    .sort((a, b) => b.total_amount - a.total_amount)
    .slice(0, 10)

  const isProfit = (report?.net_profit ?? 0) >= 0
  const isGrossProfit = (report?.gross_profit ?? 0) >= 0

  const [isExporting, setIsExporting] = useState(false)

  const handleExportDaily = () => {
    if (!report?.daily_trend?.length) { toast.info('No daily data to export'); return }
    const rows = report.daily_trend.map(d => ({
      date: d.date,
      revenue: d.revenue,
      gross_profit: d.gross_profit,
      total_expenses: d.expenses,
      net_profit: d.net_profit,
    }))
    downloadCSV(rows as any[], `pl_daily_${dateFrom}_${dateTo}.csv`)
    toast.success(`Exported ${rows.length} days`)
  }

  const handleExportByCategory = () => {
    if (!report?.expenses_by_category?.length) { toast.info('No expense category data to export'); return }
    const totalExp = report.total_expenses || 1
    const rows = report.expenses_by_category.map(c => ({
      category: c.category_name,
      amount: c.total_amount,
      transaction_count: c.count,
      pct_of_expenses: Number(((c.total_amount / totalExp) * 100).toFixed(2)),
    }))
    downloadCSV(rows as any[], `pl_expenses_by_category_${dateFrom}_${dateTo}.csv`)
    toast.success(`Exported ${rows.length} categories`)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Profit &amp; Loss</h1>
          <p className="text-muted-foreground">
            Revenue, costs, expenses, and net profit for the selected period
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isFetching && !isLoading && (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={isLoading || !report} className="gap-1">
                <Download className="h-4 w-4" />
                Export
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportDaily}>
                Daily Breakdown CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportByCategory}>
                Expenses by Category CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Date Range */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-2 mb-4">
            {DATE_PRESETS.map((p) => (
              <Button
                key={p.value}
                variant={preset === p.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => handlePreset(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="flex items-center gap-3 mt-3">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                className="w-[150px]"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <span className="text-muted-foreground text-sm">to</span>
              <Input
                type="date"
                className="w-[150px]"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-6">
            <StatCard
              title="Revenue"
              value={formatCurrency(report?.revenue ?? 0)}
              icon={DollarSign}
            />
            <StatCard
              title="COGS"
              value={formatCurrency(report?.cogs ?? 0)}
              icon={BarChart3}
            />
            <StatCard
              title="Gross Profit"
              value={formatCurrency(report?.gross_profit ?? 0)}
              subtitle={`${(report?.gross_margin ?? 0).toFixed(1)}% margin`}
              positive={isGrossProfit}
              icon={TrendingUp}
            />
            <StatCard
              title="Operating Expenses"
              value={formatCurrency(report?.total_expenses ?? 0)}
              subtitle={`${report?.expenses_by_category.length ?? 0} categories`}
              icon={Receipt}
            />
            <StatCard
              title="Net Profit"
              value={formatCurrency(report?.net_profit ?? 0)}
              subtitle={`${(report?.net_margin ?? 0).toFixed(1)}% net margin`}
              positive={isProfit}
              icon={isProfit ? TrendingUp : TrendingDown}
              highlight
            />
          </div>

          {/* P&L Statement */}
          <Card>
            <CardHeader>
              <CardTitle>P&amp;L Statement</CardTitle>
              <CardDescription>
                {dateFrom === dateTo ? dateFrom : `${dateFrom} to ${dateTo}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 font-mono text-sm max-w-lg">
                <div className="flex justify-between py-1 border-b">
                  <span className="font-semibold">Revenue</span>
                  <span className="font-semibold">{formatCurrency(report?.revenue ?? 0)}</span>
                </div>
                <div className="flex justify-between py-1 text-muted-foreground pl-4">
                  <span>− Cost of Goods Sold (COGS)</span>
                  <span>({formatCurrency(report?.cogs ?? 0)})</span>
                </div>
                <div className="flex justify-between py-1 border-b font-semibold">
                  <span className={isGrossProfit ? 'text-green-700' : 'text-red-700'}>
                    = Gross Profit
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ({(report?.gross_margin ?? 0).toFixed(1)}%)
                    </span>
                  </span>
                  <span className={isGrossProfit ? 'text-green-700' : 'text-red-700'}>
                    {formatCurrency(report?.gross_profit ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between py-1 text-muted-foreground pl-4">
                  <span>− Operating Expenses</span>
                  <span>({formatCurrency(report?.total_expenses ?? 0)})</span>
                </div>
                {(report?.expenses_by_category ?? []).map((cat) => (
                  <div key={cat.category_id ?? 'uncategorized'} className="flex justify-between text-muted-foreground pl-8 text-xs py-0.5">
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: cat.category_color }}
                      />
                      {cat.category_name}
                    </span>
                    <span>({formatCurrency(cat.total_amount)})</span>
                  </div>
                ))}
                <div className="flex justify-between py-2 border-t-2 font-bold text-base">
                  <span className={isProfit ? 'text-green-700' : 'text-red-700'}>
                    = Net Profit
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ({(report?.net_margin ?? 0).toFixed(1)}%)
                    </span>
                  </span>
                  <span className={isProfit ? 'text-green-700' : 'text-red-700'}>
                    {formatCurrency(report?.net_profit ?? 0)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Daily Trend Chart */}
          {(report?.daily_trend?.length ?? 0) > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Daily Trend</CardTitle>
                <CardDescription>Revenue, gross profit, and net profit over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={report?.daily_trend ?? []}>
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorGross" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => v.slice(5)} // MM-DD
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`}
                        width={55}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        name="Revenue"
                        stroke="#3b82f6"
                        fill="url(#colorRevenue)"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Area
                        type="monotone"
                        dataKey="gross_profit"
                        name="Gross Profit"
                        stroke="#22c55e"
                        fill="url(#colorGross)"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Area
                        type="monotone"
                        dataKey="net_profit"
                        name="Net Profit"
                        stroke="#8b5cf6"
                        fill="url(#colorNet)"
                        strokeWidth={2}
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Expenses by Category */}
          {categoryData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Expenses by Category</CardTitle>
                <CardDescription>Top spending categories for the period</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={categoryData}
                      layout="vertical"
                      margin={{ left: 20, right: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`}
                      />
                      <YAxis
                        type="category"
                        dataKey="category_name"
                        tick={{ fontSize: 11 }}
                        width={110}
                      />
                      <Tooltip
                        formatter={(value) => formatCurrency(value as number)}
                        labelFormatter={(label) => label}
                      />
                      <Bar dataKey="total_amount" name="Amount" radius={[0, 4, 4, 0]}>
                        {categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.category_color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Expense detail table */}
          {(report?.expenses_by_category?.length ?? 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Expense Breakdown</CardTitle>
                <CardDescription>Summary by category</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Transactions</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">% of Expenses</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(report?.expenses_by_category ?? [])
                        .sort((a, b) => b.total_amount - a.total_amount)
                        .map((cat) => (
                          <TableRow key={cat.category_id ?? 'uncategorized'}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span
                                  className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: cat.category_color }}
                                />
                                {cat.category_name}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">{cat.count}</TableCell>
                            <TableCell className="text-right font-mono font-semibold">
                              {formatCurrency(cat.total_amount)}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {report && report.total_expenses > 0
                                ? `${((cat.total_amount / report.total_expenses) * 100).toFixed(1)}%`
                                : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      <TableRow className="font-bold border-t-2">
                        <TableCell>Total Expenses</TableCell>
                        <TableCell className="text-right">
                          {report?.expenses_by_category.reduce((s, c) => s + c.count, 0) ?? 0}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(report?.total_expenses ?? 0)}
                        </TableCell>
                        <TableCell className="text-right">100%</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
