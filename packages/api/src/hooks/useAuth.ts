import React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, getCurrentUser, login, logout, signup } from '../supabase'
import { AuthUser, Branch } from '../types'

const AUTH_QUERY_KEY = ['auth']

/**
 * Hook to get the current authenticated user
 */
export const useAuth = () => {
  return useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: async () => {
      const user = await getCurrentUser()
      if (!user) {
        return null
      }

      // Get user's profile from database
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()

      if (error) {
        console.error('Error fetching user profile:', error)
        return null
      }

      return {
        id: user.id,
        email: user.email || '',
        branch_id: data?.branch_id || null,
        role: data?.role || 'cashier',
        full_name: data?.full_name || '',
        is_active: data?.is_active,
      } as AuthUser
    },
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

/**
 * Hook to login user
 */
export const useLogin = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      return login(email, password)
    },
    onSuccess: () => {
      // Invalidate auth query to refetch user
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY })
    },
    onError: (error: Error) => {
      console.error('Login failed:', error)
      throw error
    },
  })
}

/**
 * Hook to logout user
 */
export const useLogout = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      // Clear all queries on logout
      queryClient.clear()
    },
    onError: (error: Error) => {
      console.error('Logout failed:', error)
      throw error
    },
  })
}

/**
 * Hook to signup new user
 */
export const useSignup = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      return signup(email, password)
    },
    onSuccess: () => {
      // Invalidate auth query after signup
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY })
    },
    onError: (error: Error) => {
      console.error('Signup failed:', error)
      throw error
    },
  })
}

/**
 * Hook to listen for auth state changes
 */
export const useAuthStateChange = (callback: (user: AuthUser | null) => void) => {
  const { data: user } = useAuth()

  // Set up listener for auth changes
  React.useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        callback(user || null)
      }
    })

    return () => {
      listener?.subscription.unsubscribe()
    }
  }, [user, callback])
}

/**
 * Hook to fetch all active branches
 */
export const useBranches = (options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name, code, address')
        .eq('is_active', true)
        .order('name')

      if (error) {
        throw new Error(`Failed to fetch branches: ${error.message}`)
      }

      return (data || []) as Pick<Branch, 'id' | 'name' | 'code' | 'address'>[]
    },
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
    enabled: options?.enabled !== false,
    retry: 2,
  })
}

export default useAuth
