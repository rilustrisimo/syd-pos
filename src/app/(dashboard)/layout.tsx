import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { AuthProvider } from '@/components/providers/auth-provider'
import { MobileSidebar } from '@/components/layout/mobile-sidebar'
import { BottomNav } from '@/components/layout/bottom-nav'
import { OrderNotificationListener } from '@/components/notifications/order-notification-listener'
import { NavTitleSync } from '@/components/nav-title-sync'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProvider>
      <NavTitleSync />
      <OrderNotificationListener />
      <div className="flex h-screen overflow-hidden">
        {/* Desktop sidebar - hidden on mobile */}
        <Sidebar />
        {/* Mobile sidebar - Sheet overlay */}
        <MobileSidebar />

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <Header />

          {/* Page content */}
          <main className="flex-1 overflow-y-auto bg-slate-50 p-4 pb-20 lg:p-6 lg:pb-6">
            {children}
          </main>
        </div>

        {/* Mobile bottom navigation */}
        <BottomNav />
      </div>
    </AuthProvider>
  )
}
