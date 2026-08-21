/**
 * Thermal document printing — ESC/POS builder + transport layer.
 *
 * The POS no longer prints a customer receipt from here (that path — and its
 * "This serves as your official receipt." framing — was removed as part of
 * BIR compliance remediation; see PLAN notes / commit history). This file
 * builds and sends two non-tax documents instead, mutually exclusive per
 * order:
 *  - Delivery slip (`delivery_type === 'delivery'`): logistics doc handed to
 *    the rider/customer, no pricing, three-signature chain.
 *  - Pickup slip (`delivery_type === 'pickup'`): staff-internal only, never
 *    shown to the customer — the source staff copy from when hand-writing
 *    the real paper Invoice/OR into the BIR-registered booklet.
 *
 * Transport priority (sendBytes):
 *  1. Electron Bluetooth IPC (window.electronBluetooth) — COM port / SPP
 *  2. Electron USB IPC (window.electronPrint) — node-usb, queue "usb:vid:pid"
 *  3. CUPS API route (/api/print) — macOS only
 */

import { getStoreContactInfo } from '@/lib/supabase/queries/shop-settings'

export interface ReceiptItem {
  name: string
  quantity: number
  unit_price: number
  uom: string
  discount: number
  total: number
}

export interface ReceiptPayment {
  method: string
  amount: number
  reference?: string | null
}

// Named for the payload shape, not the (now-removed) printed receipt — this
// is the data a delivery slip is built from (plus fields no longer used by
// any printed output, kept so callers don't need to change their shape).
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
  delivery_geocoded_address?: string | null
  delivery_distance_km?: number | null
  delivery_road_based?: boolean | null
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

// ---------------------------------------------------------------------------
// ESC/POS byte constants
// ---------------------------------------------------------------------------

const ESC = 0x1b
const GS  = 0x1d
const LF  = 0x0a

const CMD = {
  INIT:          [ESC, 0x40],
  CHARSET_PC437: [ESC, 0x74, 0x00], // force ASCII after reset (printer defaults to GB18030)
  LEFT:          [ESC, 0x61, 0x00],
  CENTER:        [ESC, 0x61, 0x01],
  BOLD_ON:       [ESC, 0x45, 0x01],
  BOLD_OFF:      [ESC, 0x45, 0x00],
  DOUBLE_SIZE:   [GS,  0x21, 0x11], // double width + double height
  HEIGHT_DOUBLE: [GS,  0x21, 0x01], // double height only — bigger than body text, smaller than QTY's full double size
  NORMAL_SIZE:   [GS,  0x21, 0x00],
  FEED:  (n: number) => [ESC, 0x64, n],
  CUT:           [GS,  0x56, 0x42, 0x00], // partial cut
}

/** "PLEASE RECOUNT AND DOUBLE CHECK ITEMS" banner, printed near the top and
 * bottom of the delivery slip so it's seen both when the order is picked up
 * and again right before it leaves the store. */
function pushRecountBanner(
  bytes: number[],
  cmd: (...cmds: number[][]) => void,
  line: (str: string) => void,
  width: number,
): void {
  const stars = '*'.repeat(width)
  cmd(CMD.CENTER)
  line(stars)
  cmd(CMD.BOLD_ON)
  line('PLEASE RECOUNT AND')
  line('DOUBLE-CHECK ITEMS')
  cmd(CMD.BOLD_OFF)
  line(stars)
  cmd(CMD.LEFT)
}

// ---------------------------------------------------------------------------
// Unicode sanitizer (matches escpos-mobile.ts exactly)
// ---------------------------------------------------------------------------

function sanitize(str: string): string {
  return str
    .replace(/¼/g, '1/4').replace(/½/g, '1/2').replace(/¾/g, '3/4')
    .replace(/⅓/g, '1/3').replace(/⅔/g, '2/3')
    .replace(/⅛/g, '1/8').replace(/⅜/g, '3/8').replace(/⅝/g, '5/8').replace(/⅞/g, '7/8')
    .replace(/['']/g, "'").replace(/[""]/g, '"')
    .replace(/–/g, '-').replace(/—/g, '-').replace(/…/g, '...')
    .replace(/×/g, 'x').replace(/÷/g, '/').replace(/±/g, '+/-')
    .replace(/°/g, ' deg').replace(/₱/g, 'PHP').replace(/€/g, 'EUR').replace(/£/g, 'GBP')
    .replace(/[àáâãäå]/gi, (c) => c.toLowerCase() === c ? 'a' : 'A')
    .replace(/[èéêë]/gi,   (c) => c.toLowerCase() === c ? 'e' : 'E')
    .replace(/[ìíîï]/gi,   (c) => c.toLowerCase() === c ? 'i' : 'I')
    .replace(/[òóôõö]/gi,  (c) => c.toLowerCase() === c ? 'o' : 'O')
    .replace(/[ùúûü]/gi,   (c) => c.toLowerCase() === c ? 'u' : 'U')
    .replace(/[ñ]/gi,      (c) => c.toLowerCase() === c ? 'n' : 'N')
    .replace(/[ç]/gi,      (c) => c.toLowerCase() === c ? 'c' : 'C')
    .replace(/[^\x00-\x7F]/g, '?')
}

function strBytes(str: string): number[] {
  const safe = sanitize(str)
  const out: number[] = []
  for (let i = 0; i < safe.length; i++) out.push(safe.charCodeAt(i) & 0xff)
  return out
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/** Left-align + right-align two strings on the same line. */
function lr(left: string, right: string, width: number): string {
  const gap = width - left.length - right.length
  if (gap < 1) return left.substring(0, width) + '\n' + ' '.repeat(width - right.length) + right
  return left + ' '.repeat(gap) + right
}

// ---------------------------------------------------------------------------
// Plain-ASCII "form box" helpers — deliberately not a receipt look. Uses
// +/-/| only (safe on every ESC/POS printer, no charset risk) to frame the
// "not a receipt" header/footer and the totals block so the strongest
// receipt-coded visual cues (branded masthead, underlined grand total) never
// appear — this should read as an internal reference sheet at a glance, not
// a till receipt.
// ---------------------------------------------------------------------------

function boxTop(width: number): string { return '+' + '-'.repeat(width - 2) + '+' }
function boxBottom(width: number): string { return boxTop(width) }

function boxCenter(text: string, width: number): string {
  const inner = width - 2
  const t = text.length > inner ? text.substring(0, inner) : text
  const pad = inner - t.length
  const left = Math.floor(pad / 2)
  return '|' + ' '.repeat(left) + t + ' '.repeat(pad - left) + '|'
}

/** Mirrors lr()'s wrap-to-second-line behavior (not truncation) when the
 * amount doesn't fit next to its label — matters on narrow 58mm paper. */
function boxLR(left: string, right: string, width: number): string {
  const inner = width - 2
  const gap = inner - left.length - right.length
  if (gap < 1) {
    const firstLine  = '|' + left.substring(0, inner).padEnd(inner) + '|'
    const secondLine = '|' + right.padStart(inner) + '|'
    return firstLine + '\n' + secondLine
  }
  return '|' + left + ' '.repeat(gap) + right + '|'
}

/** Bold, bracketed section label — "[ ITEMS ]" — instead of a bare divider
 * line, so the layout reads as a labeled worksheet rather than receipt
 * sections separated by plain rules. */
function sectionHeader(
  cmd: (...cmds: number[][]) => void,
  line: (str: string) => void,
  label: string,
): void {
  cmd(CMD.BOLD_ON)
  line(`[ ${label} ]`)
  cmd(CMD.BOLD_OFF)
}

// ---------------------------------------------------------------------------
// Store info — fallbacks only. The real values live in the shop_settings
// table (shared with syd-shop; editable from Settings > Store Contact &
// Address in syd-pos) and are fetched fresh by printDeliverySlip/
// printPickupSlip. These constants are just what prints if that fetch fails.
// ---------------------------------------------------------------------------

const DEFAULT_STORE_ADDRESS = 'Sitio Landing, Talakag, Bukidnon'
const DEFAULT_STORE_PHONE   = '09765524334'

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  gcash: 'GCash',
  maya: 'Maya',
  bank_transfer: 'Bank Transfer',
  credit: 'Credit (Charge)',
  government_withholding: 'Gov\'t Withholding',
}
function paymentLabel(method: string): string {
  return PAYMENT_LABELS[method] || method.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ---------------------------------------------------------------------------
// Transport layer
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

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

/**
 * Send ESC/POS bytes to the configured thermal printer.
 *
 * Routing:
 *  - Bluetooth/COM (Electron): printerQueue = COM port path (e.g. "COM4").
 *    Each call opens the port, writes bytes, then closes — no persistent connection.
 *  - USB (Electron): printerQueue = "usb:vendorId:productId" → node-usb IPC
 *  - CUPS (macOS web): printerQueue = CUPS queue name → /api/print route
 */
async function sendBytes(bytes: Uint8Array, printerQueue: string): Promise<void> {
  // Branch 1: Bluetooth / COM port — open → settle → write → close per job
  if (typeof window !== 'undefined' && window.electronBluetooth && !printerQueue.startsWith('usb:')) {
    const result = await window.electronBluetooth.printBytes(printerQueue, toBase64(bytes))
    if (result.success) return
    throw new Error(result.error || 'Bluetooth print failed')
  }

  // Branch 2: USB via node-usb Electron IPC ("usb:vendorId:productId" paths)
  if (typeof window !== 'undefined' && window.electronPrint && printerQueue.startsWith('usb:')) {
    const parts = printerQueue.split(':')
    if (parts.length === 3) {
      const vendorId  = parseInt(parts[1], 10)
      const productId = parseInt(parts[2], 10)
      if (isNaN(vendorId) || isNaN(productId)) {
        throw new Error(`Invalid USB printer path: ${printerQueue}`)
      }
      const result = await window.electronPrint.printBytes(vendorId, productId, toBase64(bytes))
      if (result.success) return
      throw new Error(result.error || 'USB print failed')
    }
    throw new Error(`Invalid USB printer path: ${printerQueue}`)
  }

  // Branch 3: CUPS (macOS only)
  await sendToCUPS(bytes, printerQueue)
}

// ---------------------------------------------------------------------------
// Bluetooth connection management (Electron only)
// ---------------------------------------------------------------------------

/**
 * Verify a Bluetooth COM port can be opened (quick test — open then close).
 * Does NOT hold the port open. Each print job opens its own connection.
 */
export async function connectBtPrinter(portPath: string): Promise<void> {
  if (typeof window === 'undefined' || !window.electronBluetooth) {
    throw new Error('Bluetooth not available in this environment')
  }
  const result = await window.electronBluetooth.connect(portPath)
  if (!result.success) throw new Error(result.error || 'Failed to verify port')
}


// ---------------------------------------------------------------------------
// Delivery slip builder (mirrors escpos-mobile.ts buildDeliverySlipBytes)
// ---------------------------------------------------------------------------

export function buildDeliverySlipBytes(
  data: ReceiptData,
  width = 48,
  storeInfo?: { address: string; phone: string }
): Uint8Array {
  const storeAddress = storeInfo?.address || DEFAULT_STORE_ADDRESS
  const storePhone   = storeInfo?.phone   || DEFAULT_STORE_PHONE
  const bytes: number[] = []
  const thinDivider = '-'.repeat(width)

  function cmd(...cmds: number[][]): void {
    for (const c of cmds) bytes.push(...c)
  }
  function text(str: string): void { bytes.push(...strBytes(str)) }
  function line(str: string): void { text(str); bytes.push(LF) }

  const blank = (label: string) => {
    const fill = '_'.repeat(width - label.length - 1)
    line(`${label} ${fill}`)
    bytes.push(LF)
  }

  cmd(CMD.INIT, CMD.CHARSET_PC437)

  // ── Header — document type is the very first thing printed (so it's
  // identified at a glance), then the "not a receipt" disclaimer box, then
  // store name/contacts in small, plain text underneath — de-emphasized on
  // purpose so nothing here reads as a branded till-receipt masthead. ──────
  cmd(CMD.CENTER, CMD.BOLD_ON, CMD.DOUBLE_SIZE)
  line('DELIVERY SLIP')
  cmd(CMD.NORMAL_SIZE)
  line(boxTop(width))
  line(boxCenter('NOT AN OFFICIAL RECEIPT', width))
  line(boxBottom(width))
  cmd(CMD.BOLD_OFF)
  line('SYD Construction Supplies Trading')
  line(storeAddress)
  line(storePhone)
  cmd(CMD.LEFT)
  line(thinDivider)

  // ── Recount reminder (top) ──────────────────────────────────────────────
  pushRecountBanner(bytes, cmd, line, width)
  line(thinDivider)

  // ── Transaction reference ─────────────────────────────────────────────────
  sectionHeader(cmd, line, 'ORDER INFO')
  line(lr('TXN#:', data.transaction_number, width))
  line(lr('Date:', data.date, width))
  line(lr('Time:', data.time, width))
  line(lr('Cashier:', data.cashier, width))
  line(thinDivider)

  // ── Recipient info ────────────────────────────────────────────────────────
  sectionHeader(cmd, line, 'DELIVER TO')
  cmd(CMD.DOUBLE_SIZE)
  line(data.customer.name.substring(0, width))
  cmd(CMD.NORMAL_SIZE)
  if (data.customer.phone) {
    line('Tel: ' + data.customer.phone)
  }
  if (data.delivery_address || data.delivery_geocoded_address) {
    cmd(CMD.BOLD_ON)
    line('ADDRESS:')
    if (data.delivery_address) {
      const addr = data.delivery_address
      for (let i = 0; i < addr.length; i += width - 2) {
        line('  ' + addr.substring(i, i + width - 2))
      }
    }
    cmd(CMD.BOLD_OFF)
    if (data.delivery_geocoded_address) {
      line('  Near: ' + data.delivery_geocoded_address.substring(0, width - 8))
    }
  }
  if (data.delivery_distance_km != null) {
    const routeType = data.delivery_road_based ? 'Road (OpenStreetMap)' : 'Estimated (straight-line)'
    line(lr('Distance:', data.delivery_distance_km + ' km', width))
    line('  Route: ' + routeType)
  }
  line(thinDivider)

  // ── Items — checkbox to pen-mark as loaded, plus its own bold, double-size
  // QTY line so the quantity can't be misread at a glance (the single
  // highest-value legibility fix for preventing inventory discrepancies at
  // dispatch/delivery). Unit price + line total shown below, same as the
  // pickup slip's item format. ─────────────────────────────────────────────
  sectionHeader(cmd, line, 'ITEMS -- CHECK OFF AS LOADED')
  for (const item of data.items) {
    const maxNameLen = width - 4
    const name = item.name.length > maxNameLen ? item.name.substring(0, maxNameLen - 1) + '...' : item.name
    cmd(CMD.BOLD_ON, CMD.HEIGHT_DOUBLE)
    line('[ ] ' + name)
    cmd(CMD.NORMAL_SIZE, CMD.BOLD_OFF)
    cmd(CMD.CENTER, CMD.BOLD_ON, CMD.DOUBLE_SIZE)
    line(`QTY: ${item.quantity} ${item.uom}`)
    cmd(CMD.NORMAL_SIZE, CMD.BOLD_OFF, CMD.LEFT)
    const priceLine = `  ${item.quantity} ${item.uom} x ${fmt(item.unit_price)}`
    line(lr(priceLine, fmt(item.total), width))
  }
  line(thinDivider)

  // ── Totals — boxed and labeled "for reference only", same treatment as
  // the pickup slip, so the order value is verifiable against the items
  // above without looking like a receipt-style underlined grand total.
  // Includes delivery fee so the items + fee actually add up to the total —
  // labeled "TOTAL AMOUNT," not "amount to collect," since not every
  // delivery is COD (some are already paid, this is just the reference
  // figure either way). ─────────────────────────────────────────────────
  line(boxTop(width))
  line(boxCenter('FOR INTERNAL REFERENCE ONLY', width))
  line(boxLR('Subtotal:', 'PHP ' + fmt(data.subtotal), width))
  if (data.delivery_fee && data.delivery_fee > 0) {
    line(boxLR('Delivery Fee:', 'PHP ' + fmt(data.delivery_fee), width))
  }
  if (data.other_fees && data.other_fees > 0) {
    line(boxLR('Other Fees:', 'PHP ' + fmt(data.other_fees), width))
  }
  if (data.discount > 0) {
    line(boxLR('Discount:', '-PHP ' + fmt(data.discount), width))
  }
  line(boxLR('TOTAL AMOUNT:', 'PHP ' + fmt(data.total), width))
  line(boxBottom(width))
  line(thinDivider)

  // ── Signatures — grouped: staff verification, then customer ────────────────
  sectionHeader(cmd, line, 'STAFF ONLY')
  blank('Prepared by:')
  blank('Checked by: ')
  line(thinDivider)

  sectionHeader(cmd, line, 'CUSTOMER')
  line('NOT AN OFFICIAL RECEIPT')
  line('Your Invoice/OR is provided separately.')
  bytes.push(LF)
  blank('Received by:')
  blank('Date:        ')

  line(thinDivider)

  // ── Recount reminder (bottom) ───────────────────────────────────────────
  pushRecountBanner(bytes, cmd, line, width)

  // ── Footer — bookends the header box so "not a receipt" is the last thing
  // seen too, not a receipt-style "thank you" / "end of transaction" line.
  cmd(CMD.CENTER)
  line(boxTop(width))
  cmd(CMD.BOLD_ON)
  line(boxCenter('END OF REFERENCE SHEET', width))
  line(boxCenter('NOT A RECEIPT', width))
  cmd(CMD.BOLD_OFF)
  line(boxBottom(width))

  cmd(CMD.FEED(4))
  cmd(CMD.CUT)

  return new Uint8Array(bytes)
}

// ---------------------------------------------------------------------------
// Pickup slip builder — staff-internal only, never shown to the customer.
// Source document staff copy from when hand-writing the real paper
// Invoice/OR into the BIR-registered booklet. Carries real pricing (unlike
// the delivery slip) since that's exactly what it's used to transcribe.
// ---------------------------------------------------------------------------

export function buildPickupSlipBytes(
  data: ReceiptData,
  width = 48,
  storeInfo?: { address: string; phone: string }
): Uint8Array {
  const storeAddress = storeInfo?.address || DEFAULT_STORE_ADDRESS
  const storePhone   = storeInfo?.phone   || DEFAULT_STORE_PHONE
  const bytes: number[] = []
  const thinDivider = '-'.repeat(width)

  function cmd(...cmds: number[][]): void {
    for (const c of cmds) bytes.push(...c)
  }
  function text(str: string): void { bytes.push(...strBytes(str)) }
  function line(str: string): void { text(str); bytes.push(LF) }

  const blank = (label: string) => {
    const fill = '_'.repeat(width - label.length - 1)
    line(`${label} ${fill}`)
    bytes.push(LF)
  }

  cmd(CMD.INIT, CMD.CHARSET_PC437)

  // ── Header — document type first, same as the delivery slip, then the
  // "not a receipt" disclaimer box, then de-emphasized store branding. ────
  cmd(CMD.CENTER, CMD.BOLD_ON, CMD.DOUBLE_SIZE)
  line('PICKUP SLIP')
  cmd(CMD.NORMAL_SIZE)
  line(boxTop(width))
  line(boxCenter('NOT AN OFFICIAL RECEIPT', width))
  line(boxBottom(width))
  cmd(CMD.BOLD_OFF)
  line('SYD Construction Supplies Trading')
  line(storeAddress)
  line(storePhone)
  cmd(CMD.LEFT)
  line('Internal use only -- do not tell or imply')
  line('to the customer that this replaces their')
  line('Invoice/OR.')
  line(thinDivider)

  // ── Transaction reference ───────────────────────────────────────────────
  sectionHeader(cmd, line, 'ORDER INFO')
  line(lr('TXN#:', data.transaction_number, width))
  line(lr('Date:', data.date, width))
  line(lr('Time:', data.time, width))
  line(lr('Customer:', data.customer.name, width))
  if (data.customer.phone) {
    line(lr('Tel:', data.customer.phone, width))
  }
  line(thinDivider)

  // ── Items — full pricing detail + checkbox, this is the staff's copy
  // source for hand-writing the real Invoice/OR. Quantity + UOM get their
  // own bold, double-size line — same legibility treatment as the delivery
  // slip — since a misread quantity here is exactly what causes inventory
  // discrepancies later.
  sectionHeader(cmd, line, 'ITEMS -- CHECK OFF AS PULLED')
  for (const item of data.items) {
    const maxNameLen = width - 4
    const name = item.name.length > maxNameLen ? item.name.substring(0, maxNameLen - 1) + '...' : item.name
    cmd(CMD.BOLD_ON, CMD.HEIGHT_DOUBLE)
    line('[ ] ' + name)
    cmd(CMD.NORMAL_SIZE, CMD.BOLD_OFF)
    cmd(CMD.CENTER, CMD.BOLD_ON, CMD.DOUBLE_SIZE)
    line(`QTY: ${item.quantity} ${item.uom}`)
    cmd(CMD.NORMAL_SIZE, CMD.BOLD_OFF, CMD.LEFT)
    const priceLine = `  ${item.quantity} ${item.uom} x ${fmt(item.unit_price)}`
    line(lr(priceLine, fmt(item.total), width))
  }
  line(thinDivider)

  // ── Totals — boxed and labeled "for reference only" instead of a
  // receipt-style underlined grand total. ───────────────────────────────
  line(boxTop(width))
  line(boxCenter('FOR INTERNAL REFERENCE ONLY', width))
  line(boxLR('Subtotal:', 'PHP ' + fmt(data.subtotal), width))
  if (data.discount > 0) {
    line(boxLR('Discount:', '-PHP ' + fmt(data.discount), width))
  }
  line(boxLR('TOTAL:', 'PHP ' + fmt(data.total), width))
  line(boxBottom(width))
  line(thinDivider)

  // ── Payment ───────────────────────────────────────────────────────────────
  sectionHeader(cmd, line, 'PAYMENT')
  for (const payment of data.payments) {
    line(lr(paymentLabel(payment.method) + ':', 'PHP ' + fmt(payment.amount), width))
  }
  line(lr('Amount Paid:', 'PHP ' + fmt(data.amount_paid), width))
  if (data.change > 0) {
    line(lr('Change:', 'PHP ' + fmt(data.change), width))
  }
  line(thinDivider)

  // ── Signatures — grouped: staff verification, then customer, same as the
  // delivery slip. "Received by" here is the customer picking up in person. ──
  sectionHeader(cmd, line, 'STAFF ONLY')
  blank('Prepared by:')
  blank('Checked by: ')
  line(thinDivider)

  sectionHeader(cmd, line, 'CUSTOMER')
  line('NOT AN OFFICIAL RECEIPT')
  line('Your Invoice/OR is provided separately.')
  bytes.push(LF)
  blank('Received by:')
  blank('Date:        ')

  // ── Footer — bookends the header box, same as the delivery slip. ────────
  cmd(CMD.CENTER)
  line(boxTop(width))
  cmd(CMD.BOLD_ON)
  line(boxCenter('END OF REFERENCE SHEET', width))
  line(boxCenter('NOT A RECEIPT', width))
  cmd(CMD.BOLD_OFF)
  line(boxBottom(width))

  cmd(CMD.FEED(4))
  cmd(CMD.CUT)

  return new Uint8Array(bytes)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Print the delivery slip for a delivery transaction. No-op for pickup
 * orders — see printPickupSlip for those.
 */
export async function printDeliverySlip(data: ReceiptData, printerQueue: string, width = 48): Promise<void> {
  if (data.delivery_type !== 'delivery') return
  const storeInfo = await fetchStoreInfo()
  await sendBytes(buildDeliverySlipBytes(data, width, storeInfo), printerQueue)
}

/**
 * Print the staff-internal pickup slip. No-op for delivery orders (they get
 * a delivery slip instead — the two are mutually exclusive per order).
 */
export async function printPickupSlip(data: ReceiptData, printerQueue: string, width = 48): Promise<void> {
  if (data.delivery_type !== 'pickup') return
  const storeInfo = await fetchStoreInfo()
  await sendBytes(buildPickupSlipBytes(data, width, storeInfo), printerQueue)
}

/** Best-effort fetch of the live store address/phone (shop_settings) —
 * falls back to the hardcoded defaults on any error so a DB hiccup never
 * blocks printing. */
async function fetchStoreInfo(): Promise<{ address: string; phone: string }> {
  try {
    const info = await getStoreContactInfo()
    return { address: info.store_address, phone: info.store_phone }
  } catch {
    return { address: DEFAULT_STORE_ADDRESS, phone: DEFAULT_STORE_PHONE }
  }
}

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

// ---------------------------------------------------------------------------
// Printer discovery — lists all available thermal printers across all transports
// ---------------------------------------------------------------------------

export interface DiscoveredPrinter {
  value: string          // the queue/path to pass to sendBytes / printDeliverySlip
  label: string          // human-readable display name
  type: 'bluetooth' | 'usb' | 'cups'
}

/**
 * List all printers available in the current environment:
 *  - Bluetooth/COM (Electron): virtual COM ports from paired Bluetooth devices
 *  - USB (Electron): USB class-7 devices via node-usb
 *  - CUPS (macOS web): from /api/print
 */
export async function listAllPrinters(): Promise<DiscoveredPrinter[]> {
  const results: DiscoveredPrinter[] = []

  if (typeof window === 'undefined') return results

  // Bluetooth / COM ports
  if (window.electronBluetooth) {
    try {
      const ports = await window.electronBluetooth.listPorts()
      for (const p of ports) {
        results.push({
          value: p.path,
          // Show COM path first so the exact port is always visible in truncated UI labels.
          label: p.displayName && p.displayName !== p.path ? `${p.path} - ${p.displayName}` : p.path,
          type: 'bluetooth',
        })
      }
    } catch { /* ignore */ }
  }

  // USB printers
  if (window.electronPrint) {
    try {
      const devices = await window.electronPrint.listUsbPrinters()
      for (const d of devices) {
        const label = d.manufacturer && d.product
          ? `${d.manufacturer} ${d.product}`
          : `USB Printer (${d.vendorId.toString(16)}:${d.productId.toString(16)})`
        results.push({
          value: `usb:${d.vendorId}:${d.productId}`,
          label,
          type: 'usb',
        })
      }
    } catch { /* ignore */ }
  }

  // CUPS (macOS / non-Electron)
  if (!window.electronBluetooth && !window.electronPrint) {
    try {
      const cups = await listCupsPrinters()
      for (const p of cups) {
        results.push({ value: p.name, label: `${p.name} (${p.status})`, type: 'cups' })
      }
    } catch { /* ignore */ }
  }

  return results
}

// ---------------------------------------------------------------------------
// Test print
// ---------------------------------------------------------------------------

/**
 * Send a short ESC/POS test page to verify the printer connection.
 * For Bluetooth printers, the port must be connected first via connectBtPrinter().
 * printerQueue is only used for the info line printed on the page.
 */
export async function printTestPage(printerQueue: string, width = 48): Promise<void> {
  const bytes: number[] = []
  const divider = '='.repeat(width)

  function cmd(...cmds: number[][]): void { for (const c of cmds) bytes.push(...c) }
  function line(str: string): void {
    const safe = str.replace(/[^\x00-\x7F]/g, '?')
    for (let i = 0; i < safe.length; i++) bytes.push(safe.charCodeAt(i) & 0xff)
    bytes.push(0x0a)
  }

  cmd([ESC, 0x40])                        // INIT
  cmd([ESC, 0x61, 0x01])                  // CENTER
  cmd([ESC, 0x45, 0x01], [GS, 0x21, 0x11]) // BOLD + DOUBLE SIZE
  line('PRINTER TEST')
  cmd([GS, 0x21, 0x00], [ESC, 0x45, 0x00]) // normal
  cmd([ESC, 0x61, 0x00])                  // LEFT
  line(divider)
  line(`SYD POS Desktop`)
  line(`Queue: ${printerQueue}`)
  line(`Width: ${width} chars`)
  line(new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' }))
  line(divider)
  cmd([ESC, 0x61, 0x01])
  line('** CONNECTION OK **')
  cmd([ESC, 0x61, 0x00])
  cmd([ESC, 0x64, 4])                     // FEED 4
  cmd([GS, 0x56, 0x42, 0x00])            // CUT

  await sendBytes(new Uint8Array(bytes), printerQueue)
}
