// Calculate selling price from COGS and markup
export function calculateSellingPrice(cogs: number, markupPercentage: number): number {
  return cogs * (1 + markupPercentage / 100)
}

// Calculate markup percentage from COGS and selling price
export function calculateMarkupPercentage(cogs: number, sellingPrice: number): number {
  if (cogs === 0) return 0
  return ((sellingPrice - cogs) / cogs) * 100
}

// Calculate gross profit
export function calculateGrossProfit(sellingPrice: number, cogs: number): number {
  return sellingPrice - cogs
}

// Calculate gross margin percentage
export function calculateGrossMargin(sellingPrice: number, cogs: number): number {
  if (sellingPrice === 0) return 0
  return ((sellingPrice - cogs) / sellingPrice) * 100
}

// Convert quantity between units
export function convertQuantity(
  quantity: number,
  conversionFactor: number,
  direction: 'from' | 'to' = 'to'
): number {
  if (direction === 'to') {
    return quantity * conversionFactor
  }
  return quantity / conversionFactor
}

// Calculate line total
export function calculateLineTotal(
  quantity: number,
  unitPrice: number,
  discount: number = 0
): number {
  return quantity * unitPrice - discount
}

// Calculate transaction totals
export function calculateTransactionTotals(
  lines: { quantity: number; unitPrice: number; discountAmount: number }[],
  discountPercentage: number = 0,
  taxRate: number = 0
): {
  subtotal: number
  discountAmount: number
  taxAmount: number
  total: number
} {
  const subtotal = lines.reduce(
    (sum, line) => sum + calculateLineTotal(line.quantity, line.unitPrice, line.discountAmount),
    0
  )

  const discountAmount = discountPercentage > 0
    ? subtotal * (discountPercentage / 100)
    : 0

  const taxableAmount = subtotal - discountAmount
  const taxAmount = taxRate > 0 ? taxableAmount * (taxRate / 100) : 0
  const total = taxableAmount + taxAmount

  return {
    subtotal,
    discountAmount,
    taxAmount,
    total: Math.max(0, total),
  }
}

// Check if customer has available credit
export function hasAvailableCredit(
  creditLimit: number,
  outstandingBalance: number,
  newSaleAmount: number
): boolean {
  return creditLimit >= outstandingBalance + newSaleAmount
}

// Calculate available credit
export function calculateAvailableCredit(
  creditLimit: number,
  outstandingBalance: number
): number {
  return Math.max(0, creditLimit - outstandingBalance)
}

// Round to specified decimal places
export function roundTo(num: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals)
  return Math.round(num * factor) / factor
}

// Calculate days overdue
export function calculateDaysOverdue(dueDate: string | Date): number {
  const due = typeof dueDate === 'string' ? new Date(dueDate) : dueDate
  const now = new Date()
  const diffTime = now.getTime() - due.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  return Math.max(0, diffDays)
}

// Get AR aging bucket
export function getAgingBucket(daysOverdue: number): string {
  if (daysOverdue <= 0) return 'current'
  if (daysOverdue <= 30) return '1-30'
  if (daysOverdue <= 60) return '31-60'
  if (daysOverdue <= 90) return '61-90'
  return '90+'
}

// Calculate inventory turnover
export function calculateInventoryTurnover(
  costOfGoodsSold: number,
  averageInventory: number
): number {
  if (averageInventory === 0) return 0
  return costOfGoodsSold / averageInventory
}

// Calculate days inventory outstanding
export function calculateDaysInventoryOutstanding(
  averageInventory: number,
  costOfGoodsSold: number,
  periodDays: number = 365
): number {
  if (costOfGoodsSold === 0) return 0
  return (averageInventory / costOfGoodsSold) * periodDays
}
