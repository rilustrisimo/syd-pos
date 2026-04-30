/**
 * Thermal receipt printing — ESC/POS builder + transport layer.
 *
 * The ESC/POS format exactly mirrors syd-pos-mobile/lib/escpos-mobile.ts.
 * Transport priority (sendBytes):
 *  1. Electron Bluetooth IPC (window.electronBluetooth) — COM port / SPP
 *  2. Electron USB IPC (window.electronPrint) — node-usb, queue "usb:vid:pid"
 *  3. CUPS API route (/api/print) — macOS only
 */

import type { ReceiptData } from '@/components/print/receipt-template'

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
  NORMAL_SIZE:   [GS,  0x21, 0x00],
  FEED:  (n: number) => [ESC, 0x64, n],
  CUT:           [GS,  0x56, 0x42, 0x00], // partial cut
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
// Store constants (matches escpos-mobile.ts)
// ---------------------------------------------------------------------------

const STORE_ADDRESS  = 'Sitio Landing, Talakag, Bukidnon'
const STORE_CONTACTS = '09164527225 / 09274746352'

const PAYMENT_LABELS: Record<string, string> = {
  cash:          'Cash',
  gcash:         'GCash',
  maya:          'Maya',
  bank_transfer: 'Bank Transfer',
  credit:        'Credit/AR',
}

// ---------------------------------------------------------------------------
// ESC/POS receipt builder — identical format to escpos-mobile.ts
// ---------------------------------------------------------------------------

/**
 * @param data   Receipt data
 * @param width  Character width: 32 for 58mm paper, 48 for 80mm paper (default)
 */
export function buildReceiptBytes(data: ReceiptData, width = 48): Uint8Array {
  const bytes: number[] = []
  const divider     = '='.repeat(width)
  const thinDivider = '-'.repeat(width)

  function cmd(...cmds: number[][]): void {
    for (const c of cmds) bytes.push(...c)
  }
  function text(str: string): void { bytes.push(...strBytes(str)) }
  function line(str: string): void { text(str); bytes.push(LF) }

  // ── Init ──────────────────────────────────────────────────────────────────
  cmd(CMD.INIT, CMD.CHARSET_PC437)

  // ── Header ────────────────────────────────────────────────────────────────
  cmd(CMD.CENTER, CMD.BOLD_ON, CMD.DOUBLE_SIZE)
  line('SYD CONSTRUCTION')
  line('SUPPLIES TRADING')
  cmd(CMD.NORMAL_SIZE, CMD.BOLD_OFF)
  line('Construction Materials & Hardware')
  line(STORE_ADDRESS)
  line(STORE_CONTACTS)

  // ── Divider ───────────────────────────────────────────────────────────────
  cmd(CMD.LEFT)
  line(divider)

  // ── Transaction info ──────────────────────────────────────────────────────
  line(lr('TXN#:',     data.transaction_number,       width))
  line(lr('Date:',     data.date,                     width))
  line(lr('Time:',     data.time,                     width))
  line(lr('Cashier:',  data.cashier,                  width))
  line(lr('Customer:', data.customer.name,             width))
  if (data.customer.phone) {
    line(lr('Phone:', data.customer.phone, width))
  }
  line(lr('Type:', data.delivery_type.toUpperCase(), width))
  if (data.delivery_type === 'delivery' && data.delivery_address) {
    line('Deliver to:')
    line('  ' + data.delivery_address)
  }

  line(thinDivider)

  // ── Items header ──────────────────────────────────────────────────────────
  cmd(CMD.BOLD_ON)
  line(lr('ITEM', 'AMOUNT', width))
  cmd(CMD.BOLD_OFF)

  // ── Items ─────────────────────────────────────────────────────────────────
  for (const item of data.items) {
    const name = item.name.length > width ? item.name.substring(0, width) : item.name
    line(name)
    const qty = `  ${item.quantity} ${item.uom} x ${fmt(item.unit_price)}`
    line(lr(qty, fmt(item.total), width))
    if (item.discount > 0) {
      line(lr('  Discount', '-' + fmt(item.discount), width))
    }
  }

  line(thinDivider)

  // ── Totals ────────────────────────────────────────────────────────────────
  line(lr('Subtotal:', fmt(data.subtotal), width))
  if (data.discount > 0) {
    line(lr('Discount:', '-' + fmt(data.discount), width))
  }
  if ((data.delivery_fee ?? 0) > 0) {
    line(lr('Delivery Fee:', fmt(data.delivery_fee!), width))
  }
  if ((data.other_fees ?? 0) > 0) {
    line(lr('Other Fees:', fmt(data.other_fees!), width))
    if (data.other_fees_notes) {
      line('  ' + data.other_fees_notes.substring(0, width - 2))
    }
  }
  if (data.tax > 0) {
    line(lr('Tax:', fmt(data.tax), width))
  }
  cmd(CMD.BOLD_ON)
  line(lr('TOTAL:', 'PHP ' + fmt(data.total), width))
  cmd(CMD.BOLD_OFF)

  line(thinDivider)

  // ── Payments ──────────────────────────────────────────────────────────────
  cmd(CMD.BOLD_ON)
  line('PAYMENT(S):')
  cmd(CMD.BOLD_OFF)
  for (const payment of data.payments) {
    const label = PAYMENT_LABELS[payment.method] ?? payment.method
    const ref   = payment.reference ? ` #${payment.reference}` : ''
    line(lr(`  ${label}${ref}`, fmt(payment.amount), width))
  }
  line(lr('Amount Paid:', fmt(data.amount_paid), width))
  if (data.change > 0) {
    cmd(CMD.BOLD_ON)
    line(lr('Change:', 'PHP ' + fmt(data.change), width))
    cmd(CMD.BOLD_OFF)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────
  if (data.notes) {
    line(thinDivider)
    cmd(CMD.BOLD_ON)
    line('Notes:')
    cmd(CMD.BOLD_OFF)
    line('  ' + data.notes)
  }

  line(divider)

  // ── Footer ────────────────────────────────────────────────────────────────
  cmd(CMD.CENTER, CMD.BOLD_ON)
  line('Thank you for your purchase!')
  cmd(CMD.BOLD_OFF)
  line('Please keep this receipt.')
  bytes.push(LF)
  line('Returns due to change of mind')
  line('will NOT be accepted.')
  line('Items may be exchanged only')
  line('if in good condition.')
  bytes.push(LF)
  line('This serves as your official receipt.')
  bytes.push(LF)
  line('--- END OF RECEIPT ---')

  // Feed + cut
  cmd(CMD.FEED(4))
  cmd(CMD.CUT)

  return new Uint8Array(bytes)
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

export function buildDeliverySlipBytes(data: ReceiptData, width = 48): Uint8Array {
  const bytes: number[] = []
  const divider     = '='.repeat(width)
  const thinDivider = '-'.repeat(width)

  function cmd(...cmds: number[][]): void {
    for (const c of cmds) bytes.push(...c)
  }
  function text(str: string): void { bytes.push(...strBytes(str)) }
  function line(str: string): void { text(str); bytes.push(LF) }

  cmd(CMD.INIT, CMD.CHARSET_PC437)

  // ── Header ────────────────────────────────────────────────────────────────
  cmd(CMD.CENTER, CMD.BOLD_ON, CMD.DOUBLE_SIZE)
  line('DELIVERY SLIP')
  cmd(CMD.NORMAL_SIZE, CMD.BOLD_OFF)
  line('SYD CONSTRUCTION SUPPLIES TRADING')
  line('Construction Materials & Hardware')
  line(STORE_ADDRESS)
  line(STORE_CONTACTS)
  cmd(CMD.LEFT)
  line(divider)

  // ── Transaction reference ─────────────────────────────────────────────────
  line(lr('TXN#:', data.transaction_number, width))
  line(lr('Date:', data.date, width))
  line(lr('Time:', data.time, width))
  line(lr('Prepared by:', data.cashier, width))
  line(thinDivider)

  // ── Recipient info ────────────────────────────────────────────────────────
  cmd(CMD.BOLD_ON)
  line('DELIVER TO:')
  cmd(CMD.BOLD_OFF)
  cmd(CMD.DOUBLE_SIZE)
  line(data.customer.name.substring(0, width))
  cmd(CMD.NORMAL_SIZE)
  if (data.customer.phone) {
    line('Tel: ' + data.customer.phone)
  }
  if (data.delivery_address) {
    cmd(CMD.BOLD_ON)
    line('Address:')
    cmd(CMD.BOLD_OFF)
    const addr = data.delivery_address
    for (let i = 0; i < addr.length; i += width - 2) {
      line('  ' + addr.substring(i, i + width - 2))
    }
  }
  line(thinDivider)

  // ── Items ─────────────────────────────────────────────────────────────────
  cmd(CMD.BOLD_ON)
  line(lr('ITEM', 'QTY', width))
  cmd(CMD.BOLD_OFF)
  for (const item of data.items) {
    const maxNameLen = width - 12
    const name = item.name.length > maxNameLen ? item.name.substring(0, maxNameLen - 1) + '...' : item.name
    line(lr(name, `${item.quantity} ${item.uom}`, width))
  }
  line(thinDivider)

  // ── Totals ────────────────────────────────────────────────────────────────
  if ((data.delivery_fee ?? 0) > 0) {
    line(lr('Delivery Fee:', 'PHP ' + fmt(data.delivery_fee!), width))
  }
  if ((data.other_fees ?? 0) > 0) {
    line(lr('Other Fees:', 'PHP ' + fmt(data.other_fees!), width))
    if (data.other_fees_notes) {
      line('  ' + data.other_fees_notes.substring(0, width - 2))
    }
  }
  cmd(CMD.BOLD_ON)
  line(lr('TOTAL AMOUNT:', 'PHP ' + fmt(data.total), width))
  cmd(CMD.BOLD_OFF)
  line(divider)

  // ── Acknowledgement ───────────────────────────────────────────────────────
  cmd(CMD.CENTER, CMD.BOLD_ON)
  line('RECEIVED IN GOOD CONDITION')
  cmd(CMD.BOLD_OFF, CMD.LEFT)
  bytes.push(LF)

  const blank = (label: string) => {
    const fill = '_'.repeat(width - label.length - 1)
    line(`${label} ${fill}`)
    bytes.push(LF)
  }

  blank('Print Name:')
  blank('Signature: ')
  blank('Date:      ')
  blank('Remarks:   ')

  cmd(CMD.CENTER)
  line('--- END OF DELIVERY SLIP ---')

  cmd(CMD.FEED(4))
  cmd(CMD.CUT)

  return new Uint8Array(bytes)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Print receipt, then — for delivery transactions — also print the delivery
 * slip. This is the correct function to call after a completed transaction.
 */
export async function printThermalTransaction(data: ReceiptData, printerQueue: string, width = 48): Promise<void> {
  await sendBytes(buildReceiptBytes(data, width), printerQueue)
  if (data.delivery_type === 'delivery') {
    await sendBytes(buildDeliverySlipBytes(data, width), printerQueue)
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
  value: string          // the queue/path to pass to sendBytes / printThermalTransaction
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
          label: p.displayName && p.displayName !== p.path ? `${p.path} — ${p.displayName}` : p.path,
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
