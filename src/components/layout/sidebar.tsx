'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  ClipboardList,
  Users,
  Truck,
  BarChart3,
  Settings,
  LogOut,
  History,
  RotateCcw,
  Clock,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  BarChart,
  Receipt,
  Tag,
  Percent,
  Monitor,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { getClient } from '@/lib/supabase/client'
import { useAuthStore, clearAllAuthData } from '@/lib/stores/auth'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  {
    name: 'Point of Sale',
    href: '/pos',
    icon: ShoppingCart,
    children: [
      { name: 'New Sale', href: '/pos', icon: ShoppingCart },
      { name: 'Frontline POS', href: '/frontline', icon: Monitor, newTab: true },
      { name: 'Canvas', href: '/pos/canvas', icon: ClipboardList },
      { name: 'History', href: '/pos/history', icon: History },
      { name: 'Returns', href: '/pos/returns', icon: RotateCcw },
    ],
  },
  { name: 'Products', href: '/products', icon: Package },
  { name: 'Inventory', href: '/inventory', icon: Boxes },
  { name: 'Purchases', href: '/purchases', icon: ClipboardList },
  { name: 'Customers', href: '/customers', icon: Users },
  { name: 'Suppliers', href: '/suppliers', icon: Truck },
  {
    name: 'Expenses',
    href: '/expenses',
    icon: Receipt,
    children: [
      { name: 'Manage Expenses', href: '/expenses', icon: Receipt },
      { name: 'Categories', href: '/expenses/categories', icon: Tag },
    ],
  },
  {
    name: 'Reports',
    href: '/reports',
    icon: BarChart3,
    children: [
      { name: 'Sales', href: '/reports/sales', icon: TrendingUp },
      { name: 'P&L Report', href: '/reports/pl', icon: TrendingDown },
      { name: 'AR Aging', href: '/reports/ar-aging', icon: Clock },
      { name: 'Inventory Turnover', href: '/reports/inventory-turnover', icon: RefreshCw },
      { name: 'Profit Margin', href: '/reports/profit-margin', icon: Percent },
      { name: 'Supplier History', href: '/reports/supplier-history', icon: Truck },
      { name: 'Demand Forecast', href: '/reports/demand-forecast', icon: BarChart },
    ],
  },
]

const bottomNavigation = [
  { name: 'Settings', href: '/settings', icon: Settings },
]

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isSigningOut, setIsSigningOut] = useState(false)

  const handleSignOut = async () => {
    if (isSigningOut) return // Prevent double-click
    setIsSigningOut(true)
    
    try {
      const supabase = getClient()
      
      // Sign out from Supabase
      await supabase.auth.signOut()
      
      // Clear all local state and storage
      clearAllAuthData()
      
      // Clear React Query cache
      queryClient.clear()
      
      // Hard redirect to ensure everything is cleared
      window.location.href = '/login'
    } catch (error) {
      console.error('Sign out error:', error)
      // Even if sign out fails, clear local state
      clearAllAuthData()
      queryClient.clear()
      window.location.href = '/login'
    }
  }

  return (
    <>
      {/* Logo */}
      <Link href="/" className="flex h-16 items-center gap-3 border-b border-slate-800 px-3">
        <div className="relative w-16 h-10 flex-shrink-0">
          <Image
            src="/syd-logo.svg"
            alt="SYD Logo"
            fill
            className="object-contain"
            priority
          />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[10px] leading-tight font-semibold tracking-tight text-[#ffc107]">
            SYD CONSTRUCTION<br />
            SUPPLIES TRADING
          </h1>
        </div>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        {navigation.map((item) => {
          const hasChildren = 'children' in item && item.children
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href))

          if (hasChildren) {
            return (
              <div key={item.name}>
                <div
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                    isActive
                      ? 'text-[#ffc107]'
                      : 'text-slate-400'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </div>
                <div className="ml-4 mt-1 space-y-1">
                  {item.children.map((child: any) => {
                    const isChildActive = pathname === child.href
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={onNavigate}
                        target={child.newTab ? '_blank' : undefined}
                        rel={child.newTab ? 'noopener noreferrer' : undefined}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition-colors',
                          isChildActive
                            ? 'bg-[#ffc107]/10 text-[#ffc107] border border-[#ffc107]/30'
                            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                        )}
                      >
                        <child.icon className="h-4 w-4" />
                        {child.name}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          }

          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-[#ffc107]/10 text-[#ffc107] border border-[#ffc107]/30'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          )
        })}
      </nav>

      {/* Bottom navigation */}
      <div className="border-t border-slate-800 px-3 py-4">
        {bottomNavigation.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-[#ffc107]/10 text-[#ffc107] border border-[#ffc107]/30'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          )
        })}
        <Separator className="my-3 bg-slate-800" />
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-slate-400 hover:bg-slate-800 hover:text-white"
          onClick={handleSignOut}
        >
          <LogOut className="h-5 w-5" />
          Sign Out
        </Button>
      </div>
    </>
  )
}

export function Sidebar() {
  return (
    <div className="hidden lg:flex h-full w-64 flex-col bg-slate-900 text-white">
      <SidebarContent />
    </div>
  )
}
