import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type UserRole = 'admin' | 'manager' | 'cashier' | 'inventory_staff'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  branch_id?: string
}

interface AuthState {
  user: User | null
  setUser: (user: User | null) => void
  clearUser: () => void
  isAdmin: () => boolean
  isManager: () => boolean
  canManageInventory: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      setUser: (user) => set({ user }),
      clearUser: () => set({ user: null }),
      isAdmin: () => get().user?.role === 'admin',
      isManager: () => {
        const role = get().user?.role
        return role === 'admin' || role === 'manager'
      },
      canManageInventory: () => {
        const role = get().user?.role
        return role === 'admin' || role === 'manager' || role === 'inventory_staff'
      },
    }),
    {
      name: 'auth-storage',
    }
  )
)
