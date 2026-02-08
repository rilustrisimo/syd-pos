import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DollarSign, ShoppingCart, Package, Users, TrendingUp, AlertTriangle } from 'lucide-react'

// Dashboard stats cards
const stats = [
  {
    title: "Today's Sales",
    value: '₱0.00',
    description: '0 transactions',
    icon: DollarSign,
    trend: '+0%',
  },
  {
    title: 'Pending Orders',
    value: '0',
    description: 'Awaiting processing',
    icon: ShoppingCart,
  },
  {
    title: 'Low Stock Items',
    value: '0',
    description: 'Need reordering',
    icon: AlertTriangle,
    className: 'text-amber-600',
  },
  {
    title: 'Total Products',
    value: '0',
    description: 'Active products',
    icon: Package,
  },
  {
    title: 'Total Customers',
    value: '0',
    description: 'Registered customers',
    icon: Users,
  },
  {
    title: 'Monthly Revenue',
    value: '₱0.00',
    description: 'This month',
    icon: TrendingUp,
    trend: '+0%',
  },
]

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to SYD Construction Supplies POS System
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-5 w-5 text-muted-foreground ${stat.className || ''}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                {stat.description}
                {stat.trend && (
                  <span className="ml-2 text-green-600">{stat.trend}</span>
                )}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks and shortcuts</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <a
              href="/pos"
              className="flex items-center gap-3 rounded-lg border p-3 hover:bg-slate-50"
            >
              <ShoppingCart className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">New Sale</p>
                <p className="text-sm text-muted-foreground">Start a new POS transaction</p>
              </div>
            </a>
            <a
              href="/products"
              className="flex items-center gap-3 rounded-lg border p-3 hover:bg-slate-50"
            >
              <Package className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Add Product</p>
                <p className="text-sm text-muted-foreground">Add a new product to inventory</p>
              </div>
            </a>
            <a
              href="/customers"
              className="flex items-center gap-3 rounded-lg border p-3 hover:bg-slate-50"
            >
              <Users className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Add Customer</p>
                <p className="text-sm text-muted-foreground">Register a new customer</p>
              </div>
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest transactions and updates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-32 items-center justify-center text-muted-foreground">
              No recent activity
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
