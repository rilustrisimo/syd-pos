import { AuthProvider } from '@/components/providers/auth-provider'
import { OrderNotificationListener } from '@/components/notifications/order-notification-listener'
import { PendingOrdersBanner } from '@/components/notifications/pending-orders-banner'

export default function FrontlineLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProvider>
      <OrderNotificationListener />
      <div className="flex h-screen flex-col overflow-hidden bg-slate-50">
        <PendingOrdersBanner />
        <div className="flex-1 overflow-hidden p-4 lg:p-6">
          {children}
        </div>
      </div>
    </AuthProvider>
  )
}
