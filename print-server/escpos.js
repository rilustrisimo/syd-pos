/**
 * ESC/POS Receipt Builder for Vozy G80 Thermal Printer
 *
 * Converts receipt data (from the SYD POS web app) into ESC/POS byte commands.
 * Supports both 58mm (32 char) and 80mm (48 char) paper widths.
 */

const ESC = '\x1b'
const GS = '\x1d'
const LF = '\n'

const CMD = {
  INIT: ESC + '@',
  // Alignment
  LEFT: ESC + 'a' + '\x00',
  CENTER: ESC + 'a' + '\x01',
  RIGHT: ESC + 'a' + '\x02',
  // Emphasis
  BOLD_ON: ESC + 'E' + '\x01',
  BOLD_OFF: ESC + 'E' + '\x00',
  UNDERLINE_ON: ESC + '-' + '\x01',
  UNDERLINE_OFF: ESC + '-' + '\x00',
  // Character size: GS ! n  (bit 0-3 = width, bit 4-7 = height)
  DOUBLE_SIZE: GS + '!' + '\x11', // double width + double height
  NORMAL_SIZE: GS + '!' + '\x00',
  // Feed & cut
  FEED: (n) => ESC + 'd' + String.fromCharCode(n),
  CUT: GS + 'V' + 'B' + '\x00', // partial cut
}

// --- helpers -----------------------------------------------------------------

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/** Pad / truncate a string to exactly `len` characters */
function pad(str, len, align = 'left') {
  if (str.length > len) return str.substring(0, len)
  const spaces = ' '.repeat(len - str.length)
  return align === 'right' ? spaces + str : str + spaces
}

/** Print two strings on one line: left-aligned and right-aligned */
function leftRight(left, right, width) {
  const gap = width - left.length - right.length
  if (gap < 1) {
    // overflow — put right value on a new line
    return left.substring(0, width) + LF + pad(right, width, 'right')
  }
  return left + ' '.repeat(gap) + right
}

// --- main builder ------------------------------------------------------------

const PAYMENT_LABELS = {
  cash: 'Cash',
  gcash: 'GCash',
  maya: 'Maya',
  bank_transfer: 'Bank Transfer',
  credit: 'Credit/AR',
}

/**
 * Build a complete ESC/POS receipt string from ReceiptData.
 * @param {object} data  - matches the ReceiptData interface in the web app
 * @param {number} width - character width (32 for 58mm, 48 for 80mm)
 * @returns {string} raw ESC/POS data (use Buffer.from(result, 'binary') to send)
 */
function buildReceipt(data, width = 48) {
  const divider = '='.repeat(width)
  const thinDivider = '-'.repeat(width)
  let r = ''

  // Initialize printer
  r += CMD.INIT

  // ── Header ──────────────────────────────────────────────────────────────
  r += CMD.CENTER
  r += CMD.BOLD_ON + CMD.DOUBLE_SIZE
  r += 'SYD CONSTRUCTION' + LF
  r += 'SUPPLIES TRADING' + LF
  r += CMD.NORMAL_SIZE + CMD.BOLD_OFF
  r += data.branch + LF
  r += 'Construction Materials & Hardware' + LF

  // ── Divider ─────────────────────────────────────────────────────────────
  r += CMD.LEFT
  r += divider + LF

  // ── Transaction info ────────────────────────────────────────────────────
  r += leftRight('TXN#:', data.transaction_number, width) + LF
  r += leftRight('Date:', data.date, width) + LF
  r += leftRight('Time:', data.time, width) + LF
  r += leftRight('Cashier:', data.cashier, width) + LF
  r += leftRight('Customer:', data.customer.name, width) + LF
  if (data.customer.phone) {
    r += leftRight('Phone:', data.customer.phone, width) + LF
  }
  r += leftRight('Type:', data.delivery_type.toUpperCase(), width) + LF

  if (data.delivery_type === 'delivery' && data.delivery_address) {
    r += 'Deliver to:' + LF
    r += '  ' + data.delivery_address + LF
  }

  r += thinDivider + LF

  // ── Items header ────────────────────────────────────────────────────────
  r += CMD.BOLD_ON
  r += leftRight('ITEM', 'AMOUNT', width) + LF
  r += CMD.BOLD_OFF

  // ── Items ───────────────────────────────────────────────────────────────
  for (const item of data.items) {
    const name = item.name.length > width ? item.name.substring(0, width) : item.name
    r += name + LF

    const qty = `  ${item.quantity} ${item.uom} x ${formatCurrency(item.unit_price)}`
    r += leftRight(qty, formatCurrency(item.total), width) + LF

    if (item.discount > 0) {
      r += leftRight('  Discount', '-' + formatCurrency(item.discount), width) + LF
    }
  }

  r += thinDivider + LF

  // ── Totals ──────────────────────────────────────────────────────────────
  r += leftRight('Subtotal:', formatCurrency(data.subtotal), width) + LF
  if (data.discount > 0) {
    r += leftRight('Discount:', '-' + formatCurrency(data.discount), width) + LF
  }
  if (data.tax > 0) {
    r += leftRight('Tax:', formatCurrency(data.tax), width) + LF
  }
  r += CMD.BOLD_ON
  r += leftRight('TOTAL:', 'PHP ' + formatCurrency(data.total), width) + LF
  r += CMD.BOLD_OFF

  r += thinDivider + LF

  // ── Payments ────────────────────────────────────────────────────────────
  r += CMD.BOLD_ON
  r += 'PAYMENT(S):' + LF
  r += CMD.BOLD_OFF

  for (const payment of data.payments) {
    const label = PAYMENT_LABELS[payment.method] || payment.method
    const ref = payment.reference ? ` #${payment.reference}` : ''
    r += leftRight(`  ${label}${ref}`, formatCurrency(payment.amount), width) + LF
  }

  r += leftRight('Amount Paid:', formatCurrency(data.amount_paid), width) + LF

  if (data.change > 0) {
    r += CMD.BOLD_ON
    r += leftRight('Change:', 'PHP ' + formatCurrency(data.change), width) + LF
    r += CMD.BOLD_OFF
  }

  // ── Notes ───────────────────────────────────────────────────────────────
  if (data.notes) {
    r += thinDivider + LF
    r += CMD.BOLD_ON + 'Notes:' + LF + CMD.BOLD_OFF
    r += '  ' + data.notes + LF
  }

  r += divider + LF

  // ── Footer ──────────────────────────────────────────────────────────────
  r += CMD.CENTER
  r += CMD.BOLD_ON
  r += 'Thank you for your purchase!' + LF
  r += CMD.BOLD_OFF
  r += 'Please keep this receipt' + LF
  r += 'for returns/exchanges.' + LF
  r += LF
  r += 'This serves as your official receipt.' + LF
  r += LF
  r += '--- END OF RECEIPT ---' + LF

  // Feed paper and cut
  r += CMD.FEED(4)
  r += CMD.CUT

  return r
}

module.exports = { buildReceipt, CMD }
