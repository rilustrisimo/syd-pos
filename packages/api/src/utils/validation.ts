/**
 * Validation utilities for POS data
 */

/**
 * Validate email format
 */
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Validate phone format (Philippine)
 */
const isValidPhone = (phone: string): boolean => {
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 10 && digits.length <= 12
}

/**
 * Validate transaction has required data
 */
export const validateTransaction = (data: any): { valid: boolean; errors: string[] } => {
  const errors: string[] = []

  if (!data.customer_id) {
    errors.push('Customer is required')
  }

  if (!data.lines || data.lines.length === 0) {
    errors.push('Transaction must have at least one line item')
  }

  if (data.lines && data.lines.length > 0) {
    data.lines.forEach((line: any, index: number) => {
      if (!line.product_id) {
        errors.push(`Line ${index + 1}: Product is required`)
      }
      if (!line.quantity || line.quantity <= 0) {
        errors.push(`Line ${index + 1}: Quantity must be greater than 0`)
      }
      if (!line.unit_price || line.unit_price < 0) {
        errors.push(`Line ${index + 1}: Unit price is invalid`)
      }
    })
  }

  if (!data.payments || data.payments.length === 0) {
    errors.push('Transaction must have at least one payment')
  }

  const totalAmount = calculateTransactionTotal(data.lines || [])
  const totalPayment = data.payments ? data.payments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0) : 0

  if (Math.abs(totalPayment - totalAmount) > 0.01) {
    errors.push(`Payment amount (₱${totalPayment}) does not match total (₱${totalAmount})`)
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Validate transaction line item
 */
export const validateTransactionLine = (line: any): { valid: boolean; errors: string[] } => {
  const errors: string[] = []

  if (!line.product_id) {
    errors.push('Product is required')
  }

  if (!line.quantity || line.quantity <= 0) {
    errors.push('Quantity must be greater than 0')
  }

  if (!line.unit_price || line.unit_price < 0) {
    errors.push('Unit price must be valid')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Validate product data
 */
export const validateProduct = (data: any): { valid: boolean; errors: string[] } => {
  const errors: string[] = []

  if (!data.code || !data.code.trim()) {
    errors.push('Product code is required')
  }

  if (!data.name || !data.name.trim()) {
    errors.push('Product name is required')
  }

  if (!data.category_id) {
    errors.push('Category is required')
  }

  if (data.current_selling_price === undefined || data.current_selling_price < 0) {
    errors.push('Selling price must be a valid number')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Validate customer data
 */
export const validateCustomer = (data: any): { valid: boolean; errors: string[] } => {
  const errors: string[] = []

  if (!data.display_name || !data.display_name.trim()) {
    errors.push('Customer name is required')
  }

  if (data.email && !isValidEmail(data.email)) {
    errors.push('Email format is invalid')
  }

  if (data.phone && !isValidPhone(data.phone)) {
    errors.push('Phone number format is invalid')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Validate return data
 */
export const validateReturn = (data: any): { valid: boolean; errors: string[] } => {
  const errors: string[] = []

  if (!data.transaction_id) {
    errors.push('Original transaction is required')
  }

  if (!data.return_lines || data.return_lines.length === 0) {
    errors.push('Return must have at least one line item')
  }

  if (data.return_lines && data.return_lines.length > 0) {
    data.return_lines.forEach((line: any, index: number) => {
      if (!line.product_id) {
        errors.push(`Line ${index + 1}: Product is required`)
      }
      if (!line.return_quantity || line.return_quantity <= 0) {
        errors.push(`Line ${index + 1}: Return quantity must be greater than 0`)
      }
      if (!line.refund_amount || line.refund_amount < 0) {
        errors.push(`Line ${index + 1}: Refund amount is invalid`)
      }
    })
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

// Email and phone validation functions are in validation module

/**
 * Validate numeric input
 */
export const isValidNumber = (value: any, min?: number, max?: number): boolean => {
  const num = parseFloat(value)
  if (isNaN(num)) return false
  if (min !== undefined && num < min) return false
  if (max !== undefined && num > max) return false
  return true
}

/**
 * Validate discount amount
 */
export const isValidDiscount = (discount: number, lineTotal: number): boolean => {
  return discount >= 0 && discount <= lineTotal
}

/**
 * Calculate transaction total from lines
 */
export const calculateTransactionTotal = (lines: any[]): number => {
  return lines.reduce((total, line) => {
    const lineTotal = (line.quantity || 0) * (line.unit_price || 0)
    const discount = line.discount_amount || 0
    return total + (lineTotal - discount)
  }, 0)
}

/**
 * Check if inventory is sufficient
 */
export const isInventorySufficient = (available: number, required: number): boolean => {
  return available >= required
}

/**
 * Validate return quantity against original transaction
 */
export const isValidReturnQuantity = (
  returnQuantity: number,
  originalQuantity: number,
  previousReturnQuantity: number = 0
): boolean => {
  return (
    returnQuantity > 0 &&
    returnQuantity <= originalQuantity &&
    returnQuantity + previousReturnQuantity <= originalQuantity
  )
}

export default {
  validateTransaction,
  validateTransactionLine,
  validateProduct,
  validateCustomer,
  validateReturn,
  isValidNumber,
  isValidDiscount,
  calculateTransactionTotal,
  isInventorySufficient,
  isValidReturnQuantity,
}
