'use client'

import { forwardRef } from 'react'
import { useStoreContactInfo } from '@/hooks/useShopSettings'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GovInvoiceItem {
  code?: string | null
  name: string
  quantity: number
  uom: string
  unit_price: number
  discount: number
  total: number
}

export interface GovInvoicePayment {
  method: string
  amount: number
  reference?: string | null
  date?: string | null
}

export interface GovInvoiceData {
  transaction_number: string
  date: string
  time: string
  branch: string
  cashier?: string | null
  government_agency: string
  po_number?: string | null
  contact_person?: string | null
  customer: { name: string; phone?: string | null; address?: string | null }
  items: GovInvoiceItem[]
  subtotal: number
  discount: number
  delivery_fee?: number
  other_fees?: number
  other_fees_notes?: string | null
  gross_total: number
  withholding_rate: number
  withholding_amount: number
  net_receivable: number
  payments: GovInvoicePayment[]
  amount_paid: number
  balance_due: number
  payment_status: 'paid' | 'partial' | 'unpaid'
  notes?: string | null
}

// ── Constants ──────────────────────────────────────────────────────────────────

// Fallbacks only — real values come from shop_settings (Settings > Store
// Contact & Address in syd-pos), shared with syd-shop.
const DEFAULT_STORE_ADDRESS = 'Sitio Landing, Talakag, Bukidnon'
const DEFAULT_STORE_PHONE   = '09765524334'

const GOLD      = '#ffc107'
const DARK      = '#111827'
const GRAY50    = '#f9fafb'
const GRAY400   = '#9ca3af'
const GRAY600   = '#4b5563'
const GRAY700   = '#374151'
const GOV_BLUE  = '#1e40af'
const GOV_LIGHT = '#eff6ff'
const GOV_BORDER = '#bfdbfe'

const paymentMethodLabels: Record<string, string> = {
  cash: 'Cash',
  gcash: 'GCash',
  maya: 'Maya',
  bank_transfer: 'Bank Transfer',
  credit: 'Credit / AR',
  government_withholding: 'Gov\'t Withholding',
}

const statusConfig = {
  paid:    { label: 'PAID',    bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  partial: { label: 'PARTIAL', bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
  unpaid:  { label: 'UNPAID',  bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(n)
}

function fmtDate(s: string): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
}

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  data: GovInvoiceData
  logoUrl?: string
}

export const GovernmentInvoiceTemplate = forwardRef<HTMLDivElement, Props>(
  ({ data, logoUrl }, ref) => {
    const { data: storeInfo } = useStoreContactInfo()
    const storeAddress = storeInfo?.store_address || DEFAULT_STORE_ADDRESS
    const storePhone   = storeInfo?.store_phone   || DEFAULT_STORE_PHONE
    const status = statusConfig[data.payment_status]
    const hasDelivery  = (data.delivery_fee || 0) > 0
    const hasOtherFees = (data.other_fees || 0) > 0
    const hasDiscount  = data.discount > 0

    return (
      <div
        ref={ref}
        className="gov-invoice-print bg-white text-black"
        style={{
          width: '210mm',
          minHeight: '297mm',
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '11px',
          lineHeight: 1.55,
          padding: '12mm 16mm 10mm 16mm',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
        }}
      >
        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '5mm' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            {logoUrl ? (
              <img src={logoUrl} alt="SYD Logo" style={{ width: '96px', height: 'auto', objectFit: 'contain', flexShrink: 0, marginTop: '2px' }} />
            ) : (
              <div style={{ width: '44px', height: '44px', backgroundColor: GOLD, borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: '26px', fontWeight: '900', color: DARK, lineHeight: 1 }}>S</span>
              </div>
            )}
            <div>
              <div style={{ fontSize: '17px', fontWeight: '800', color: DARK, letterSpacing: '-0.3px', lineHeight: 1.15 }}>SYD CONSTRUCTION</div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: GRAY700, letterSpacing: '0.8px', marginTop: '1px' }}>SUPPLIES TRADING</div>
              <div style={{ fontSize: '9.5px', color: GRAY600, lineHeight: 1.7, marginTop: '5px' }}>
                <div>Construction Materials & Hardware</div>
                <div>{storeAddress}</div>
                <div>{storePhone}</div>
              </div>
            </div>
          </div>

          {/* Document badge */}
          <div style={{ backgroundColor: GOV_BLUE, color: '#fff', padding: '12px 20px', borderRadius: '8px', textAlign: 'right', minWidth: '195px' }}>
            <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', opacity: 0.75, marginBottom: '2px' }}>
              Government Sales Invoice
            </div>
            <div style={{ fontSize: '18px', fontWeight: '900', letterSpacing: '0.5px', lineHeight: 1.1 }}>
              {data.transaction_number}
            </div>
            <div style={{ fontSize: '10px', marginTop: '5px', opacity: 0.85 }}>{fmtDate(data.date)}</div>
            <div style={{
              marginTop: '8px',
              display: 'inline-block',
              padding: '3px 12px',
              backgroundColor: 'rgba(255,255,255,0.2)',
              borderRadius: '100px',
              fontSize: '11px',
              fontWeight: '800',
              letterSpacing: '1px',
              color: '#fff',
            }}>
              {status.label}
            </div>
          </div>
        </div>

        {/* ── Accent rule ───────────────────────────────────────────────────── */}
        <div style={{ borderTop: `3px solid ${GOV_BLUE}`, marginBottom: '4mm' }} />

        {/* ── Government agency + Sold to ───────────────────────────────────── */}
        <div style={{ display: 'flex', gap: '14px', marginBottom: '5mm' }}>
          <div style={{ flex: 1, backgroundColor: GOV_LIGHT, border: `1.5px solid ${GOV_BORDER}`, borderRadius: '8px', padding: '10px 14px' }}>
            <div style={{ fontSize: '9px', fontWeight: '700', color: GOV_BLUE, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '4px' }}>Sold To (Government Agency)</div>
            <div style={{ fontSize: '13px', fontWeight: '800', color: DARK }}>{data.government_agency}</div>
            {data.contact_person && <div style={{ fontSize: '10px', color: GRAY600, marginTop: '2px' }}>Attention: {data.contact_person}</div>}
            {data.customer.address && <div style={{ fontSize: '10px', color: GRAY600, marginTop: '2px' }}>{data.customer.address}</div>}
          </div>
          <div style={{ width: '200px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '6px 10px', color: GRAY600, fontSize: '9px', fontWeight: '700', textTransform: 'uppercase' }}>PO Number</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '700', fontSize: '10px', fontFamily: 'Courier New, monospace' }}>
                    {data.po_number || '—'}
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '6px 10px', color: GRAY600, fontSize: '9px', fontWeight: '700', textTransform: 'uppercase' }}>Date</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '10px' }}>{fmtDate(data.date)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '6px 10px', color: GRAY600, fontSize: '9px', fontWeight: '700', textTransform: 'uppercase' }}>Branch</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '10px' }}>{data.branch}</td>
                </tr>
                {data.cashier && (
                  <tr>
                    <td style={{ padding: '6px 10px', color: GRAY600, fontSize: '9px', fontWeight: '700', textTransform: 'uppercase' }}>Processed by</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '10px' }}>{data.cashier}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Items table ───────────────────────────────────────────────────── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '5mm' }}>
          <thead>
            <tr style={{ backgroundColor: GOV_BLUE, color: '#fff' }}>
              <th style={{ padding: '8px 8px', textAlign: 'left', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px', width: '68px' }}>Code</th>
              <th style={{ padding: '8px 8px', textAlign: 'left', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px' }}>Description</th>
              <th style={{ padding: '8px 8px', textAlign: 'center', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px', width: '46px' }}>Qty</th>
              <th style={{ padding: '8px 8px', textAlign: 'center', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px', width: '40px' }}>Unit</th>
              <th style={{ padding: '8px 8px', textAlign: 'right', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px', width: '82px' }}>Unit Price</th>
              <th style={{ padding: '8px 8px', textAlign: 'right', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px', width: '88px' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, idx) => (
              <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? GRAY50 : '#fff' }}>
                <td style={{ padding: '7px 8px', borderBottom: '1px solid #e5e7eb', fontSize: '9.5px', fontFamily: 'Courier New, monospace', color: GRAY600 }}>
                  {item.code || '—'}
                </td>
                <td style={{ padding: '7px 8px', borderBottom: '1px solid #e5e7eb', fontSize: '11px', color: DARK, fontWeight: '500' }}>{item.name}</td>
                <td style={{ padding: '7px 8px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontWeight: '700' }}>{fmtQty(item.quantity)}</td>
                <td style={{ padding: '7px 8px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', color: GRAY600, fontSize: '10px' }}>{item.uom}</td>
                <td style={{ padding: '7px 8px', borderBottom: '1px solid #e5e7eb', textAlign: 'right', color: GRAY700 }}>{fmt(item.unit_price)}</td>
                <td style={{ padding: '7px 8px', borderBottom: '1px solid #e5e7eb', textAlign: 'right', fontWeight: '700', color: DARK }}>{fmt(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── Totals + Withholding breakdown ────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '5mm' }}>
          <div style={{ width: '300px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '7px 14px', color: GRAY600, fontSize: '10.5px' }}>Subtotal</td>
                  <td style={{ padding: '7px 14px', textAlign: 'right', fontSize: '10.5px' }}>{fmt(data.subtotal)}</td>
                </tr>
                {hasDiscount && (
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '7px 14px', color: GRAY600, fontSize: '10.5px' }}>Discount</td>
                    <td style={{ padding: '7px 14px', textAlign: 'right', fontSize: '10.5px', color: '#16a34a', fontWeight: '600' }}>−{fmt(data.discount)}</td>
                  </tr>
                )}
                {hasDelivery && (
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '7px 14px', color: GRAY600, fontSize: '10.5px' }}>Delivery Fee</td>
                    <td style={{ padding: '7px 14px', textAlign: 'right', fontSize: '10.5px' }}>+{fmt(data.delivery_fee!)}</td>
                  </tr>
                )}
                {hasOtherFees && (
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '7px 14px', color: GRAY600, fontSize: '10.5px' }}>
                      {data.other_fees_notes ? `Other Fees (${data.other_fees_notes})` : 'Other Fees'}
                    </td>
                    <td style={{ padding: '7px 14px', textAlign: 'right', fontSize: '10.5px' }}>+{fmt(data.other_fees!)}</td>
                  </tr>
                )}
                {/* Gross total */}
                <tr style={{ borderBottom: '2px solid #e5e7eb', backgroundColor: GRAY50 }}>
                  <td style={{ padding: '8px 14px', fontWeight: '700', fontSize: '11.5px', color: DARK }}>Gross Total</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: '700', fontSize: '11.5px', color: DARK }}>{fmt(data.gross_total)}</td>
                </tr>
                {/* Withholding row */}
                <tr style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: '#fef2f2' }}>
                  <td style={{ padding: '7px 14px', color: '#dc2626', fontSize: '10.5px' }}>
                    Withholding Tax ({data.withholding_rate}%)
                  </td>
                  <td style={{ padding: '7px 14px', textAlign: 'right', fontSize: '10.5px', color: '#dc2626', fontWeight: '600' }}>
                    −{fmt(data.withholding_amount)}
                  </td>
                </tr>
                {/* Net receivable — government blue */}
                <tr style={{ backgroundColor: GOV_BLUE }}>
                  <td style={{ padding: '10px 14px', fontWeight: '900', fontSize: '13px', color: '#fff' }}>NET AMOUNT DUE</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: '900', fontSize: '13px', color: '#fff' }}>
                    {fmt(data.net_receivable)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── BIR / tax note ────────────────────────────────────────────────── */}
        <div style={{ marginBottom: '5mm', padding: '9px 13px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px' }}>
          <div style={{ fontSize: '9.5px', color: '#7f1d1d', lineHeight: 1.6 }}>
            <strong>Tax Note:</strong> Subject to 3% Percentage Tax (BIR RR 16-2005) and 1% Expanded Withholding Tax per BIR RR 11-2018.
            Withholding of {data.withholding_rate}% (₱{data.withholding_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}) will be deducted from the gross amount upon cheque release.
          </div>
        </div>

        {/* ── Payments received ─────────────────────────────────────────────── */}
        {data.payments.length > 0 && (
          <div style={{ marginBottom: '5mm' }}>
            <div style={{ fontSize: '9px', fontWeight: '700', color: GRAY400, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '5px' }}>
              Payments Received
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden' }}>
              <thead>
                <tr style={{ backgroundColor: GRAY50 }}>
                  <th style={{ padding: '6px 12px', textAlign: 'left', fontSize: '9px', fontWeight: '700', color: GRAY600 }}>Method</th>
                  <th style={{ padding: '6px 12px', textAlign: 'left', fontSize: '9px', fontWeight: '700', color: GRAY600 }}>Reference</th>
                  <th style={{ padding: '6px 12px', textAlign: 'right', fontSize: '9px', fontWeight: '700', color: GRAY600 }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 12px', fontSize: '10.5px', color: DARK }}>{paymentMethodLabels[p.method] || p.method}</td>
                    <td style={{ padding: '6px 12px', fontSize: '10px', color: GRAY600, fontFamily: 'Courier New, monospace' }}>{p.reference || '—'}</td>
                    <td style={{ padding: '6px 12px', textAlign: 'right', fontSize: '10.5px', fontWeight: '600', color: DARK }}>{fmt(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Balance summary ───────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '5mm' }}>
          <div style={{
            padding: '10px 18px',
            border: `2px solid ${status.border}`,
            borderRadius: '8px',
            backgroundColor: status.bg,
            textAlign: 'right',
          }}>
            <div style={{ fontSize: '9.5px', color: GRAY600, marginBottom: '2px' }}>
              Amount Paid: {fmt(data.amount_paid)} &nbsp;|&nbsp; Balance Due: {fmt(data.balance_due)}
            </div>
            <div style={{ fontSize: '15px', fontWeight: '900', color: status.color }}>{status.label}</div>
          </div>
        </div>

        {/* ── Notes ─────────────────────────────────────────────────────────── */}
        {data.notes && (
          <div style={{ marginBottom: '5mm', padding: '9px 13px', backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px' }}>
            <div style={{ fontSize: '9px', fontWeight: '700', color: '#0369a1', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '3px' }}>Notes</div>
            <div style={{ fontSize: '10.5px', color: '#0c4a6e', lineHeight: 1.5 }}>{data.notes}</div>
          </div>
        )}

        {/* ── Signature section ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8mm', marginBottom: '6mm' }}>
          <div style={{ width: '29%', textAlign: 'center' }}>
            <div style={{ borderTop: '1px solid #9ca3af', paddingTop: '6px' }}>
              <div style={{ fontSize: '9.5px', color: GRAY600 }}>Prepared by</div>
              <div style={{ fontSize: '9px', color: '#d1d5db', fontStyle: 'italic', marginTop: '3px' }}>Signature over printed name</div>
            </div>
          </div>
          <div style={{ width: '29%', textAlign: 'center' }}>
            <div style={{ borderTop: '1px solid #9ca3af', paddingTop: '6px' }}>
              <div style={{ fontSize: '9.5px', color: GRAY600 }}>Approved by</div>
              <div style={{ fontSize: '9px', color: '#d1d5db', fontStyle: 'italic', marginTop: '3px' }}>Signature over printed name</div>
            </div>
          </div>
          <div style={{ width: '29%', textAlign: 'center' }}>
            <div style={{ borderTop: '1px solid #9ca3af', paddingTop: '6px' }}>
              <div style={{ fontSize: '9.5px', color: GRAY600 }}>Received by</div>
              <div style={{ fontSize: '9px', color: '#d1d5db', fontStyle: 'italic', marginTop: '3px' }}>Signature over printed name</div>
            </div>
          </div>
        </div>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <div style={{ marginTop: 'auto', borderTop: '1px solid #e5e7eb', paddingTop: '4mm', textAlign: 'center' }}>
          <div style={{ fontSize: '10px', fontWeight: '700', color: GRAY600, marginBottom: '2px' }}>
            Thank you for your business — SYD Construction Supplies Trading
          </div>
          <div style={{ fontSize: '8px', color: '#d1d5db', marginTop: '3px' }}>
            Computer-generated invoice — {data.transaction_number}
          </div>
        </div>
      </div>
    )
  }
)

GovernmentInvoiceTemplate.displayName = 'GovernmentInvoiceTemplate'
