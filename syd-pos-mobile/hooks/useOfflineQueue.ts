import { useEffect } from 'react'
import { CreateTransactionPayload } from '@syd/api'
import { useNetworkStatus } from './useNetworkStatus'
import { useOfflineStore } from '../store/offline'

type SyncTransaction = (payload: CreateTransactionPayload) => Promise<{ id?: string }>

export function useOfflineQueue(syncTransaction: SyncTransaction) {
  const { isOnline } = useNetworkStatus()
  const queue = useOfflineStore((state) => state.queue)
  const markSynced = useOfflineStore((state) => state.markSynced)
  const markFailed = useOfflineStore((state) => state.markFailed)

  useEffect(() => {
    if (!isOnline) return

    const pending = queue.filter((item) => item.status === 'pending' || item.status === 'failed')
    if (!pending.length) return

    let cancelled = false

    const sync = async () => {
      for (const item of pending) {
        if (cancelled) return

        try {
          const response = await syncTransaction(item.transactionData)
          markSynced(item.id, response?.id)
        } catch {
          markFailed(item.id)
        }
      }
    }

    sync().catch(() => null)

    return () => {
      cancelled = true
    }
  }, [isOnline, queue, syncTransaction, markSynced, markFailed])

  return {
    queue,
    isOnline,
    pendingCount: queue.filter((item) => item.status !== 'synced').length,
  }
}
