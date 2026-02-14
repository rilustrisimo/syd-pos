'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getClient } from '@/lib/supabase/client'
import { useAuthStore, clearAllAuthData } from '@/lib/stores/auth'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { setUser, setLoading, setSessionExpiry, clear, isSessionExpired } = useAuthStore()
  const sessionCheckInterval = useRef<NodeJS.Timeout | null>(null)
  const isHandlingAuthChange = useRef(false)

  // Complete sign out with full cleanup
  const handleCompleteSignOut = useCallback(async (showToast = false) => {
    if (isHandlingAuthChange.current) return
    isHandlingAuthChange.current = true

    try {
      const supabase = getClient()
      
      // Sign out from Supabase
      await supabase.auth.signOut()
      
      // Clear all local state and storage
      clearAllAuthData()
      
      // Clear React Query cache
      queryClient.clear()
      
      if (showToast) {
        toast.info('You have been signed out')
      }
      
      // Hard redirect to clear any remaining state
      window.location.href = '/login'
    } catch (error) {
      console.error('Sign out error:', error)
      // Even if sign out fails, clear local state
      clearAllAuthData()
      queryClient.clear()
      window.location.href = '/login'
    } finally {
      isHandlingAuthChange.current = false
    }
  }, [queryClient])

  const loadUser = useCallback(async (userId: string, email: string, expiresAt?: number) => {
    const supabase = getClient()

    try {
      const { data: userData, error } = await supabase
        .from('users')
        .select('id, full_name, role, branch_id, is_active')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('Error loading user profile:', error)
        setLoading(false)
        toast.error('Failed to load user profile')
        return
      }

      if (!userData) {
        console.error('No user data found for user id:', userId)
        setLoading(false)
        toast.error('User profile not found')
        return
      }

      // Check if user is active
      if (!(userData as any).is_active) {
        console.warn('User account is inactive')
        toast.error('Your account has been deactivated')
        await handleCompleteSignOut()
        return
      }

      console.log('User loaded successfully:', userData.full_name)
      
      setUser({
        id: (userData as any).id,
        email,
        fullName: (userData as any).full_name,
        role: (userData as any).role,
        branchId: (userData as any).branch_id,
      })

      // Store session expiry time
      if (expiresAt) {
        setSessionExpiry(expiresAt)
      }
    } catch (error) {
      console.error('Unexpected error loading user:', error)
      setLoading(false)
      toast.error('An error occurred while loading your profile')
    }
  }, [setUser, setSessionExpiry, setLoading, handleCompleteSignOut])

  useEffect(() => {
    const supabase = getClient()

    // Check if session is expired on mount
    if (isSessionExpired()) {
      console.warn('Session expired on mount')
      handleCompleteSignOut(true)
      return
    }

    // Initial session check
    const initSession = async () => {
      setLoading(true)
      
      try {
        const { data: { session }, error } = await supabase.auth.getSession()

        if (error) {
          console.error('Error getting session:', error)
          await handleCompleteSignOut()
          return
        }

        if (session?.user) {
          const expiresAt = session.expires_at
          
          // Check if session is about to expire or already expired
          if (expiresAt && Date.now() > expiresAt * 1000) {
            console.warn('Session already expired')
            await handleCompleteSignOut(true)
            return
          }
          
          await loadUser(session.user.id, session.user.email || '', expiresAt)
        } else {
          clear()
          setLoading(false)
          router.push('/login')
        }
      } catch (error) {
        console.error('Unexpected error in initSession:', error)
        await handleCompleteSignOut()
      }
    }

    initSession()

    // Session expiry checker (runs every minute)
    sessionCheckInterval.current = setInterval(() => {
      if (isSessionExpired()) {
        console.warn('Session expired during runtime')
        toast.warning('Your session has expired. Please login again.')
        handleCompleteSignOut()
      }
    }, 60000) // Check every minute

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state change:', event)
        
        if (isHandlingAuthChange.current) {
          console.log('Already handling auth change, skipping...')
          return
        }

        if (event === 'SIGNED_OUT') {
          isHandlingAuthChange.current = true
          await handleCompleteSignOut()
          isHandlingAuthChange.current = false
        } else if (event === 'TOKEN_REFRESHED') {
          console.log('Token refreshed')
          if (session?.expires_at) {
            setSessionExpiry(session.expires_at)
          }
        } else if (event === 'USER_UPDATED' && session?.user) {
          // Refresh user data only if needed
          const { user } = useAuthStore.getState()
          if (user) {
            console.log('User updated, reloading profile')
            await loadUser(session.user.id, session.user.email || '', session.expires_at)
          }
        }
        // Note: SIGNED_IN is handled by initSession, not here to avoid double-loading
      }
    )

    return () => {
      subscription.unsubscribe()
      if (sessionCheckInterval.current) {
        clearInterval(sessionCheckInterval.current)
      }
    }
  }, [loadUser, setLoading, clear, router, handleCompleteSignOut, isSessionExpired, setSessionExpiry])

  return <>{children}</>
}
