'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Menu, Search, User, LogOut, Settings, UserCircle } from 'lucide-react'
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
        <div className="flex items-center gap-4">
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
