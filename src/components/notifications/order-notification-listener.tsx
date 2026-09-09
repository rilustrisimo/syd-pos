'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { getClient } from '@/lib/supabase/client'
import { usePendingOnlineOrdersBanner, type PendingOnlineOrderSummary } from '@/hooks/useOnlineOrders'

function playBell() {
  try {
    const AudioCtx = window.AudioContext ?? (window as any).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()

    // Two-tone bell chime: high note then mid note
    const notes = [
      { freq: 1047, start: 0, duration: 0.8 },
      { freq: 784, start: 0.15, duration: 0.8 },
    ]

    notes.forEach(({ freq, start, duration }) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.25, ctx.currentTime + start)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + duration)
    })

    // Explicitly release the context once the chime finishes, rather than
    // leaving it to be garbage-collected — a new AudioContext is created
    // per notification, and some browsers cap how many can exist at once,
    // so this keeps a busy order day from accumulating live contexts.
    const longestNote = Math.max(...notes.map(n => n.start + n.duration))
    setTimeout(() => ctx.close().catch(() => {}), (longestNote + 0.2) * 1000)
  } catch {
    // Browser may block AudioContext without user interaction — fail silently
  }
}

function formatPrice(amount: number) {
  return '₱' + Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

// Opens in a new tab/window rather than navigating in-place — in the
// Electron desktop app, main.ts's setWindowOpenHandler intercepts this
// and routes it to the system's default browser instead of the app
// window, per product requirement. In a normal browser it just opens a
// new tab, which also avoids losing whatever page staff were on.
function openOrder(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function OrderNotificationListener() {
  const queryClient = useQueryClient()
  const channelRef = useRef<ReturnType<ReturnType<typeof getClient>['channel']> | null>(null)
  // Tracks pending order IDs already alerted on, from either path below.
  // null means "haven't seen an initial poll yet" — used to avoid mass-
  // firing toasts for every already-pending order the moment the app
  // starts up.
  const seenOrderIds = useRef<Set<string> | null>(null)

  function notifyNewOrder(order: { id: string; order_number: string; customer_name: string; total_amount: number; fulfillment: string }) {
    playBell()
    toast.info(
      `New Online Order — ${order.order_number}`,
      {
        description: `${order.customer_name} · ${formatPrice(order.total_amount)} · ${order.fulfillment}`,
        duration: 0, // persist until dismissed
        action: {
          label: 'View',
          onClick: () => openOrder(`/orders/online/${order.id}`),
        },
      }
    )
  }

  useEffect(() => {
    const supabase = getClient()

    function subscribe() {
      const channel = supabase
        .channel('online-orders-realtime')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'online_orders' },
          (payload) => {
            const order = payload.new as any
            seenOrderIds.current?.add(order.id)
            notifyNewOrder(order)
            queryClient.invalidateQueries({ queryKey: ['online_orders', 'pending-banner'] })
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'online_orders' },
          () => {
            // Keeps the pending-orders banner live when staff change an
            // order's status away from (or into) "pending" — no toast/chime
            // needed for updates, just refresh the banner's data.
            queryClient.invalidateQueries({ queryKey: ['online_orders', 'pending-banner'] })
          }
        )
        .subscribe()

      channelRef.current = channel
    }

    if (!channelRef.current) subscribe()

    // Browsers throttle timers (and, with them, a WebSocket's keep-alive
    // heartbeat) on backgrounded tabs to save power — a connection can go
    // quietly stale while the tab isn't in focus, with no client-side
    // error to react to. Rather than trust a connection that may have
    // been sitting untested for a while, force a fresh one the moment the
    // tab becomes visible again, and immediately resync in case anything
    // was missed while it was away.
    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
      subscribe()
      queryClient.invalidateQueries({ queryKey: ['online_orders', 'pending-banner'] })
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [queryClient])

  // Polling-based fallback — the desktop app's WebSocket has been observed
  // to connect at launch but not reliably survive/reconnect over a long
  // session, silently going stale with no client-side error. This hook
  // polls every 30s (see usePendingOnlineOrdersBanner) regardless of
  // whether realtime is actually delivering events, so a genuinely new
  // pending order still gets a toast/chime even if the WebSocket is dead —
  // diffed against seenOrderIds so it never double-fires for something
  // realtime already alerted on.
  const { data: pendingOrders } = usePendingOnlineOrdersBanner()

  useEffect(() => {
    if (!pendingOrders) return

    if (seenOrderIds.current === null) {
      // First load: just record what's already pending. These aren't new
      // arrivals, so don't alert on them.
      seenOrderIds.current = new Set(pendingOrders.map(o => o.id))
      return
    }

    for (const order of pendingOrders as PendingOnlineOrderSummary[]) {
      if (!seenOrderIds.current.has(order.id)) {
        seenOrderIds.current.add(order.id)
        notifyNewOrder(order)
      }
    }

    // Reset to exactly the current pending set — bounded by how many
    // orders are pending right now rather than growing for the life of
    // the session.
    seenOrderIds.current = new Set(pendingOrders.map(o => o.id))
  }, [pendingOrders])

  return null
}
