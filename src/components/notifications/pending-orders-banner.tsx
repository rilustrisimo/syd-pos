'use client'

import { useState } from 'react'
import { Bell, X } from 'lucide-react'
import { usePendingOnlineOrdersBanner, useOpenLeads } from '@/hooks/useOnlineOrders'

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
  const { data: openLeads = [] } = useOpenLeads()
  const [dismissedSignature, setDismissedSignature] = useState<string | null>(null)

  // A new order or lead changes the signature, so a dismissed banner
  // comes back for it.
  const signature = [...pendingOrders, ...openLeads].map((o) => o.id).sort().join(',')
  const isDismissed = dismissedSignature === signature
  const total = pendingOrders.length + openLeads.length
  if (total === 0 || isDismissed) return null

  const single = pendingOrders.length === 1 && openLeads.length === 0 ? pendingOrders[0] : null
  const singleLead = openLeads.length === 1 && pendingOrders.length === 0 ? openLeads[0] : null
  const summary = [
    pendingOrders.length > 0 && `${pendingOrders.length} pending order${pendingOrders.length > 1 ? 's' : ''} awaiting confirmation`,
    openLeads.length > 0 && `${openLeads.length} lead${openLeads.length > 1 ? 's' : ''} to call`,
  ].filter(Boolean).join(' · ')
  const viewUrl = single ? `/orders/online/${single.id}` : singleLead ? `/orders/online/${singleLead.id}` : '/orders/online'

  return (
    <div className="flex items-center gap-3 bg-blue-600 text-white px-4 py-2 text-sm">
      <Bell className="h-4 w-4 flex-shrink-0 animate-pulse" />
      <p className="flex-1 min-w-0 truncate">
        {single ? (
          <>
            <span className="font-semibold">New order — {single.order_number}</span>
            {' · '}{single.customer_name} · {formatPrice(single.total_amount)} · {single.fulfillment}
          </>
        ) : singleLead ? (
          <>
            <span className="font-semibold">New lead — {singleLead.customer_name}</span>
            {' · '}{singleLead.customer_phone} · no list yet, give them a call
          </>
        ) : (
          <span className="font-semibold">{summary}</span>
        )}
      </p>
      <button
        type="button"
        onClick={() => openOrder(viewUrl)}
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
