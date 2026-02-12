import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { AuthProvider } from '@/components/providers/auth-provider'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProvider>
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <Header />

          {/* Page content */}
          <main className="flex-1 overflow-y-auto bg-slate-50 p-6">
            {children}
          </main>
        </div>
      </div>
    </AuthProvider>
  )
}
