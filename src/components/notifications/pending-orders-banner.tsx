'use client'

import { useState } from 'react'
import { Bell, X } from 'lucide-react'
import { usePendingOnlineOrdersBanner } from '@/hooks/useOnlineOrders'

function formatPrice(amount: number) {
  return '₱' + Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

// Opens externally (Electron routes this to the system browser via
// setWindowOpenHandler in main.ts) instead of navigating in-place.
function openOrder(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function PendingOrdersBanner() {
  const { data: pendingOrders = [] } = usePendingOnlineOrdersBanner()
  const [dismissedSignature, setDismissedSignature] = useState<string | null>(null)

  const signature = pendingOrders.map((o) => o.id).sort().join(',')
  const isDismissed = dismissedSignature === signature
  if (pendingOrders.length === 0 || isDismissed) return null

  const single = pendingOrders.length === 1 ? pendingOrders[0] : null

  return (
    <div className="flex items-center gap-3 bg-blue-600 text-white px-4 py-2 text-sm">
      <Bell className="h-4 w-4 flex-shrink-0 animate-pulse" />
      <p className="flex-1 min-w-0 truncate">
        {single ? (
          <>
            <span className="font-semibold">New order — {single.order_number}</span>
            {' · '}{single.customer_name} · {formatPrice(single.total_amount)} · {single.fulfillment}
          </>
        ) : (
          <span className="font-semibold">{pendingOrders.length} pending orders awaiting confirmation</span>
        )}
      </p>
      <button
        type="button"
        onClick={() => openOrder(single ? `/orders/online/${single.id}` : '/orders/online')}
        className="flex-shrink-0 rounded-md bg-white/15 hover:bg-white/25 px-3 py-1 text-xs font-semibold transition-colors"
      >
        View
      </button>
      <button
        type="button"
        onClick={() => setDismissedSignature(signature)}
        className="flex-shrink-0 text-white/70 hover:text-white"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
