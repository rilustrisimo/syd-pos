'use client'

import type { Referrer, ReferrerStats, PayoutRow } from '@/lib/supabase/queries/referrers'

// ── Brand colours ─────────────────────────────────────────────────────────────
const GOLD = '#ffc107'
const DARK = '#111827'
const GRAY50 = '#f9fafb'
const GRAY400 = '#9ca3af'
const GRAY600 = '#4b5563'
const GRAY700 = '#374151'

// ── Store info ────────────────────────────────────────────────────────────────
const STORE_ADDRESS = 'Sitio Landing, Talakag, Bukidnon'
const STORE_CONTACTS = '09164527225 / 09274746352'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(amount)
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  // Handle date-only strings (YYYY-MM-DD) as local time
  const adjusted = dateStr.length === 10
    ? new Date(dateStr + 'T00:00:00')
    : d
  return adjusted.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const paymentMethodLabels: Record<string, string> = {
  cash: 'Cash',
  gcash: 'GCash',
  bank_transfer: 'Bank Transfer',
}

// ── Component ─────────────────────────────────────────────────────────────────

interface PayoutSlipTemplateProps {
  referrer: Referrer
  payout: PayoutRow
  stats: ReferrerStats
  logoUrl?: string
}

export function PayoutSlipTemplate({ referrer, payout, stats, logoUrl }: PayoutSlipTemplateProps) {
  // Balance BEFORE this payout
  const balanceBefore = stats.balance + payout.amount
  const balanceAfter = stats.balance

  return (
    <div
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
        backgroundColor: '#fff',
        color: '#000',
      }}
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
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
            <div style={{ fontSize: '9.5px', color: GRAY600, lineHeight: 1.7, marginTop: '5px' }}>
              <div>Construction Materials &amp; Hardware</div>
              <div style={{ marginTop: '2px' }}>{STORE_ADDRESS}</div>
              <div style={{ marginTop: '2px' }}>{STORE_CONTACTS}</div>
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
          minWidth: '175px',
        }}>
          <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase', opacity: 0.7, marginBottom: '2px' }}>
            Commission Payout
          </div>
          <div style={{ fontSize: '17px', fontWeight: '900', letterSpacing: '0.5px', lineHeight: 1.1, color: DARK }}>
            PAYOUT RECEIPT
          </div>
          <div style={{ fontSize: '9.5px', opacity: 0.65, marginTop: '6px' }}>
            {fmtDate(payout.payout_date)}
          </div>
        </div>
      </div>

      {/* ── Accent rule ───────────────────────────────────────────────────── */}
      <div style={{ borderTop: `3px solid ${GOLD}`, marginBottom: '5mm' }} />

      {/* ── Referrer info ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6mm' }}>
        <div style={{ width: '55%' }}>
          <div style={{ fontSize: '9px', fontWeight: '700', color: GRAY400, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '4px' }}>
            Issued To
          </div>
          <div style={{ fontSize: '15px', fontWeight: '700', color: DARK }}>{referrer.name}</div>
          {referrer.profession && (
            <div style={{ fontSize: '10.5px', color: GRAY600, marginTop: '2px' }}>{referrer.profession}</div>
          )}
          {referrer.phone && (
            <div style={{ fontSize: '10.5px', color: GRAY600, marginTop: '2px' }}>Tel: {referrer.phone}</div>
          )}
          {referrer.address && (
            <div style={{ fontSize: '10.5px', color: GRAY600, marginTop: '2px' }}>{referrer.address}</div>
          )}
        </div>

        {/* Payout method info */}
        <div style={{
          width: '40%',
          border: `1px solid ${GOLD}`,
          borderRadius: '6px',
          padding: '10px 14px',
        }}>
          <div style={{ fontSize: '9px', fontWeight: '700', color: GRAY400, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '6px' }}>
            Payment Details
          </div>
          <table style={{ width: '100%', fontSize: '10.5px', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ color: GRAY600, paddingBottom: '3px' }}>Method:</td>
                <td style={{ fontWeight: '600', textAlign: 'right' }}>
                  {paymentMethodLabels[payout.payment_method] || payout.payment_method}
                </td>
              </tr>
              {payout.reference_number && (
                <tr>
                  <td style={{ color: GRAY600, paddingBottom: '3px' }}>Reference:</td>
                  <td style={{ fontWeight: '600', textAlign: 'right' }}>{payout.reference_number}</td>
                </tr>
              )}
              <tr>
                <td style={{ color: GRAY600, paddingBottom: '3px' }}>Date:</td>
                <td style={{ fontWeight: '600', textAlign: 'right' }}>{fmtDate(payout.payout_date)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Amount highlight ──────────────────────────────────────────────── */}
      <div style={{
        backgroundColor: GOLD,
        borderRadius: '8px',
        padding: '14px 20px',
        marginBottom: '6mm',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', opacity: 0.75 }}>
            Amount Paid
          </div>
          <div style={{ fontSize: '28px', fontWeight: '900', color: DARK, lineHeight: 1.1, marginTop: '2px' }}>
            {fmt(payout.amount)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '9.5px', color: DARK, opacity: 0.7 }}>Commission payout to</div>
          <div style={{ fontSize: '12px', fontWeight: '700', color: DARK }}>{referrer.name}</div>
        </div>
      </div>

      {/* ── Running totals ─────────────────────────────────────────────────── */}
      <div style={{
        backgroundColor: GRAY50,
        border: `1px solid #e5e7eb`,
        borderRadius: '6px',
        padding: '12px 18px',
        marginBottom: '6mm',
      }}>
        <div style={{ fontSize: '9px', fontWeight: '700', color: GRAY400, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '8px' }}>
          Commission Summary
        </div>
        <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ color: GRAY600, paddingBottom: '5px' }}>Total Earned (all time):</td>
              <td style={{ textAlign: 'right', fontWeight: '600', paddingBottom: '5px' }}>{fmt(stats.total_earned)}</td>
            </tr>
            <tr>
              <td style={{ color: GRAY600, paddingBottom: '5px' }}>Less: Reversals:</td>
              <td style={{ textAlign: 'right', fontWeight: '600', paddingBottom: '5px', color: '#dc2626' }}>-{fmt(stats.total_reversed)}</td>
            </tr>
            <tr>
              <td style={{ color: GRAY600, paddingBottom: '5px' }}>Less: Prior Payouts:</td>
              <td style={{ textAlign: 'right', fontWeight: '600', paddingBottom: '5px' }}>-{fmt(stats.total_paid_out - payout.amount)}</td>
            </tr>
            <tr style={{ borderTop: '1px solid #d1d5db' }}>
              <td style={{ paddingTop: '6px', color: GRAY700, fontWeight: '600' }}>Balance Before This Payout:</td>
              <td style={{ textAlign: 'right', fontWeight: '700', paddingTop: '6px' }}>{fmt(balanceBefore)}</td>
            </tr>
            <tr>
              <td style={{ color: GRAY700, fontWeight: '600', paddingBottom: '3px' }}>Less: This Payout:</td>
              <td style={{ textAlign: 'right', fontWeight: '700', paddingBottom: '3px', color: '#dc2626' }}>-{fmt(payout.amount)}</td>
            </tr>
            <tr style={{ borderTop: `2px solid ${GOLD}` }}>
              <td style={{ paddingTop: '6px', fontSize: '12px', fontWeight: '800', color: DARK }}>Remaining Balance:</td>
              <td style={{
                textAlign: 'right',
                fontSize: '14px',
                fontWeight: '900',
                paddingTop: '6px',
                color: balanceAfter > 0 ? '#d97706' : DARK,
              }}>
                {fmt(balanceAfter)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Notes ─────────────────────────────────────────────────────────── */}
      {payout.notes && (
        <div style={{ marginBottom: '6mm' }}>
          <div style={{ fontSize: '9px', fontWeight: '700', color: GRAY400, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '4px' }}>
            Notes
          </div>
          <p style={{ fontSize: '10.5px', color: GRAY700 }}>{payout.notes}</p>
        </div>
      )}

      {/* ── Signature block ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', marginTop: 'auto', paddingTop: '10mm' }}>
        <div style={{ flex: 1 }}>
          <div style={{ borderTop: '1px solid #9ca3af', paddingTop: '6px', marginTop: '32px' }} />
          <div style={{ fontSize: '10.5px', fontWeight: '700', color: DARK }}>Received by (Referrer)</div>
          <div style={{ fontSize: '9.5px', color: GRAY600, marginTop: '2px' }}>{referrer.name}</div>
          <div style={{ fontSize: '9px', color: GRAY400, marginTop: '2px' }}>Signature over printed name / Date</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ borderTop: '1px solid #9ca3af', paddingTop: '6px', marginTop: '32px' }} />
          <div style={{ fontSize: '10.5px', fontWeight: '700', color: DARK }}>Released by</div>
          <div style={{ fontSize: '9.5px', color: GRAY600, marginTop: '2px' }}>
            {payout.created_user?.full_name || payout.created_user?.email || 'Staff'}
          </div>
          <div style={{ fontSize: '9px', color: GRAY400, marginTop: '2px' }}>Signature over printed name / Date</div>
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div style={{
        borderTop: `1px solid #e5e7eb`,
        marginTop: '6mm',
        paddingTop: '4mm',
        textAlign: 'center',
        fontSize: '9px',
        color: GRAY400,
      }}>
        This is a computer-generated payout receipt. No additional signature required unless signed above.
        <br />
        SYD Construction Supplies Trading — {STORE_ADDRESS} — {STORE_CONTACTS}
      </div>
    </div>
  )
}
