import { AuthProvider } from '@/components/providers/auth-provider'
import { OrderNotificationListener } from '@/components/notifications/order-notification-listener'

export default function FrontlineLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProvider>
      <OrderNotificationListener />
      <div className="h-screen overflow-hidden bg-slate-50 p-4 lg:p-6">
        {children}
      </div>
    </AuthProvider>
  )
}
