'use client'

import { forwardRef } from 'react'

interface ReceiptItem {
  name: string
  quantity: number
  unit_price: number
  uom: string
  discount: number
  total: number
}

interface ReceiptPayment {
  method: string
  amount: number
  reference?: string | null
}

export interface ReceiptData {
  transaction_number: string
  date: string
  time: string
  cashier: string
  branch: string
  customer: {
    name: string
    phone?: string | null
  }
  delivery_type: 'pickup' | 'delivery'
  delivery_address?: string | null
  items: ReceiptItem[]
  subtotal: number
  discount: number
  delivery_fee?: number
  other_fees?: number
  other_fees_notes?: string | null
  tax: number
  total: number
  payments: ReceiptPayment[]
  amount_paid: number
  change: number
  notes?: string | null
}

interface ReceiptTemplateProps {
  data: ReceiptData
  width?: '58mm' | '80mm'
}

const paymentMethodLabels: Record<string, string> = {
  cash: 'Cash',
  gcash: 'GCash',
  maya: 'Maya',
  bank_transfer: 'Bank Transfer',
  credit: 'Credit/AR',
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

const STORE_ADDRESS  = 'Sitio Landing, Talakag, Bukidnon'
const STORE_CONTACTS = '09164527225 / 09274746352'

export const ReceiptTemplate = forwardRef<HTMLDivElement, ReceiptTemplateProps>(
  ({ data, width = '80mm' }, ref) => {
    const charWidth = width === '58mm' ? 32 : 48

    const divider = '='.repeat(charWidth)
    const thinDivider = '-'.repeat(charWidth)

    return (
      <div
        ref={ref}
        className="receipt-print bg-white text-black font-mono"
        style={{
          width: width,
          padding: '4mm',
          fontSize: width === '58mm' ? '10px' : '12px',
          lineHeight: 1.4,
        }}
      >
        {/* Header — matches ESC/POS output exactly */}
        <div className="text-center mb-1">
          <div className="font-bold" style={{ fontSize: '1.5em' }}>SYD CONSTRUCTION</div>
          <div className="font-bold" style={{ fontSize: '1.5em' }}>SUPPLIES TRADING</div>
          <div className="text-xs mt-1">Construction Materials &amp; Hardware</div>
          <div className="text-xs">{STORE_ADDRESS}</div>
          <div className="text-xs">{STORE_CONTACTS}</div>
        </div>

        <div className="text-xs my-1">{divider}</div>

        {/* Transaction Info */}
        <div className="text-xs space-y-0.5">
          <div className="flex justify-between">
            <span>TXN#:</span>
            <span>{data.transaction_number}</span>
          </div>
          <div className="flex justify-between">
            <span>Date:</span>
            <span>{data.date}</span>
          </div>
          <div className="flex justify-between">
            <span>Time:</span>
            <span>{data.time}</span>
          </div>
          <div className="flex justify-between">
            <span>Cashier:</span>
            <span>{data.cashier}</span>
          </div>
          <div className="flex justify-between">
            <span>Customer:</span>
            <span>{data.customer.name}</span>
          </div>
          {data.customer.phone && (
            <div className="flex justify-between">
              <span>Phone:</span>
              <span>{data.customer.phone}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Type:</span>
            <span className="uppercase">{data.delivery_type}</span>
          </div>
        </div>

        {data.delivery_type === 'delivery' && data.delivery_address && (
          <div className="text-xs mt-0.5">
            <div>Deliver to:</div>
            <div className="pl-2">{data.delivery_address}</div>
          </div>
        )}

        <div className="text-xs my-1">{thinDivider}</div>

        {/* Items */}
        <div className="text-xs">
          <div className="flex justify-between font-bold mb-1">
            <span>ITEM</span>
            <span>AMOUNT</span>
          </div>

          {data.items.map((item, index) => (
            <div key={index} className="mb-1">
              <div className="truncate">{item.name}</div>
              <div className="flex justify-between pl-2">
                <span>{item.quantity} {item.uom} x {formatCurrency(item.unit_price)}</span>
                <span>{formatCurrency(item.total)}</span>
              </div>
              {item.discount > 0 && (
                <div className="flex justify-between pl-2">
                  <span>Discount</span>
                  <span>-{formatCurrency(item.discount)}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="text-xs my-1">{thinDivider}</div>

        {/* Totals */}
        <div className="text-xs space-y-0.5">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span>{formatCurrency(data.subtotal)}</span>
          </div>
          {data.discount > 0 && (
            <div className="flex justify-between">
              <span>Discount:</span>
              <span>-{formatCurrency(data.discount)}</span>
            </div>
          )}
          {(data.delivery_fee ?? 0) > 0 && (
            <div className="flex justify-between">
              <span>Delivery Fee:</span>
              <span>{formatCurrency(data.delivery_fee!)}</span>
            </div>
          )}
          {(data.other_fees ?? 0) > 0 && (
            <div>
              <div className="flex justify-between">
                <span>Other Fees:</span>
                <span>{formatCurrency(data.other_fees!)}</span>
              </div>
              {data.other_fees_notes && (
                <div className="pl-2 text-[10px] text-gray-500">{data.other_fees_notes}</div>
              )}
            </div>
          )}
          {data.tax > 0 && (
            <div className="flex justify-between">
              <span>Tax:</span>
              <span>{formatCurrency(data.tax)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold mt-0.5">
            <span>TOTAL:</span>
            <span>PHP {formatCurrency(data.total)}</span>
          </div>
        </div>

        <div className="text-xs my-1">{thinDivider}</div>

        {/* Payments */}
        <div className="text-xs space-y-0.5">
          <div className="font-bold">PAYMENT(S):</div>
          {data.payments.map((payment, index) => (
            <div key={index} className="flex justify-between pl-2">
              <span>
                {paymentMethodLabels[payment.method] || payment.method}
                {payment.reference && ` #${payment.reference}`}
              </span>
              <span>{formatCurrency(payment.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between">
            <span>Amount Paid:</span>
            <span>{formatCurrency(data.amount_paid)}</span>
          </div>
          {data.change > 0 && (
            <div className="flex justify-between font-bold">
              <span>Change:</span>
              <span>PHP {formatCurrency(data.change)}</span>
            </div>
          )}
        </div>

        {data.notes && (
          <>
            <div className="text-xs my-1">{thinDivider}</div>
            <div className="text-xs">
              <div className="font-bold">Notes:</div>
              <div className="pl-2">{data.notes}</div>
            </div>
          </>
        )}

        <div className="text-xs my-1">{divider}</div>

        {/* Footer — matches ESC/POS output exactly */}
        <div className="text-center text-xs">
          <div className="font-bold">Thank you for your purchase!</div>
          <div>Please keep this receipt.</div>
          <div className="mt-1">Returns due to change of mind</div>
          <div>will NOT be accepted.</div>
          <div>Items may be exchanged only</div>
          <div>if in good condition.</div>
          <div className="mt-1">This serves as your official receipt.</div>
          <div className="mt-1">--- END OF RECEIPT ---</div>
        </div>
      </div>
    )
  }
)

ReceiptTemplate.displayName = 'ReceiptTemplate'

export type { ReceiptItem, ReceiptPayment }
