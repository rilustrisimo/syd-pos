import { AuthProvider } from '@/components/providers/auth-provider'

export default function FrontlineLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProvider>
      <div className="h-screen overflow-hidden bg-slate-50 p-4 lg:p-6">
        {children}
      </div>
    </AuthProvider>
  )
}
