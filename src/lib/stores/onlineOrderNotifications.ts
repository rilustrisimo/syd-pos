import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface OnlineOrderNotificationStore {
  unreadCount: number
  lastSeenAt: string | null
  increment: () => void
  markAllRead: () => void
}

export const useOnlineOrderNotifications = create<OnlineOrderNotificationStore>()(
  persist(
    (set) => ({
      unreadCount: 0,
      lastSeenAt: null,
      increment: () => set(s => ({ unreadCount: s.unreadCount + 1 })),
      markAllRead: () => set({ unreadCount: 0, lastSeenAt: new Date().toISOString() }),
    }),
    { name: 'syd-online-order-notifications' }
  )
)
