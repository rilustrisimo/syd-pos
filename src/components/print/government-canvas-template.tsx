'use client'

import { forwardRef } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

export interface GovCanvasLineItem {
  line_number: number
  code?: string | null
  name: string
  quantity: number
  uom: string
  unit_price: number
  discount: number
  line_total: number
}

export interface GovCanvasTemplateData {
  canvas_number: string
  date: string
  prepared_by: string
  branch: {
    name: string
    address?: string | null
    phone?: string | null
  }
  government_agency: string
  contact_person?: string | null
  po_number?: string | null
  customer?: { name: string; phone?: string | null } | null
  title?: string | null
  notes?: string | null
  items: GovCanvasLineItem[]
  subtotal: number
  discount_amount: number
  delivery_fee: number
  other_fees: number
  other_fees_notes?: string | null
  total_amount: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(amount: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(amount)
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
}

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

const GOLD    = '#ffc107'
const DARK    = '#111827'
const GRAY50  = '#f9fafb'
const GRAY400 = '#9ca3af'
const GRAY600 = '#4b5563'
const GRAY700 = '#374151'
const GOV_BLUE = '#1e40af'
const GOV_LIGHT = '#eff6ff'
const GOV_BORDER = '#bfdbfe'

const STORE_ADDRESS  = 'Sitio Landing, Talakag, Bukidnon'
const STORE_CONTACTS = '09164527225 / 09274746352'

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  data: GovCanvasTemplateData
  logoUrl?: string
}

export const GovernmentCanvasTemplate = forwardRef<HTMLDivElement, Props>(
  ({ data, logoUrl }, ref) => {
    const hasDiscount  = data.discount_amount > 0
    const hasDelivery  = data.delivery_fee > 0
    const hasOtherFees = data.other_fees > 0

    return (
      <div
        ref={ref}
        className="canvas-print bg-white text-black"
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
                <div style={{ marginTop: '2px' }}>{STORE_ADDRESS}</div>
                <div style={{ marginTop: '2px' }}>{STORE_CONTACTS}</div>
              </div>
            </div>
          </div>

          {/* Document badge — government blue */}
          <div style={{ backgroundColor: GOV_BLUE, color: '#fff', padding: '12px 20px', borderRadius: '8px', textAlign: 'right', minWidth: '180px' }}>
            <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase', opacity: 0.75, marginBottom: '2px' }}>
              Government Procurement
            </div>
            <div style={{ fontSize: '17px', fontWeight: '900', letterSpacing: '0.5px', lineHeight: 1.1, color: '#fff' }}>
              CANVASS FORM
            </div>
            <div style={{ fontSize: '11.5px', fontWeight: '700', marginTop: '6px', letterSpacing: '0.5px' }}>
              {data.canvas_number}
            </div>
            <div style={{ fontSize: '9.5px', opacity: 0.7, marginTop: '2px' }}>
              {fmtDate(data.date)}
            </div>
          </div>
        </div>

        {/* ── Accent rule ───────────────────────────────────────────────────── */}
        <div style={{ borderTop: `3px solid ${GOV_BLUE}`, marginBottom: '5mm' }} />

        {/* ── Government agency block ───────────────────────────────────────── */}
        <div style={{
          backgroundColor: GOV_LIGHT,
          border: `1.5px solid ${GOV_BORDER}`,
          borderRadius: '8px',
          padding: '10px 14px',
          marginBottom: '5mm',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}>
          <div style={{ width: '60%' }}>
            <div style={{ fontSize: '9px', fontWeight: '700', color: GOV_BLUE, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '4px' }}>
              Submitted To
            </div>
            <div style={{ fontSize: '14px', fontWeight: '800', color: DARK }}>{data.government_agency}</div>
            {data.contact_person && (
              <div style={{ fontSize: '10px', color: GRAY600, marginTop: '3px' }}>Attention: {data.contact_person}</div>
            )}
          </div>
          <div style={{ width: '36%' }}>
            <div style={{ fontSize: '9px', fontWeight: '700', color: GOV_BLUE, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '4px' }}>
              Reference
            </div>
            {data.po_number ? (
              <div style={{ fontSize: '12px', fontWeight: '700', color: DARK, fontFamily: 'Courier New, monospace' }}>PO# {data.po_number}</div>
            ) : (
              <div style={{ fontSize: '10px', color: GRAY400, fontStyle: 'italic' }}>PO# — (pending award)</div>
            )}
            <div style={{ fontSize: '9.5px', color: GRAY600, marginTop: '3px' }}>Prepared by: {data.prepared_by}</div>
          </div>
        </div>

        {/* ── Items Table ───────────────────────────────────────────────────── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '5mm' }}>
          <thead>
            <tr style={{ backgroundColor: GOV_BLUE, color: '#fff' }}>
              <th style={{ padding: '8px 8px', textAlign: 'left', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px', width: '26px' }}>#</th>
              <th style={{ padding: '8px 8px', textAlign: 'left', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px', width: '68px' }}>Code</th>
              <th style={{ padding: '8px 8px', textAlign: 'left', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px' }}>Description / Specifications</th>
              <th style={{ padding: '8px 8px', textAlign: 'center', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px', width: '46px' }}>Qty</th>
              <th style={{ padding: '8px 8px', textAlign: 'center', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px', width: '40px' }}>Unit</th>
              <th style={{ padding: '8px 8px', textAlign: 'right', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px', width: '82px' }}>Unit Price</th>
              <th style={{ padding: '8px 8px', textAlign: 'right', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px', width: '88px' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, idx) => (
              <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? GRAY50 : '#fff' }}>
                <td style={{ padding: '7px 8px', borderBottom: '1px solid #e5e7eb', fontSize: '10px', color: GRAY400 }}>{item.line_number}</td>
                <td style={{ padding: '7px 8px', borderBottom: '1px solid #e5e7eb', fontSize: '9.5px', fontFamily: 'Courier New, monospace', color: GRAY600 }}>
                  {item.code || '—'}
                </td>
                <td style={{ padding: '7px 8px', borderBottom: '1px solid #e5e7eb', fontSize: '11px', color: DARK, fontWeight: '500' }}>{item.name}</td>
                <td style={{ padding: '7px 8px', borderBottom: '1px solid #e5e7eb', fontSize: '11px', textAlign: 'center', fontWeight: '700' }}>
                  {fmtQty(item.quantity)}
                </td>
                <td style={{ padding: '7px 8px', borderBottom: '1px solid #e5e7eb', fontSize: '10px', textAlign: 'center', color: GRAY600 }}>{item.uom}</td>
                <td style={{ padding: '7px 8px', borderBottom: '1px solid #e5e7eb', fontSize: '10.5px', textAlign: 'right', color: GRAY700 }}>
                  {fmt(item.unit_price)}
                </td>
                <td style={{ padding: '7px 8px', borderBottom: '1px solid #e5e7eb', fontSize: '11px', textAlign: 'right', fontWeight: '700', color: DARK }}>
                  {fmt(item.line_total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── Totals ────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '5mm' }}>
          <div style={{ width: '260px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '7px 14px', color: GRAY600, fontSize: '10.5px' }}>Subtotal</td>
                  <td style={{ padding: '7px 14px', textAlign: 'right', fontSize: '10.5px' }}>{fmt(data.subtotal)}</td>
                </tr>
                {hasDiscount && (
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '7px 14px', color: GRAY600, fontSize: '10.5px' }}>Discount</td>
                    <td style={{ padding: '7px 14px', textAlign: 'right', fontSize: '10.5px', color: '#16a34a', fontWeight: '600' }}>−{fmt(data.discount_amount)}</td>
                  </tr>
                )}
                {hasDelivery && (
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '7px 14px', color: GRAY600, fontSize: '10.5px' }}>Delivery Fee</td>
                    <td style={{ padding: '7px 14px', textAlign: 'right', fontSize: '10.5px' }}>+{fmt(data.delivery_fee)}</td>
                  </tr>
                )}
                {hasOtherFees && (
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '7px 14px', color: GRAY600, fontSize: '10.5px' }}>
                      {data.other_fees_notes ? `Other Fees (${data.other_fees_notes})` : 'Other Fees'}
                    </td>
                    <td style={{ padding: '7px 14px', textAlign: 'right', fontSize: '10.5px' }}>+{fmt(data.other_fees)}</td>
                  </tr>
                )}
                <tr style={{ backgroundColor: GOV_BLUE }}>
                  <td style={{ padding: '10px 14px', fontWeight: '900', fontSize: '13px', color: '#fff' }}>TOTAL</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: '900', fontSize: '13px', color: '#fff' }}>{fmt(data.total_amount)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Government compliance notice ──────────────────────────────────── */}
        <div style={{
          marginBottom: '5mm',
          padding: '10px 14px',
          backgroundColor: GOV_LIGHT,
          border: `1.5px solid ${GOV_BORDER}`,
          borderRadius: '6px',
        }}>
          <div style={{ fontSize: '10px', fontWeight: '800', color: GOV_BLUE, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
            For Government Procurement Use — RA 9184 Compliant
          </div>
          <div style={{ fontSize: '9.5px', color: '#1e3a8a', lineHeight: 1.5 }}>
            Prices are valid for 30 days from date of quotation. The above-quoted prices are subject to normal market fluctuation.
            Non-VAT registered supplier — subject to applicable withholding taxes upon payment per BIR regulations.
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
              <div style={{ fontSize: '11px', fontWeight: '700', marginTop: '2px', color: DARK }}>{data.prepared_by}</div>
            </div>
          </div>
          <div style={{ width: '29%', textAlign: 'center' }}>
            <div style={{ borderTop: '1px solid #9ca3af', paddingTop: '6px' }}>
              <div style={{ fontSize: '9.5px', color: GRAY600 }}>Noted / Approved by</div>
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
            Thank you for considering SYD Construction Supplies Trading for your procurement needs.
          </div>
          {data.branch.phone && (
            <div style={{ fontSize: '9px', color: GRAY400 }}>For inquiries: {data.branch.phone}</div>
          )}
          <div style={{ fontSize: '8px', color: '#d1d5db', marginTop: '3px' }}>
            Computer-generated quotation — {data.canvas_number}
          </div>
        </div>
      </div>
    )
  }
)

GovernmentCanvasTemplate.displayName = 'GovernmentCanvasTemplate'
