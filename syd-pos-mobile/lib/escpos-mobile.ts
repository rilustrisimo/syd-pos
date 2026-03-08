/**
 * ESC/POS receipt builder for React Native (mobile).
 *
 * Mirrors the logic in print-server/escpos.js but returns a Uint8Array
 * instead of a Node.js Buffer, so it can be chunked and written over BLE.
 *
 * Usage:
 *   const bytes = buildReceiptBytes(receiptData, 48) // 48 chars = 80mm
 *   // split into 20-byte BLE chunks and write each one
 */

// ── ESC/POS byte constants ────────────────────────────────────────────────────
const ESC = 0x1b
const GS  = 0x1d
const LF  = 0x0a

const CMD = {
  INIT:          [ESC, 0x40],
  CHARSET_PC437: [ESC, 0x74, 0x00], // force ASCII after reset (printer defaults to GB18030)
  LEFT:          [ESC, 0x61, 0x00],
  CENTER:        [ESC, 0x61, 0x01],
  RIGHT:         [ESC, 0x61, 0x02],
  BOLD_ON:       [ESC, 0x45, 0x01],
  BOLD_OFF:      [ESC, 0x45, 0x00],
  DOUBLE_SIZE:   [GS,  0x21, 0x11], // double width + double height
  NORMAL_SIZE:   [GS,  0x21, 0x00],
  FEED:  (n: number) => [ESC, 0x64, n],
  CUT:           [GS,  0x56, 0x42, 0x00], // partial cut
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert an ASCII/Latin string to bytes (one byte per char, 0xFF mask). */
function strBytes(str: string): number[] {
  const out: number[] = []
  for (let i = 0; i < str.length; i++) {
    out.push(str.charCodeAt(i) & 0xff)
  }
  return out
}

function fmt(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function pad(str: string, len: number, align: 'left' | 'right' = 'left'): string {
  if (str.length >= len) return str.substring(0, len)
  const spaces = ' '.repeat(len - str.length)
  return align === 'right' ? spaces + str : str + spaces
}

/** Put two strings on one line, left- and right-aligned. */
function lr(left: string, right: string, width: number): string {
  const gap = width - left.length - right.length
  if (gap < 1) {
    return left.substring(0, width) + '\n' + pad(right, width, 'right')
  }
  return left + ' '.repeat(gap) + right
}

// ── Receipt data type ─────────────────────────────────────────────────────────

export type ReceiptItem = {
  name: string
  quantity: number
  unit_price: number
  uom: string
  discount: number
  total: number
}

export type ReceiptPayment = {
  method: string
  amount: number
  reference: string | null
}

export type ReceiptData = {
  transaction_number: string
  date: string
  time: string
  cashier: string
  branch: string
  customer: { name: string; phone?: string | null }
  delivery_type: string
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

const PAYMENT_LABELS: Record<string, string> = {
  cash:          'Cash',
  gcash:         'GCash',
  maya:          'Maya',
  bank_transfer: 'Bank Transfer',
  credit:        'Credit/AR',
}

// ── Main builder ──────────────────────────────────────────────────────────────

/**
 * Build a complete ESC/POS receipt as a Uint8Array.
 * @param data  Receipt data
 * @param width Character width — 32 for 58mm paper, 48 for 80mm paper
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

  // ── Init ────────────────────────────────────────────────────────────────────
  cmd(CMD.INIT, CMD.CHARSET_PC437)

  // ── Header ──────────────────────────────────────────────────────────────────
  cmd(CMD.CENTER, CMD.BOLD_ON, CMD.DOUBLE_SIZE)
  line('SYD CONSTRUCTION')
  line('SUPPLIES TRADING')
  cmd(CMD.NORMAL_SIZE, CMD.BOLD_OFF)
  line(data.branch)
  line('Construction Materials & Hardware')

  // ── Divider ──────────────────────────────────────────────────────────────────
  cmd(CMD.LEFT)
  line(divider)

  // ── Transaction info ─────────────────────────────────────────────────────────
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

  // ── Items header ─────────────────────────────────────────────────────────────
  cmd(CMD.BOLD_ON)
  line(lr('ITEM', 'AMOUNT', width))
  cmd(CMD.BOLD_OFF)

  // ── Items ────────────────────────────────────────────────────────────────────
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

  // ── Totals ───────────────────────────────────────────────────────────────────
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

  // ── Payments ─────────────────────────────────────────────────────────────────
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

  // ── Notes ────────────────────────────────────────────────────────────────────
  if (data.notes) {
    line(thinDivider)
    cmd(CMD.BOLD_ON)
    line('Notes:')
    cmd(CMD.BOLD_OFF)
    line('  ' + data.notes)
  }

  line(divider)

  // ── Footer ───────────────────────────────────────────────────────────────────
  cmd(CMD.CENTER, CMD.BOLD_ON)
  line('Thank you for your purchase!')
  cmd(CMD.BOLD_OFF)
  line('Please keep this receipt')
  line('for returns/exchanges.')
  bytes.push(LF)
  line('This serves as your official receipt.')
  bytes.push(LF)
  line('--- END OF RECEIPT ---')

  // Feed + cut
  cmd(CMD.FEED(4))
  cmd(CMD.CUT)

  return new Uint8Array(bytes)
}

// ── Canvas / price quotation builder ─────────────────────────────────────────

export type CanvasItem = {
  name: string
  quantity: number
  unit_price: number
  uom: string
  discount: number
  total: number
}

export type CanvasData = {
  canvas_number: string
  date: string
  cashier: string
  branch: string
  customer: string          // name or 'Walk-in Customer'
  title?: string | null
  items: CanvasItem[]
  subtotal: number
  discount: number
  delivery_fee?: number
  other_fees?: number
  other_fees_notes?: string | null
  total: number
  notes?: string | null
}

/**
 * Build a canvass sheet (price quotation) as a Uint8Array.
 * Clearly labelled as NOT a sales receipt.
 */
export function buildCanvasBytes(data: CanvasData, width = 48): Uint8Array {
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
  line('SYD CONSTRUCTION')
  line('SUPPLIES TRADING')
  cmd(CMD.NORMAL_SIZE, CMD.BOLD_OFF)
  line(data.branch)
  line('Construction Materials & Hardware')

  cmd(CMD.LEFT)
  line(divider)

  // ── Title banner ──────────────────────────────────────────────────────────
  cmd(CMD.CENTER, CMD.BOLD_ON)
  line('CANVASS SHEET / PRICE QUOTATION')
  cmd(CMD.BOLD_OFF, CMD.LEFT)

  line(thinDivider)

  // ── Canvas info ───────────────────────────────────────────────────────────
  line(lr('CAN#:',     data.canvas_number,           width))
  line(lr('Date:',     data.date,                    width))
  line(lr('Prepared:', data.cashier,                 width))
  line(lr('Customer:', data.customer,                width))
  if (data.title) {
    line(lr('Title:',  data.title.substring(0, width - 8), width))
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
  cmd(CMD.BOLD_ON)
  line(lr('TOTAL:', 'PHP ' + fmt(data.total), width))
  cmd(CMD.BOLD_OFF)

  // ── Notes ──────────────────────────────────────────────────────────────────
  if (data.notes) {
    line(thinDivider)
    cmd(CMD.BOLD_ON)
    line('Notes:')
    cmd(CMD.BOLD_OFF)
    line('  ' + data.notes)
  }

  line(divider)

  // ── Disclaimer ────────────────────────────────────────────────────────────
  cmd(CMD.CENTER, CMD.BOLD_ON)
  line('** PRICE QUOTATION ONLY **')
  line('** NOT A SALES RECEIPT  **')
  cmd(CMD.BOLD_OFF)
  line('Prices subject to change.')
  line('Valid as of date above.')
  bytes.push(LF)
  line('--- END OF CANVASS SHEET ---')

  cmd(CMD.FEED(4))
  cmd(CMD.CUT)

  return new Uint8Array(bytes)
}


// ── Delivery slip builder ─────────────────────────────────────────────────────

/**
 * Build a delivery slip as a Uint8Array.
 * Printed automatically after the receipt for delivery orders.
 * Contains customer / delivery info, item quantities, and a receiver sign-off section.
 */
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
  line('SYD CONSTRUCTION SUPPLIES')
  line(data.branch)
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
  // Wrap long customer names
  const nameStr = data.customer.name.substring(0, width)
  line(nameStr)
  cmd(CMD.NORMAL_SIZE)
  if (data.customer.phone) {
    line('Tel: ' + data.customer.phone)
  }
  if (data.delivery_address) {
    cmd(CMD.BOLD_ON)
    line('Address:')
    cmd(CMD.BOLD_OFF)
    // Word-wrap address at width chars
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
    const name = item.name.length > maxNameLen ? item.name.substring(0, maxNameLen - 1) + '…' : item.name
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

  // Feed + cut (auto-cut separates receipt from delivery slip)
  cmd(CMD.FEED(4))
  cmd(CMD.CUT)

  return new Uint8Array(bytes)
}
