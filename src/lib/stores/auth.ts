import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { UserRole } from '@/types'

interface User {
  id: string
  email: string
  fullName: string
  role: UserRole
  branchId: string | null
}

interface AuthState {
  user: User | null
  isLoading: boolean
  sessionExpiresAt: number | null
  lastActivityAt: number | null
  setUser: (user: User | null) => void
  setLoading: (loading: boolean) => void
  setSessionExpiry: (expiresAt: number | null) => void
  updateLastActivity: () => void
  hasPermission: (permission: string) => boolean
  clear: () => void
  isSessionExpired: () => boolean
  isInactive: () => boolean
}

// Role-based permissions
const rolePermissions: Record<UserRole, string[]> = {
  admin: [
    'read', 'write', 'delete',
    'manage_users', 'manage_settings', 'manage_branches',
    'view_reports', 'view_analytics',
    'manage_inventory', 'manage_products', 'manage_suppliers',
    'process_sales', 'process_returns', 'apply_discounts',
    'manage_customers', 'manage_credit',
  ],
  manager: [
    'read', 'write',
    'view_reports', 'view_analytics',
    'manage_inventory', 'manage_products', 'manage_suppliers',
    'process_sales', 'process_returns', 'apply_discounts',
    'manage_customers',
  ],
  cashier: [
    'read',
    'process_sales', 'process_returns',
    'view_customers',
  ],
  inventory_staff: [
    'read', 'write',
    'manage_inventory', 'manage_products',
    'receive_purchases',
  ],
  accountant: [
    'read',
    'view_reports', 'view_analytics',
    'manage_credit', 'view_customers',
  ],
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: true,
      sessionExpiresAt: null,
      lastActivityAt: null,

      setUser: (user) => set({ user, isLoading: false, lastActivityAt: Date.now() }),

      setLoading: (isLoading) => set({ isLoading }),

      setSessionExpiry: (expiresAt) => set({ sessionExpiresAt: expiresAt }),

      updateLastActivity: () => set({ lastActivityAt: Date.now() }),

      isSessionExpired: () => {
        const { sessionExpiresAt } = get()
        if (!sessionExpiresAt) return false
        return Date.now() > sessionExpiresAt * 1000
      },

      isInactive: () => {
        const { lastActivityAt } = get()
        if (!lastActivityAt) return false
        // 1 day = 86400000 milliseconds
        const ONE_DAY = 86400000
        return Date.now() - lastActivityAt > ONE_DAY
      },

      hasPermission: (permission) => {
        const { user, isSessionExpired } = get()
        if (!user || isSessionExpired()) return false
        return rolePermissions[user.role]?.includes(permission) ?? false
      },

      clear: () => {
        // Clear all auth state
        set({ 
          user: null, 
          isLoading: false, 
          sessionExpiresAt: null,
          lastActivityAt: null 
        })
        
        // Clear localStorage persistence
        try {
          localStorage.removeItem('syd-pos-auth')
        } catch (error) {
          console.error('Failed to clear auth storage:', error)
        }
      },
    }),
    {
      name: 'syd-pos-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        sessionExpiresAt: state.sessionExpiresAt,
        lastActivityAt: state.lastActivityAt,
      }),
      version: 1,
      // Automatically clear if schema changes
      onRehydrateStorage: () => (state) => {
        // Check if session is expired on rehydration
        if (state?.sessionExpiresAt && Date.now() > state.sessionExpiresAt * 1000) {
          state.clear()
        }
      },
    }
  )
)

// Utility to clear all auth data (useful for forced logout)
export const clearAllAuthData = () => {
  try {
    useAuthStore.getState().clear()
    
    // Clear any other auth-related storage
    const authKeys = ['syd-pos-auth', 'supabase.auth.token']
    authKeys.forEach(key => {
      try {
        localStorage.removeItem(key)
        sessionStorage.removeItem(key)
      } catch (e) {
        console.error(`Failed to remove ${key}:`, e)
      }
    })
    
    // Clear session-specific data (filters, searches, etc.)
    const sessionKeys = ['products-filters']
    sessionKeys.forEach(key => {
      try {
        sessionStorage.removeItem(key)
      } catch (e) {
        console.error(`Failed to remove ${key}:`, e)
      }
    })
    
    // Clear all cookies (Supabase auth cookies)
    document.cookie.split(';').forEach((c) => {
      document.cookie = c
        .replace(/^ +/, '')
        .replace(/=.*/, `=;expires=${new Date().toUTCString()};path=/`)
    })
  } catch (error) {
    console.error('Failed to clear auth data:', error)
  }
}
