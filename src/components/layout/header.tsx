'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Menu, Search, User, LogOut, Settings, UserCircle, CheckCheck, FileWarning, Banknote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useAuthStore, clearAllAuthData } from '@/lib/stores/auth'
import { useSidebarStore } from '@/lib/stores/sidebar'
import { getClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { useNotifications, useUnreadNotificationCount, useMarkNotificationRead, useMarkAllNotificationsRead } from '@/hooks/useNotifications'
import Link from 'next/link'

function NotificationBell() {
  const { data: notifications } = useNotifications()
  const { data: unreadCount } = useUnreadNotificationCount()
  const markReadMutation = useMarkNotificationRead()
  const markAllReadMutation = useMarkAllNotificationsRead()

  const getEntityHref = (n: { entity_type: string | null; entity_id: string | null }) => {
    if (!n.entity_type || !n.entity_id) return null
    if (n.entity_type === 'liability_payable') return `/liabilities/payables/${n.entity_id}`
    if (n.entity_type === 'liability_loan_schedule') return null
    return null
  }

  const getIcon = (type: string) => {
    if (type.startsWith('payable')) return <FileWarning className="h-3.5 w-3.5 text-amber-500 shrink-0" />
    if (type.startsWith('loan')) return <Banknote className="h-3.5 w-3.5 text-purple-500 shrink-0" />
    return <Bell className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {(unreadCount ?? 0) > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {(unreadCount ?? 0) > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[480px] overflow-y-auto">
        <div className="flex items-center justify-between px-3 py-2">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          {(unreadCount ?? 0) > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => markAllReadMutation.mutate()}
            >
              <CheckCheck className="mr-1 h-3 w-3" /> Mark all read
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        {!notifications || notifications.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            No notifications
          </div>
        ) : (
          notifications.slice(0, 15).map(n => {
            const href = getEntityHref(n)
            const content = (
              <div className={`flex gap-2 px-3 py-2.5 text-sm hover:bg-muted/50 cursor-pointer ${!n.is_read ? 'bg-blue-50/50' : ''}`}>
                <div className="mt-0.5">{getIcon(n.type)}</div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-tight ${!n.is_read ? 'font-semibold' : 'font-medium'}`}>{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(n.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                {!n.is_read && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />}
              </div>
            )

            return (
              <div
                key={n.id}
                onClick={() => {
                  if (!n.is_read) markReadMutation.mutate(n.id)
                }}
              >
                {href ? <Link href={href}>{content}</Link> : content}
              </div>
            )
          })
        )}
        <DropdownMenuSeparator />
        <div className="px-3 py-2">
          <Link href="/liabilities">
            <Button variant="ghost" size="sm" className="w-full text-xs">View all liabilities</Button>
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function Header() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const isLoading = useAuthStore((state) => state.isLoading)
  const toggleSidebar = useSidebarStore((state) => state.toggle)
  const [profileOpen, setProfileOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)

  // Prevent hydration mismatch by waiting for client-side mount
  useEffect(() => {
    setMounted(true)
  }, [])

  const getInitials = (name: string | undefined) => {
    if (!name) return 'U'
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const displayName = user?.fullName || user?.email?.split('@')[0] || 'User'
  const displayRole = user?.role?.replace('_', ' ') || (isLoading ? 'Loading...' : 'Not signed in')

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
      <header className="flex h-16 items-center justify-between border-b bg-white px-4 lg:px-6">
        {/* Left side: hamburger + search */}
        <div className="flex flex-1 items-center gap-3">
          {/* Hamburger - mobile only */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden shrink-0"
            onClick={toggleSidebar}
            aria-label="Toggle navigation menu"
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Search - responsive */}
          <div className="relative hidden sm:block w-full max-w-96">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search products, customers..."
              className="pl-9"
            />
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Notification Bell */}
          <NotificationBell />

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>
                    {mounted && user ? getInitials(displayName) : <User className="h-4 w-4" />}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden text-left md:block">
                  <p className="text-sm font-medium">
                    {mounted ? displayName : 'User'}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {mounted ? displayRole : '...'}
                  </p>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setProfileOpen(true)}>
                <UserCircle className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push('/settings')}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600" onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Profile Dialog */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>My Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="text-lg">
                  {user ? getInitials(displayName) : <User className="h-8 w-8" />}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-lg font-semibold">{displayName}</h3>
                <Badge variant="secondary" className="capitalize">
                  {displayRole}
                </Badge>
              </div>
            </div>
            <div className="space-y-3 rounded-lg border p-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Email</Label>
                <p className="text-sm">{user?.email || '-'}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Role</Label>
                <p className="text-sm capitalize">{user?.role?.replace('_', ' ') || '-'}</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
