/**
 * Thermal receipt printing via CUPS (USB printer-class device).
 *
 * The VOZY G80 registers on macOS as an STMicroelectronics POS80 USB printer,
 * which means the OS claims it as a USB printer-class device — not a serial
 * port.  Raw ESC/POS bytes are forwarded to a local Next.js API route
 * (/api/print) which sends them to the CUPS queue with `lp -o raw`.
 *
 * No Web Serial API, no extra server process.  The only requirement is that
 * the Next.js dev/production server is running (which it always is for the
 * app to function) and the printer is registered in macOS CUPS.
 */

import type { ReceiptData } from '@/components/print/receipt-template'

// ---------------------------------------------------------------------------
// ESC/POS command set
// ---------------------------------------------------------------------------

const ESC = '\x1b'
const GS  = '\x1d'
const LF  = '\n'

const CMD = {
  INIT:          ESC + '@',
  // Force PC437 (US ASCII) code table — the G80 defaults to Chinese (GB18030)
  // after ESC @ which garbles plain-English text.
  CHARSET_PC437: ESC + 't' + '\x00',
  LEFT:          ESC + 'a' + '\x00',
  CENTER:        ESC + 'a' + '\x01',
  BOLD_ON:       ESC + 'E' + '\x01',
  BOLD_OFF:      ESC + 'E' + '\x00',
  DOUBLE_SIZE:   GS  + '!' + '\x11',  // 2× width + 2× height
  NORMAL_SIZE:   GS  + '!' + '\x00',
  FEED: (n: number) => ESC + 'd' + String.fromCharCode(n),
  CUT:           GS  + 'V' + 'B' + '\x00',  // partial cut
}

// 80 mm paper → 48 character column width
const CHAR_WIDTH = 48

const PAYMENT_LABELS: Record<string, string> = {
  cash:          'Cash',
  gcash:         'GCash',
  maya:          'Maya',
  bank_transfer: 'Bank Transfer',
  credit:        'Credit/AR',
}

// ---------------------------------------------------------------------------
// ESC/POS receipt builder
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function leftRight(left: string, right: string, width: number): string {
  const gap = width - left.length - right.length
  if (gap < 1) {
    return left.substring(0, width) + LF + ' '.repeat(width - right.length) + right
  }
  return left + ' '.repeat(gap) + right
}

// Manually center text within `width` columns by prepending spaces.
// For DOUBLE_SIZE lines pass width/2 because each char occupies 2 columns.
function centerPad(text: string, width: number): string {
  const pad = Math.max(0, Math.floor((width - text.length) / 2))
  return ' '.repeat(pad) + text
}

export function buildReceiptBytes(data: ReceiptData): Uint8Array {
  const w           = CHAR_WIDTH
  const divider     = '='.repeat(w)
  const thinDivider = '-'.repeat(w)
  let r = ''

  r += CMD.INIT
  r += CMD.CHARSET_PC437

  // ── Header ────────────────────────────────────────────────────────────────
  r += CMD.CENTER
  r += CMD.BOLD_ON + CMD.DOUBLE_SIZE
  r += 'SYD CONSTRUCTION' + LF
  r += 'SUPPLIES TRADING' + LF
  r += CMD.NORMAL_SIZE + CMD.BOLD_OFF
  r += 'Construction Materials & Hardware' + LF

  r += CMD.LEFT
  r += divider + LF

  // ── Transaction info ───────────────────────────────────────────────────────
  r += leftRight('TXN#:',     data.transaction_number, w) + LF
  r += leftRight('Date:',     data.date,               w) + LF
  r += leftRight('Time:',     data.time,               w) + LF
  r += leftRight('Cashier:',  data.cashier,            w) + LF
  r += leftRight('Customer:', data.customer.name,      w) + LF
  if (data.customer.phone) {
    r += leftRight('Phone:', data.customer.phone, w) + LF
  }
  r += leftRight('Type:', data.delivery_type.toUpperCase(), w) + LF

  if (data.delivery_type === 'delivery' && data.delivery_address) {
    r += 'Deliver to:' + LF
    r += '  ' + data.delivery_address + LF
  }

  r += thinDivider + LF

  // ── Items ──────────────────────────────────────────────────────────────────
  r += CMD.BOLD_ON
  r += leftRight('ITEM', 'AMOUNT', w) + LF
  r += CMD.BOLD_OFF

  for (const item of data.items) {
    const name = item.name.length > w ? item.name.substring(0, w) : item.name
    r += name + LF

    const qty = `  ${item.quantity} ${item.uom} x ${formatCurrency(item.unit_price)}`
    r += leftRight(qty, formatCurrency(item.total), w) + LF

    if (item.discount > 0) {
      r += leftRight('  Discount', '-' + formatCurrency(item.discount), w) + LF
    }
  }

  r += thinDivider + LF

  // ── Totals ─────────────────────────────────────────────────────────────────
  r += leftRight('Subtotal:', formatCurrency(data.subtotal), w) + LF
  if (data.discount > 0) {
    r += leftRight('Discount:', '-' + formatCurrency(data.discount), w) + LF
  }
  if (data.tax > 0) {
    r += leftRight('Tax:', formatCurrency(data.tax), w) + LF
  }
  r += CMD.BOLD_ON
  r += leftRight('TOTAL:', 'PHP ' + formatCurrency(data.total), w) + LF
  r += CMD.BOLD_OFF

  r += thinDivider + LF

  // ── Payments ───────────────────────────────────────────────────────────────
  r += CMD.BOLD_ON + 'PAYMENT(S):' + LF + CMD.BOLD_OFF

  for (const payment of data.payments) {
    const label = PAYMENT_LABELS[payment.method] || payment.method
    const ref   = payment.reference ? ` #${payment.reference}` : ''
    r += leftRight(`  ${label}${ref}`, formatCurrency(payment.amount), w) + LF
  }

  r += leftRight('Amount Paid:', formatCurrency(data.amount_paid), w) + LF

  if (data.change > 0) {
    r += CMD.BOLD_ON
    r += leftRight('Change:', 'PHP ' + formatCurrency(data.change), w) + LF
    r += CMD.BOLD_OFF
  }

  // ── Notes ──────────────────────────────────────────────────────────────────
  if (data.notes) {
    r += thinDivider + LF
    r += CMD.BOLD_ON + 'Notes:' + LF + CMD.BOLD_OFF
    r += '  ' + data.notes + LF
  }

  r += divider + LF

  // ── Footer ─────────────────────────────────────────────────────────────────
  r += CMD.CENTER
  r += CMD.BOLD_ON + 'Thank you for your purchase!' + LF + CMD.BOLD_OFF
  r += 'Please keep this receipt' + LF
  r += 'for returns/exchanges.' + LF
  r += LF
  r += 'This serves as your official receipt.' + LF
  r += LF
  r += '--- END OF RECEIPT ---' + LF

  // Feed and auto-cut
  r += CMD.FEED(4)
  r += CMD.CUT

  // Convert string to binary bytes
  const bytes = new Uint8Array(r.length)
  for (let i = 0; i < r.length; i++) {
    bytes[i] = r.charCodeAt(i) & 0xff
  }
  return bytes
}

// ---------------------------------------------------------------------------
// Base64 helper (browser-safe for large buffers)
// ---------------------------------------------------------------------------

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

// ---------------------------------------------------------------------------
// Transport layer — tries QZ Tray first, falls back to CUPS API route
// ---------------------------------------------------------------------------

async function sendToCUPS(bytes: Uint8Array, printerQueue: string): Promise<void> {
  const response = await fetch('/api/print', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bytes: toBase64(bytes), printer: printerQueue }),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body?.error || `HTTP ${response.status}: print failed`)
  }
}

/**
 * Print strategy:
 *  1. Try QZ Tray (localhost WebSocket) — works on any device with QZ Tray installed.
 *  2. Fall back to the Next.js CUPS API route — works only when the app is running
 *     locally on the same Mac the printer is attached to.
 *  3. If both fail, throws with a combined error message.
 */
async function sendBytes(bytes: Uint8Array, printerQueue: string): Promise<void> {
  // Dynamic import keeps qz-tray out of the SSR bundle
  const { printWithQZ } = await import('./qz-print')

  try {
    await printWithQZ(bytes, printerQueue)
    return
  } catch (qzErr) {
    console.warn('[print] QZ Tray unavailable, trying CUPS API route:', qzErr)
  }

  await sendToCUPS(bytes, printerQueue)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Prints a receipt to the configured thermal printer. */
export async function printUSBReceipt(
  data: ReceiptData,
  printerQueue: string
): Promise<void> {
  await sendBytes(buildReceiptBytes(data), printerQueue)
}

/** Prints a test receipt to verify the printer is working. */
export async function printUSBTestReceipt(printerQueue: string): Promise<void> {
  const now = new Date()
  const testData: ReceiptData = {
    transaction_number: 'TXN-TEST-001',
    date: now.toLocaleDateString('en-PH'),
    time: now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
    cashier: 'Test Cashier',
    branch: 'Main Branch',
    customer: { name: 'Test Customer', phone: '09XX-XXX-XXXX' },
    delivery_type: 'pickup',
    items: [
      {
        name: 'Test Product — 80mm QZ Tray USB Receipt',
        quantity: 2,
        unit_price: 150,
        uom: 'pc',
        discount: 0,
        total: 300,
      },
    ],
    subtotal: 300,
    discount: 0,
    tax: 0,
    total: 300,
    payments: [{ method: 'cash', amount: 300, reference: null }],
    amount_paid: 300,
    change: 0,
    notes: 'VOZY G80 USB test — QZ Tray + auto-cut',
  }

  await sendBytes(buildReceiptBytes(testData), printerQueue)
}

// ---------------------------------------------------------------------------
// Printer discovery helpers (calls GET /api/print)
// ---------------------------------------------------------------------------

export interface CupsPrinter {
  name: string
  status: 'idle' | 'disabled' | 'busy'
}

export async function listCupsPrinters(): Promise<CupsPrinter[]> {
  try {
    const response = await fetch('/api/print')
    if (!response.ok) return []
    const { printers } = await response.json()
    return printers ?? []
  } catch {
    return []
  }
}
