'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DollarSign,
  ShoppingCart,
  Package,
  Users,
  TrendingUp,
  AlertTriangle,
  Clock,
  CreditCard,
  Loader2,
  RefreshCw,
  ArrowRight,
  Landmark,
  FileWarning,
  Banknote,
} from 'lucide-react'
import Link from 'next/link'
import {
  useDashboardStats,
  useSalesTrend,
  useTopProducts,
  useHourlySales,
  useLowStockItems,
  useRecentTransactions,
} from '@/hooks/useDashboard'
import { useUpcomingPayments } from '@/hooks/useLiabilities'
import { formatCurrency, formatDate, formatTime } from '@/lib/utils/formatting'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from 'recharts'

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  iconColor,
  href,
}: {
  title: string
  value: string
  description: string
  icon: React.ElementType
  trend?: string
  iconColor?: string
  href?: string
}) {
  const content = (
    <Card className={href ? 'hover:bg-muted/50 transition-colors cursor-pointer' : ''}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-5 w-5 ${iconColor || 'text-muted-foreground'}`} />
      </CardHeader>
      <CardContent>
        <div className="text-xl sm:text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">
          {description}
          {trend && <span className="ml-2 text-green-600">{trend}</span>}
        </p>
      </CardContent>
    </Card>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }

  return content
}

function SalesTrendChart({ data }: { data: { date: string; sales: number }[] }) {
  const chartData = data.slice(-14).map(d => ({
    ...d,
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={chartData}>
        <defs>
          <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="date" className="text-xs" tick={{ fill: 'currentColor' }} />
        <YAxis
          className="text-xs"
          tick={{ fill: 'currentColor' }}
          tickFormatter={(value) => `₱${(value / 1000).toFixed(0)}k`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--popover))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
          }}
          formatter={(value) => [formatCurrency(value as number), 'Sales']}
        />
        <Area
          type="monotone"
          dataKey="sales"
          stroke="#3b82f6"
          strokeWidth={2}
          fill="url(#colorSales)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function HourlySalesChart({ data }: { data: { hour: number; sales: number }[] }) {
  const chartData = data.map(d => ({
    ...d,
    label: `${d.hour}:00`
  }))

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="label" className="text-xs" tick={{ fill: 'currentColor' }} />
        <YAxis
          className="text-xs"
          tick={{ fill: 'currentColor' }}
          tickFormatter={(value) => `₱${value.toLocaleString()}`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--popover))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
          }}
          formatter={(value) => [formatCurrency(value as number), 'Sales']}
        />
        <Bar dataKey="sales" fill="#22c55e" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useDashboardStats()
  const { data: salesTrend, isLoading: trendLoading } = useSalesTrend(30)
  const { data: topProducts, isLoading: productsLoading } = useTopProducts(7)
  const { data: hourlySales, isLoading: hourlyLoading } = useHourlySales()
  const { data: lowStock, isLoading: lowStockLoading } = useLowStockItems()
  const { data: recentTxns, isLoading: recentLoading } = useRecentTransactions()
  const { data: upcomingPayments, isLoading: upcomingLoading } = useUpcomingPayments(7)

  const isLoading = statsLoading

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome to SYD Construction Supplies POS System
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetchStats()}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh
        </Button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          title="Today's Sales"
          value={stats ? formatCurrency(stats.todaySales) : '₱0.00'}
          description={`${stats?.todayTransactions || 0} transactions`}
          icon={DollarSign}
          href="/pos/history"
        />
        <StatCard
          title="This Month"
          value={stats ? formatCurrency(stats.monthSales) : '₱0.00'}
          description={`${stats?.monthTransactions || 0} transactions`}
          icon={TrendingUp}
        />
        <StatCard
          title="Unpaid Today"
          value={stats?.unpaidTransactions?.toString() || '0'}
          description="Pending payment"
          icon={Clock}
          iconColor={stats?.unpaidTransactions ? 'text-amber-500' : undefined}
          href="/pos/history"
        />
        <StatCard
          title="Low Stock"
          value={stats?.lowStockCount?.toString() || '0'}
          description="Items need reorder"
          icon={AlertTriangle}
          iconColor={stats?.lowStockCount ? 'text-red-500' : undefined}
          href="/inventory/alerts"
        />
        <StatCard
          title="Total Products"
          value={stats?.totalProducts?.toString() || '0'}
          description="Active products"
          icon={Package}
          href="/products"
        />
        <StatCard
          title="Outstanding AR"
          value={stats ? formatCurrency(stats.totalOutstanding) : '₱0.00'}
          description={`${stats?.totalCustomers || 0} customers`}
          icon={CreditCard}
          iconColor={stats?.totalOutstanding ? 'text-orange-500' : undefined}
          href="/reports/ar-aging"
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Sales Trend Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Sales Trend</CardTitle>
            <CardDescription>Last 14 days sales performance</CardDescription>
          </CardHeader>
          <CardContent>
            {trendLoading ? (
              <div className="flex h-[300px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : salesTrend && salesTrend.length > 0 ? (
              <SalesTrendChart data={salesTrend} />
            ) : (
              <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                No sales data yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Hourly Sales Today */}
        <Card>
          <CardHeader>
            <CardTitle>Today's Hourly Sales</CardTitle>
            <CardDescription>Sales breakdown by hour</CardDescription>
          </CardHeader>
          <CardContent>
            {hourlyLoading ? (
              <div className="flex h-[200px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : hourlySales && hourlySales.some(h => h.sales > 0) ? (
              <HourlySalesChart data={hourlySales} />
            ) : (
              <div className="flex h-[200px] items-center justify-center text-muted-foreground">
                No sales today
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Top Products */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Top Products</CardTitle>
              <CardDescription>Best sellers this week</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {productsLoading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : topProducts && topProducts.length > 0 ? (
              <div className="space-y-3">
                {topProducts.slice(0, 5).map((product, index) => (
                  <div key={product.product_id} className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{product.product_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {product.quantity_sold} sold
                      </p>
                    </div>
                    <span className="text-sm font-medium">
                      {formatCurrency(product.total_revenue)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-32 items-center justify-center text-muted-foreground">
                No sales this week
              </div>
            )}
          </CardContent>
        </Card>

        {/* Low Stock Alerts */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Low Stock Alerts</CardTitle>
              <CardDescription>Items below reorder point</CardDescription>
            </div>
            <Link href="/inventory/alerts">
              <Button variant="ghost" size="sm">
                View All <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {lowStockLoading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : lowStock && lowStock.length > 0 ? (
              <div className="space-y-3">
                {lowStock.slice(0, 5).map((item) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.code}</p>
                    </div>
                    <Badge variant={item.quantity_on_hand === 0 ? 'destructive' : 'secondary'}>
                      {item.quantity_on_hand} left
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-32 items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Package className="mx-auto h-8 w-8 mb-2" />
                  <p>All items stocked</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Transactions</CardTitle>
              <CardDescription>Latest sales activity</CardDescription>
            </div>
            <Link href="/pos/history">
              <Button variant="ghost" size="sm">
                View All <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentLoading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : recentTxns && recentTxns.length > 0 ? (
              <div className="space-y-3">
                {recentTxns.map((txn) => (
                  <div key={txn.id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{txn.transaction_number}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {txn.customer_name}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatCurrency(txn.total_amount)}</p>
                      <Badge
                        variant={
                          txn.payment_status === 'paid'
                            ? 'default'
                            : txn.payment_status === 'partial'
                            ? 'secondary'
                            : 'destructive'
                        }
                        className="text-xs"
                      >
                        {txn.payment_status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-32 items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <ShoppingCart className="mx-auto h-8 w-8 mb-2" />
                  <p>No transactions yet</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Liability Payments */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="h-5 w-5 text-muted-foreground" />
              Upcoming Payments
            </CardTitle>
            <CardDescription>Liabilities due in the next 7 days</CardDescription>
          </div>
          <Link href="/liabilities">
            <Button variant="ghost" size="sm">
              View All <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {upcomingLoading ? (
            <div className="flex h-20 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : upcomingPayments && upcomingPayments.length > 0 ? (
            <div className="space-y-2">
              {upcomingPayments.slice(0, 5).map((item) => (
                <div key={item.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${item.days_until_due < 0 ? 'border-red-200 bg-red-50' : item.days_until_due <= 3 ? 'border-amber-200 bg-amber-50' : ''}`}>
                  <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded ${item.type === 'payable' ? 'bg-amber-100' : 'bg-purple-100'}`}>
                    {item.type === 'payable'
                      ? <FileWarning className="h-3 w-3 text-amber-600" />
                      : <Banknote className="h-3 w-3 text-purple-600" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-xs">{item.reference}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-sm">{formatCurrency(item.amount_due)}</p>
                    <p className={`text-xs ${item.days_until_due < 0 ? 'text-red-600 font-medium' : item.days_until_due <= 3 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                      {item.days_until_due < 0 ? `${Math.abs(item.days_until_due)}d overdue` : item.days_until_due === 0 ? 'Due today' : `${item.days_until_due}d left`}
                    </p>
                  </div>
                </div>
              ))}
              {upcomingPayments.length > 5 && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  +{upcomingPayments.length - 5} more — <Link href="/liabilities/cashflow" className="underline">see all</Link>
                </p>
              )}
            </div>
          ) : (
            <div className="flex h-20 items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Landmark className="mx-auto h-6 w-6 mb-1" />
                <p className="text-sm">No payments due in the next 7 days</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common tasks and shortcuts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Link
              href="/pos"
              className="flex items-center gap-3 rounded-lg border p-4 hover:bg-muted/50 transition-colors"
            >
              <ShoppingCart className="h-6 w-6 text-primary" />
              <div>
                <p className="font-medium">New Sale</p>
                <p className="text-sm text-muted-foreground">Start a POS transaction</p>
              </div>
            </Link>
            <Link
              href="/products/new"
              className="flex items-center gap-3 rounded-lg border p-4 hover:bg-muted/50 transition-colors"
            >
              <Package className="h-6 w-6 text-primary" />
              <div>
                <p className="font-medium">Add Product</p>
                <p className="text-sm text-muted-foreground">Add new inventory item</p>
              </div>
            </Link>
            <Link
              href="/purchases/new"
              className="flex items-center gap-3 rounded-lg border p-4 hover:bg-muted/50 transition-colors"
            >
              <TrendingUp className="h-6 w-6 text-primary" />
              <div>
                <p className="font-medium">Create PO</p>
                <p className="text-sm text-muted-foreground">New purchase order</p>
              </div>
            </Link>
            <Link
              href="/reports/ar-aging"
              className="flex items-center gap-3 rounded-lg border p-4 hover:bg-muted/50 transition-colors"
            >
              <CreditCard className="h-6 w-6 text-primary" />
              <div>
                <p className="font-medium">AR Aging</p>
                <p className="text-sm text-muted-foreground">View receivables</p>
              </div>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
