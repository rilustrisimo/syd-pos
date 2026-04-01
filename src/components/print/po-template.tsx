'use client'

import { forwardRef } from 'react'

interface POItem {
  code: string
  name: string
  quantity: number
  uom: string
  unit_cost: number
  total: number
}

interface POData {
  po_number: string
  po_date: string
  expected_delivery_date?: string | null
  branch: {
    name: string
    address?: string | null
    phone?: string | null
    email?: string | null
  }
  supplier: {
    name: string
    contact_person?: string | null
    phone?: string | null
    email?: string | null
    address?: string | null
    payment_terms?: string | null
  }
  items: POItem[]
  total_amount: number
  notes?: string | null
  prepared_by: string
}

interface POTemplateProps {
  data: POData
  /** Absolute URL to the logo SVG — needed so the print window can load it.
   *  Pass `window.location.origin + '/syd-logo.svg'` from the client. */
  logoUrl?: string
}

function fmt(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(amount)
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

// Brand colours — matches canvas-template.tsx
const GOLD    = '#ffc107'
const DARK    = '#111827'
const GRAY50  = '#f9fafb'
const GRAY400 = '#9ca3af'
const GRAY600 = '#4b5563'
const GRAY700 = '#374151'

export const POTemplate = forwardRef<HTMLDivElement, POTemplateProps>(
  ({ data, logoUrl }, ref) => {
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
          padding: '12mm 16mm 10mm 16mm',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '5mm' }}>
          {/* Company block */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="SYD Logo"
                style={{ width: '96px', height: 'auto', objectFit: 'contain', flexShrink: 0, marginTop: '2px' }}
              />
            ) : (
              <div style={{
                width: '44px', height: '44px',
                backgroundColor: GOLD,
                borderRadius: '6px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <span style={{ fontSize: '26px', fontWeight: '900', color: DARK, lineHeight: 1 }}>S</span>
              </div>
            )}

            <div>
              <div style={{ fontSize: '17px', fontWeight: '800', color: DARK, letterSpacing: '-0.3px', lineHeight: 1.15 }}>
                SYD CONSTRUCTION
              </div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: GRAY700, letterSpacing: '0.8px', marginTop: '1px' }}>
                SUPPLIES TRADING
              </div>
              <div style={{ fontSize: '10px', color: GRAY600, lineHeight: 1.7, marginTop: '5px' }}>
                {data.branch.name && <div>{data.branch.name}</div>}
                {data.branch.address && <div>{data.branch.address}</div>}
                {data.branch.phone && <div>Tel: {data.branch.phone}</div>}
                {data.branch.email && <div>Email: {data.branch.email}</div>}
              </div>
            </div>
          </div>

          {/* Document badge */}
          <div style={{
            backgroundColor: GOLD,
            color: DARK,
            padding: '12px 20px',
            borderRadius: '8px',
            textAlign: 'right',
            minWidth: '170px',
          }}>
            <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase', opacity: 0.7, marginBottom: '2px' }}>
              Official Document
            </div>
            <div style={{ fontSize: '19px', fontWeight: '900', letterSpacing: '1px', lineHeight: 1, color: DARK }}>
              PURCHASE ORDER
            </div>
            <div style={{ fontSize: '11.5px', fontWeight: '700', marginTop: '6px', letterSpacing: '0.5px' }}>
              {data.po_number}
            </div>
            <div style={{ fontSize: '9.5px', opacity: 0.65, marginTop: '2px' }}>
              {fmtDate(data.po_date)}
            </div>
          </div>
        </div>

        {/* ── Accent rule ──────────────────────────────────────────────────── */}
        <div style={{ borderTop: `3px solid ${GOLD}`, marginBottom: '5mm' }} />

        {/* ── Supplier + PO Meta ───────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '5mm' }}>
          {/* Supplier block */}
          <div style={{ width: '54%' }}>
            <div style={{ fontSize: '9px', fontWeight: '700', color: GRAY400, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '4px' }}>
              Supplier / Vendor
            </div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: DARK }}>
              {data.supplier.name}
            </div>
            {data.supplier.contact_person && (
              <div style={{ fontSize: '10.5px', color: GRAY600, marginTop: '2px' }}>
                Attn: {data.supplier.contact_person}
              </div>
            )}
            {data.supplier.address && (
              <div style={{ fontSize: '10.5px', color: GRAY600, marginTop: '2px' }}>
                {data.supplier.address}
              </div>
            )}
            {data.supplier.phone && (
              <div style={{ fontSize: '10.5px', color: GRAY600 }}>Tel: {data.supplier.phone}</div>
            )}
            {data.supplier.email && (
              <div style={{ fontSize: '10.5px', color: GRAY600 }}>Email: {data.supplier.email}</div>
            )}
          </div>

          {/* PO meta table */}
          <div style={{ width: '40%', border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr style={{ backgroundColor: GRAY50, borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '5px 10px', color: GRAY600, fontSize: '9.5px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>PO Number</td>
                  <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: '700', fontSize: '10px', fontFamily: 'Courier New, monospace' }}>{data.po_number}</td>
                </tr>
                <tr style={{ backgroundColor: '#fff', borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '5px 10px', color: GRAY600, fontSize: '9.5px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>PO Date</td>
                  <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: '600', fontSize: '10px' }}>{fmtDate(data.po_date)}</td>
                </tr>
                {data.expected_delivery_date && (
                  <tr style={{ backgroundColor: GRAY50, borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '5px 10px', color: GRAY600, fontSize: '9.5px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Expected Delivery</td>
                    <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: '600', fontSize: '10px' }}>{fmtDate(data.expected_delivery_date)}</td>
                  </tr>
                )}
                {data.supplier.payment_terms && (
                  <tr style={{ backgroundColor: '#fff', borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '5px 10px', color: GRAY600, fontSize: '9.5px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Payment Terms</td>
                    <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: '600', fontSize: '10px' }}>{data.supplier.payment_terms}</td>
                  </tr>
                )}
                <tr style={{ backgroundColor: GRAY50 }}>
                  <td style={{ padding: '5px 10px', color: GRAY600, fontSize: '9.5px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Deliver To</td>
                  <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: '600', fontSize: '10px' }}>{data.branch.name}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Items Table ──────────────────────────────────────────────────── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '5mm' }}>
          <thead>
            <tr style={{ backgroundColor: DARK, color: '#fff' }}>
              <th style={{ padding: '8px 8px', textAlign: 'left', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px', width: '26px' }}>#</th>
              <th style={{ padding: '8px 8px', textAlign: 'left', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px', width: '72px' }}>Code</th>
              <th style={{ padding: '8px 8px', textAlign: 'left', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px' }}>Description</th>
              <th style={{ padding: '8px 8px', textAlign: 'center', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px', width: '46px' }}>Qty</th>
              <th style={{ padding: '8px 8px', textAlign: 'center', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px', width: '40px' }}>Unit</th>
              <th style={{ padding: '8px 8px', textAlign: 'right', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px', width: '88px' }}>Unit Cost</th>
              <th style={{ padding: '8px 8px', textAlign: 'right', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px', width: '88px' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, idx) => (
              <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? GRAY50 : '#fff' }}>
                <td style={{ padding: '7px 8px', borderBottom: '1px solid #e5e7eb', fontSize: '10px', color: GRAY400 }}>{idx + 1}</td>
                <td style={{ padding: '7px 8px', borderBottom: '1px solid #e5e7eb', fontSize: '9.5px', fontFamily: 'Courier New, monospace', color: GRAY600 }}>{item.code}</td>
                <td style={{ padding: '7px 8px', borderBottom: '1px solid #e5e7eb', fontSize: '11px', color: DARK, fontWeight: '500' }}>{item.name}</td>
                <td style={{ padding: '7px 8px', borderBottom: '1px solid #e5e7eb', fontSize: '11px', textAlign: 'center', fontWeight: '700' }}>{fmtQty(item.quantity)}</td>
                <td style={{ padding: '7px 8px', borderBottom: '1px solid #e5e7eb', fontSize: '10px', textAlign: 'center', color: GRAY600 }}>{item.uom}</td>
                <td style={{ padding: '7px 8px', borderBottom: '1px solid #e5e7eb', fontSize: '10.5px', textAlign: 'right', color: GRAY700 }}>{fmt(item.unit_cost)}</td>
                <td style={{ padding: '7px 8px', borderBottom: '1px solid #e5e7eb', fontSize: '11px', textAlign: 'right', fontWeight: '700', color: DARK }}>{fmt(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── Totals ───────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '5mm' }}>
          <div style={{ width: '260px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr style={{ backgroundColor: GOLD }}>
                  <td style={{ padding: '10px 14px', fontWeight: '900', fontSize: '13px', color: DARK }}>TOTAL AMOUNT</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: '900', fontSize: '13px', color: DARK }}>
                    {fmt(data.total_amount)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Notes ────────────────────────────────────────────────────────── */}
        {data.notes && (
          <div style={{
            marginBottom: '5mm',
            padding: '9px 13px',
            backgroundColor: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: '6px',
          }}>
            <div style={{ fontSize: '9px', fontWeight: '700', color: '#0369a1', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '3px' }}>
              Notes / Special Instructions
            </div>
            <div style={{ fontSize: '10.5px', color: '#0c4a6e', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{data.notes}</div>
          </div>
        )}

        {/* ── Terms banner ─────────────────────────────────────────────────── */}
        <div style={{
          marginBottom: '5mm',
          padding: '10px 14px',
          backgroundColor: '#fffde7',
          border: `1.5px solid ${GOLD}`,
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px',
        }}>
          <div style={{
            flexShrink: 0,
            width: '22px', height: '22px',
            backgroundColor: GOLD,
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '13px', fontWeight: '900', color: DARK,
          }}>!</div>
          <div>
            <div style={{ fontSize: '10.5px', fontWeight: '800', color: '#7c5c00', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Terms & Conditions
            </div>
            <div style={{ fontSize: '9.5px', color: '#78350f', marginTop: '2px', lineHeight: 1.5 }}>
              Please confirm receipt of this order and deliver goods to the address above by the expected delivery date.
              All items must comply with specifications listed. Contact us before making substitutions.
              This purchase order constitutes a binding agreement upon supplier confirmation.
            </div>
          </div>
        </div>

        {/* ── Signature section ────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8mm', marginBottom: '6mm' }}>
          <div style={{ width: '29%', textAlign: 'center' }}>
            <div style={{ borderTop: '1px solid #9ca3af', paddingTop: '6px' }}>
              <div style={{ fontSize: '9.5px', color: GRAY600 }}>Prepared by</div>
              <div style={{ fontSize: '11px', fontWeight: '700', marginTop: '2px', color: DARK }}>{data.prepared_by}</div>
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
              <div style={{ fontSize: '9.5px', color: GRAY600 }}>Supplier Confirmation</div>
              <div style={{ fontSize: '9px', color: '#d1d5db', fontStyle: 'italic', marginTop: '3px' }}>Signature / Stamp</div>
            </div>
          </div>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div style={{ marginTop: 'auto', borderTop: '1px solid #e5e7eb', paddingTop: '4mm', textAlign: 'center' }}>
          <div style={{ fontSize: '10px', fontWeight: '700', color: GRAY600, marginBottom: '2px' }}>
            SYD Construction Supplies Trading — Your Trusted Partner in Construction Materials
          </div>
          {data.branch.phone && (
            <div style={{ fontSize: '9px', color: GRAY400 }}>
              For inquiries, contact us at {data.branch.phone}
              {data.branch.email && ` | ${data.branch.email}`}
            </div>
          )}
          <div style={{ fontSize: '8px', color: '#d1d5db', marginTop: '3px' }}>
            This is a computer-generated purchase order. {data.po_number}
          </div>
        </div>
      </div>
    )
  }
)

POTemplate.displayName = 'POTemplate'

export type { POData, POItem }
