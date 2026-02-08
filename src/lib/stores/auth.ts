import { create } from 'zustand'
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
  setUser: (user: User | null) => void
  setLoading: (loading: boolean) => void
  hasPermission: (permission: string) => boolean
  clear: () => void
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

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,

  setUser: (user) => set({ user, isLoading: false }),

  setLoading: (isLoading) => set({ isLoading }),

  hasPermission: (permission) => {
    const { user } = get()
    if (!user) return false
    return rolePermissions[user.role]?.includes(permission) ?? false
  },

  clear: () => set({ user: null, isLoading: false }),
}))
