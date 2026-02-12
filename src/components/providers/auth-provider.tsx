'use client'

import { useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/lib/stores/auth'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { setUser, setLoading, clear } = useAuthStore()

  const loadUser = useCallback(async (userId: string, email: string) => {
    const supabase = getClient()

    const { data: userData, error } = await supabase
      .from('users')
      .select('id, full_name, role, branch_id')
      .eq('auth_id', userId)
      .single()

    if (error || !userData) {
      clear()
      return
    }

    setUser({
      id: (userData as any).id,
      email,
      fullName: (userData as any).full_name,
      role: (userData as any).role,
      branchId: (userData as any).branch_id,
    })
  }, [setUser, clear])

  useEffect(() => {
    const supabase = getClient()

    // Initial session check
    const initSession = async () => {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()

      if (session?.user) {
        await loadUser(session.user.id, session.user.email || '')
      } else {
        clear()
        router.push('/login')
      }
    }

    initSession()

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          clear()
          router.push('/login')
        } else if (event === 'SIGNED_IN' && session.user) {
          await loadUser(session.user.id, session.user.email || '')
        } else if (event === 'TOKEN_REFRESHED' && session.user) {
          // Session refreshed, ensure user is still loaded
          const { user } = useAuthStore.getState()
          if (!user) {
            await loadUser(session.user.id, session.user.email || '')
          }
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [loadUser, setLoading, clear, router])

  return <>{children}</>
}
