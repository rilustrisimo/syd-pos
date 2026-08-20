'use client'

import { forwardRef } from 'react'

interface InvoiceItem {
  code: string
  name: string
  quantity: number
  uom: string
  unit_price: number
  discount: number
  total: number
}

interface InvoicePayment {
  method: string
  amount: number
  reference?: string | null
  date: string
}

interface InvoiceData {
  transaction_number: string
  date: string
  due_date?: string | null
  branch: {
    name: string
    address: string
    phone: string
    email?: string | null
  }
  customer: {
    name: string
    address?: string | null
    phone?: string | null
    email?: string | null
  }
  delivery_type: 'pickup' | 'delivery'
  delivery_address?: string | null
  delivery_phone?: string | null
  items: InvoiceItem[]
  subtotal: number
  discount: number
  tax: number
  total: number
  amount_paid: number
  balance_due: number
  payments: InvoicePayment[]
  notes?: string | null
  prepared_by: string
}

interface InvoiceTemplateProps {
  data: InvoiceData
}

const paymentMethodLabels: Record<string, string> = {
  cash: 'Cash',
  gcash: 'GCash',
  maya: 'Maya',
  bank_transfer: 'Bank Transfer',
  credit: 'Credit / AR',
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export const InvoiceTemplate = forwardRef<HTMLDivElement, InvoiceTemplateProps>(
  ({ data }, ref) => {
    const isPaid = data.balance_due <= 0

    return (
      <div
        ref={ref}
        className="invoice-print bg-white text-black"
        style={{
          width: '210mm',
          minHeight: '297mm',
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '11px',
          lineHeight: 1.55,
          padding: '14mm 16mm 12mm 16mm',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6mm' }}>
          {/* Company */}
          <div>
            <div style={{ fontSize: '19px', fontWeight: '800', color: '#111827', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
              SYD CONSTRUCTION SUPPLIES
            </div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#374151', marginTop: '1px' }}>
              TRADING
            </div>
            <div style={{ marginTop: '5px', fontSize: '10.5px', color: '#6b7280', lineHeight: 1.6 }}>
              <div>{data.branch.name}</div>
              {data.branch.address && <div>{data.branch.address}</div>}
              <div>
                Tel: {data.branch.phone}
                {data.branch.email && <span>  |  {data.branch.email}</span>}
              </div>
            </div>
          </div>

          {/* Sales summary badge — internal document, not a tax invoice/receipt */}
          <div style={{
            backgroundColor: '#111827',
            color: '#ffffff',
            padding: '14px 22px',
            borderRadius: '8px',
            textAlign: 'right',
            minWidth: '170px',
          }}>
            <div style={{ fontSize: '20px', fontWeight: '800', letterSpacing: '2px', lineHeight: 1 }}>
              SALES SUMMARY
            </div>
            <div style={{ fontSize: '9.5px', opacity: 0.55, marginTop: '6px' }}>
              TXN: {data.transaction_number}
            </div>
          </div>
        </div>

        {/* ── Accent line ─────────────────────────────────────────── */}
        <div style={{ borderTop: '3px solid #111827', marginBottom: '5mm' }} />

        {/* ── Bill To + Invoice Details ────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '5mm' }}>
          {/* Bill To */}
          <div style={{ width: '52%' }}>
            <div style={{ fontSize: '9px', fontWeight: '700', color: '#9ca3af', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '4px' }}>
              Bill To
            </div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827' }}>
              {data.customer.name}
            </div>
            {data.customer.address && (
              <div style={{ fontSize: '10.5px', color: '#4b5563', marginTop: '2px' }}>{data.customer.address}</div>
            )}
            {data.customer.phone && (
              <div style={{ fontSize: '10.5px', color: '#4b5563' }}>Tel: {data.customer.phone}</div>
            )}
            {data.customer.email && (
              <div style={{ fontSize: '10.5px', color: '#4b5563' }}>{data.customer.email}</div>
            )}
          </div>

          {/* Invoice meta box */}
          <div style={{
            width: '40%',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '5px 10px', color: '#6b7280', fontSize: '9.5px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Invoice Date</td>
                  <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: '600', fontSize: '10px' }}>{formatDate(data.date)}</td>
                </tr>
                {data.due_date && (
                  <tr style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '5px 10px', color: '#6b7280', fontSize: '9.5px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Due Date</td>
                    <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: '600', fontSize: '10px' }}>{formatDate(data.due_date)}</td>
                  </tr>
                )}
                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '5px 10px', color: '#6b7280', fontSize: '9.5px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Type</td>
                  <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: '600', fontSize: '10px', textTransform: 'capitalize' }}>{data.delivery_type}</td>
                </tr>
                <tr style={{ backgroundColor: isPaid ? '#f0fdf4' : '#fef2f2' }}>
                  <td style={{ padding: '5px 10px', color: '#6b7280', fontSize: '9.5px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</td>
                  <td style={{
                    padding: '5px 10px',
                    textAlign: 'right',
                    fontWeight: '800',
                    fontSize: '10px',
                    color: isPaid ? '#16a34a' : '#dc2626',
                  }}>
                    {isPaid ? 'PAID' : 'UNPAID'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Delivery address ────────────────────────────────────── */}
        {data.delivery_type === 'delivery' && data.delivery_address && (
          <div style={{
            marginBottom: '4mm',
            padding: '8px 12px',
            backgroundColor: '#eff6ff',
            borderLeft: '3px solid #2563eb',
            borderRadius: '0 4px 4px 0',
          }}>
            <div style={{ fontSize: '9px', fontWeight: '700', color: '#1d4ed8', letterSpacing: '1px', textTransform: 'uppercase' }}>
              Deliver To
            </div>
            <div style={{ fontSize: '11px', color: '#1e3a8a', marginTop: '2px' }}>{data.delivery_address}</div>
            {data.delivery_phone && (
              <div style={{ fontSize: '10.5px', color: '#1e40af' }}>Contact: {data.delivery_phone}</div>
            )}
          </div>
        )}

        {/* ── Items Table ─────────────────────────────────────────── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '5mm' }}>
          <thead>
            <tr style={{ backgroundColor: '#111827', color: '#ffffff' }}>
              <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '9.5px', fontWeight: '700', letterSpacing: '0.5px', width: '28px' }}>#</th>
              <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '9.5px', fontWeight: '700', letterSpacing: '0.5px', width: '70px' }}>Code</th>
              <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '9.5px', fontWeight: '700', letterSpacing: '0.5px' }}>Description</th>
              <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: '9.5px', fontWeight: '700', letterSpacing: '0.5px', width: '48px' }}>Qty</th>
              <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: '9.5px', fontWeight: '700', letterSpacing: '0.5px', width: '44px' }}>Unit</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: '9.5px', fontWeight: '700', letterSpacing: '0.5px', width: '80px' }}>Unit Price</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: '9.5px', fontWeight: '700', letterSpacing: '0.5px', width: '72px' }}>Discount</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: '9.5px', fontWeight: '700', letterSpacing: '0.5px', width: '84px' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, index) => (
              <tr key={index} style={{ backgroundColor: index % 2 === 0 ? '#f9fafb' : '#ffffff' }}>
                <td style={{ padding: '7px 10px', borderBottom: '1px solid #e5e7eb', fontSize: '10px', color: '#9ca3af' }}>{index + 1}</td>
                <td style={{ padding: '7px 10px', borderBottom: '1px solid #e5e7eb', fontSize: '9.5px', fontFamily: 'Courier New, monospace', color: '#4b5563' }}>{item.code}</td>
                <td style={{ padding: '7px 10px', borderBottom: '1px solid #e5e7eb', fontSize: '11px', color: '#111827', fontWeight: '500' }}>{item.name}</td>
                <td style={{ padding: '7px 10px', borderBottom: '1px solid #e5e7eb', fontSize: '11px', textAlign: 'center', fontWeight: '700' }}>{item.quantity}</td>
                <td style={{ padding: '7px 10px', borderBottom: '1px solid #e5e7eb', fontSize: '10px', textAlign: 'center', color: '#6b7280' }}>{item.uom}</td>
                <td style={{ padding: '7px 10px', borderBottom: '1px solid #e5e7eb', fontSize: '10.5px', textAlign: 'right', color: '#374151' }}>
                  {formatCurrency(item.unit_price)}
                </td>
                <td style={{ padding: '7px 10px', borderBottom: '1px solid #e5e7eb', fontSize: '10.5px', textAlign: 'right', color: item.discount > 0 ? '#16a34a' : '#d1d5db' }}>
                  {item.discount > 0 ? `−${formatCurrency(item.discount)}` : '—'}
                </td>
                <td style={{ padding: '7px 10px', borderBottom: '1px solid #e5e7eb', fontSize: '11px', textAlign: 'right', fontWeight: '700', color: '#111827' }}>
                  {formatCurrency(item.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── Totals ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '5mm' }}>
          <div style={{ width: '258px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '7px 14px', color: '#6b7280', fontSize: '10.5px' }}>Subtotal</td>
                  <td style={{ padding: '7px 14px', textAlign: 'right', fontSize: '10.5px' }}>{formatCurrency(data.subtotal)}</td>
                </tr>
                {data.discount > 0 && (
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '7px 14px', color: '#6b7280', fontSize: '10.5px' }}>Discount</td>
                    <td style={{ padding: '7px 14px', textAlign: 'right', fontSize: '10.5px', color: '#16a34a', fontWeight: '600' }}>
                      −{formatCurrency(data.discount)}
                    </td>
                  </tr>
                )}
                <tr style={{ backgroundColor: '#111827', color: '#ffffff' }}>
                  <td style={{ padding: '10px 14px', fontWeight: '800', fontSize: '13px' }}>TOTAL</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: '800', fontSize: '13px' }}>
                    {formatCurrency(data.total)}
                  </td>
                </tr>
                {data.amount_paid > 0 && (
                  <tr style={{ borderTop: '1px solid #f1f5f9', backgroundColor: '#f9fafb' }}>
                    <td style={{ padding: '7px 14px', color: '#6b7280', fontSize: '10.5px' }}>Amount Paid</td>
                    <td style={{ padding: '7px 14px', textAlign: 'right', fontSize: '10.5px', color: '#16a34a', fontWeight: '600' }}>
                      {formatCurrency(data.amount_paid)}
                    </td>
                  </tr>
                )}
                {data.balance_due > 0 && (
                  <tr style={{ backgroundColor: '#fef2f2', borderTop: '1px solid #fecaca' }}>
                    <td style={{ padding: '8px 14px', color: '#dc2626', fontWeight: '700', fontSize: '11px' }}>Balance Due</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', color: '#dc2626', fontWeight: '700', fontSize: '11px' }}>
                      {formatCurrency(data.balance_due)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Payment Details ──────────────────────────────────────── */}
        {data.payments.length > 0 && (
          <div style={{ marginBottom: '5mm' }}>
            <div style={{ fontSize: '9px', fontWeight: '700', color: '#9ca3af', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '4px' }}>
              Payment Details
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc' }}>
                  <th style={{ padding: '6px 12px', textAlign: 'left', fontSize: '9.5px', color: '#6b7280', fontWeight: '600', borderBottom: '1px solid #e5e7eb' }}>Date</th>
                  <th style={{ padding: '6px 12px', textAlign: 'left', fontSize: '9.5px', color: '#6b7280', fontWeight: '600', borderBottom: '1px solid #e5e7eb' }}>Method</th>
                  <th style={{ padding: '6px 12px', textAlign: 'left', fontSize: '9.5px', color: '#6b7280', fontWeight: '600', borderBottom: '1px solid #e5e7eb' }}>Reference</th>
                  <th style={{ padding: '6px 12px', textAlign: 'right', fontSize: '9.5px', color: '#6b7280', fontWeight: '600', borderBottom: '1px solid #e5e7eb' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((payment, index) => (
                  <tr key={index} style={{ borderBottom: index < data.payments.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <td style={{ padding: '6px 12px', fontSize: '10px', color: '#374151' }}>{payment.date ? formatDate(payment.date) : '—'}</td>
                    <td style={{ padding: '6px 12px', fontSize: '10px', color: '#374151' }}>{paymentMethodLabels[payment.method] || payment.method}</td>
                    <td style={{ padding: '6px 12px', fontSize: '10px', color: '#9ca3af' }}>{payment.reference || '—'}</td>
                    <td style={{ padding: '6px 12px', fontSize: '10.5px', textAlign: 'right', fontWeight: '600', color: '#16a34a' }}>{formatCurrency(payment.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Notes ───────────────────────────────────────────────── */}
        {data.notes && (
          <div style={{
            marginBottom: '5mm',
            padding: '9px 13px',
            backgroundColor: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '6px',
          }}>
            <div style={{ fontSize: '9px', fontWeight: '700', color: '#92400e', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '3px' }}>Notes</div>
            <div style={{ fontSize: '10.5px', color: '#78350f' }}>{data.notes}</div>
          </div>
        )}

        {/* ── Signature Section ────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10mm', marginBottom: '7mm' }}>
          <div style={{ width: '28%', textAlign: 'center' }}>
            <div style={{ borderTop: '1px solid #9ca3af', paddingTop: '6px' }}>
              <div style={{ fontSize: '9.5px', color: '#6b7280' }}>Prepared by</div>
              <div style={{ fontSize: '11px', fontWeight: '700', marginTop: '2px', color: '#111827' }}>{data.prepared_by}</div>
            </div>
          </div>
          {data.delivery_type === 'delivery' && (
            <div style={{ width: '28%', textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid #9ca3af', paddingTop: '6px' }}>
                <div style={{ fontSize: '9.5px', color: '#6b7280' }}>Delivered by</div>
                <div style={{ fontSize: '9px', color: '#d1d5db', fontStyle: 'italic', marginTop: '3px' }}>Signature over printed name</div>
              </div>
            </div>
          )}
          <div style={{ width: '28%', textAlign: 'center' }}>
            <div style={{ borderTop: '1px solid #9ca3af', paddingTop: '6px' }}>
              <div style={{ fontSize: '9.5px', color: '#6b7280' }}>Received by</div>
              <div style={{ fontSize: '9px', color: '#d1d5db', fontStyle: 'italic', marginTop: '3px' }}>Signature over printed name</div>
            </div>
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <div style={{ marginTop: 'auto', borderTop: '1px solid #e5e7eb', paddingTop: '5mm', textAlign: 'center' }}>
          <div style={{ fontSize: '9.5px', fontWeight: '700', color: '#6b7280', marginBottom: '2px' }}>
            Thank you for your business!
          </div>
          <div style={{ fontSize: '8.5px', color: '#9ca3af' }}>
            For inquiries, contact us at {data.branch.phone}
          </div>
          <div style={{ fontSize: '8px', color: '#d1d5db', marginTop: '3px' }}>
            This is a computer-generated document. No signature required unless for delivery.
          </div>
        </div>
      </div>
    )
  }
)

InvoiceTemplate.displayName = 'InvoiceTemplate'

export type { InvoiceData, InvoiceItem, InvoicePayment }
