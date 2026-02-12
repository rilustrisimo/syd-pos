'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  MoreHorizontal,
} from 'lucide-react'
import { useSidebarStore } from '@/lib/stores/sidebar'

const bottomTabs = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'POS', href: '/pos', icon: ShoppingCart },
  { name: 'Products', href: '/products', icon: Package },
  { name: 'Inventory', href: '/inventory', icon: Boxes },
  { name: 'More', href: null, icon: MoreHorizontal },
]

export function BottomNav() {
  const pathname = usePathname()
  const openSidebar = useSidebarStore((state) => state.open)

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white lg:hidden">
      <div className="flex h-16 items-center justify-around">
        {bottomTabs.map((tab) => {
          if (tab.href === null) {
            return (
              <button
                key={tab.name}
                onClick={openSidebar}
                className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-muted-foreground"
              >
                <tab.icon className="h-5 w-5" />
                <span className="text-xs">{tab.name}</span>
              </button>
            )
          }

          const isActive =
            tab.href === '/'
              ? pathname === '/'
              : pathname.startsWith(tab.href)

          return (
            <Link
              key={tab.name}
              href={tab.href}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground'
              )}
            >
              <tab.icon className={cn('h-5 w-5', isActive && 'stroke-[2.5]')} />
              <span className={cn('text-xs', isActive && 'font-medium')}>
                {tab.name}
              </span>
            </Link>
          )
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  )
}
