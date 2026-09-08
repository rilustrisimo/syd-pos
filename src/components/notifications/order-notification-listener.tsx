'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { getClient } from '@/lib/supabase/client'
import { useOnlineOrderNotifications } from '@/lib/stores/onlineOrderNotifications'

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
  const { increment } = useOnlineOrderNotifications()
  const queryClient = useQueryClient()
  const channelRef = useRef<ReturnType<ReturnType<typeof getClient>['channel']> | null>(null)

  useEffect(() => {
    const supabase = getClient()

    if (channelRef.current) return

    const channel = supabase
      .channel('online-orders-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'online_orders' },
        (payload) => {
          const order = payload.new as any
          increment()
          playBell()
          queryClient.invalidateQueries({ queryKey: ['online_orders', 'pending-banner'] })

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

    return () => {
      channel.unsubscribe()
      channelRef.current = null
    }
  }, [increment, queryClient])

  return null
}
