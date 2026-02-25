import AsyncStorage from '@react-native-async-storage/async-storage'
import { CreateTransactionPayload } from '@syd/api'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type QueuedTransaction = {
  id: string
  status: 'pending' | 'synced' | 'failed'
  transactionData: CreateTransactionPayload
  createdAt: string
  syncedAt?: string
  serverId?: string
}

type OfflineState = {
  queue: QueuedTransaction[]
  enqueue: (payload: CreateTransactionPayload) => void
  markSynced: (id: string, serverId?: string) => void
  markFailed: (id: string) => void
  remove: (id: string) => void
  clearSynced: () => void
}

export const useOfflineStore = create<OfflineState>()(
  persist(
    (set) => ({
      queue: [],
      enqueue: (payload) =>
        set((state) => ({
          queue: [
            ...state.queue,
            {
              id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
              status: 'pending',
              transactionData: payload,
              createdAt: new Date().toISOString(),
            },
          ],
        })),
      markSynced: (id, serverId) =>
        set((state) => ({
          queue: state.queue.map((item) =>
            item.id === id
              ? { ...item, status: 'synced', serverId, syncedAt: new Date().toISOString() }
              : item
          ),
        })),
      markFailed: (id) =>
        set((state) => ({
          queue: state.queue.map((item) => (item.id === id ? { ...item, status: 'failed' } : item)),
        })),
      remove: (id) => set((state) => ({ queue: state.queue.filter((item) => item.id !== id) })),
      clearSynced: () => set((state) => ({ queue: state.queue.filter((item) => item.status !== 'synced') })),
    }),
    {
      name: 'syd-pos-offline-queue',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
)
