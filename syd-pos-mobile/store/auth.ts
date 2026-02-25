import AsyncStorage from '@react-native-async-storage/async-storage'
import { Session, User } from '@supabase/supabase-js'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

type AuthState = {
  user: User | null
  session: Session | null
  hydrated: boolean
  sessionChecked: boolean
  /** Branch picked locally on this device (fallback when DB branch_id is null) */
  localBranchId: string | null
  /** Display name of the locally-selected branch */
  localBranchName: string | null
  setAuth: (user: User | null, session: Session | null) => void
  clearAuth: () => void
  setHydrated: (hydrated: boolean) => void
  setSessionChecked: (checked: boolean) => void
  setLocalBranch: (id: string | null, name: string | null) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      session: null,
      hydrated: false,
      sessionChecked: false,
      localBranchId: null,
      localBranchName: null,
      setAuth: (user, session) => set({ user, session }),
      clearAuth: () => set({ user: null, session: null, localBranchId: null, localBranchName: null }),
      setHydrated: (hydrated) => set({ hydrated }),
      setSessionChecked: (checked) => set({ sessionChecked: checked }),
      setLocalBranch: (id, name) => set({ localBranchId: id, localBranchName: name }),
    }),
    {
      name: 'syd-pos-auth',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true)
      },
    }
  )
)
