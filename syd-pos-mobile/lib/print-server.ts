import { Platform } from 'react-native'
import { Transaction, TransactionLine } from '@syd/api'

export type ReceiptWidth = '58mm' | '80mm'

type PrintResponse = {
  success?: boolean
  message?: string
  error?: string
}

const DEFAULT_SERVER_BY_PLATFORM = {
  ios: 'http://127.0.0.1:9100',
  android: 'http://10.0.2.2:9100',
  default: 'http://127.0.0.1:9100',
}

export function getPrintServerBaseUrl() {
  if (process.env.EXPO_PUBLIC_PRINT_SERVER_URL) {
    return process.env.EXPO_PUBLIC_PRINT_SERVER_URL
  }

  if (Platform.OS === 'ios') return DEFAULT_SERVER_BY_PLATFORM.ios
  if (Platform.OS === 'android') return DEFAULT_SERVER_BY_PLATFORM.android
  return DEFAULT_SERVER_BY_PLATFORM.default
}

export async function checkPrintServerHealth() {
  const response = await fetch(`${getPrintServerBaseUrl()}/status`)
  if (!response.ok) {
    throw new Error(`Print server status check failed: HTTP ${response.status}`)
  }

  return (await response.json()) as Record<string, unknown>
}

function mapTransactionToReceipt(tx: Transaction) {
  const lines = (tx.lines ?? []) as TransactionLine[]
  const customer = tx.customer as { name?: string; display_name?: string } | undefined

  return {
    transaction_number: tx.transaction_number,
    date: new Date(tx.created_at).toLocaleDateString('en-PH'),
    time: new Date(tx.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
    cashier: tx.created_by,
    branch: tx.branch_id,
    customer: { name: customer?.name ?? customer?.display_name ?? 'Walk-in' },
    delivery_type: tx.delivery_type,
    items: lines.map((line) => ({
      name: line.product?.name ?? line.product_id,
      quantity: Number(line.quantity),
      unit_price: Number(line.unit_price),
      uom: line.uom?.code ?? line.uom_id,
      discount: Number(line.discount_amount ?? 0),
      total: Number(line.quantity) * Number(line.unit_price) - Number(line.discount_amount ?? 0),
    })),
    subtotal: Number(tx.subtotal ?? tx.total_amount ?? 0),
    discount: Number(tx.discount_amount ?? 0),
    tax: Number(tx.tax_amount ?? 0),
    total: Number(tx.total_amount ?? 0),
    payments: (tx.payments ?? []).map((payment) => ({
      method: payment.payment_method,
      amount: Number(payment.amount),
      reference: payment.reference_number,
    })),
    amount_paid: Number(tx.amount_paid ?? 0),
    change: Math.max(0, Number(tx.amount_paid ?? 0) - Number(tx.total_amount ?? 0)),
    notes: tx.notes,
  }
}

export async function printTransactionReceipt(tx: Transaction, width: ReceiptWidth = '80mm') {
  const payload = {
    data: mapTransactionToReceipt(tx),
    width,
  }

  const response = await fetch(`${getPrintServerBaseUrl()}/print`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const result = (await response.json()) as PrintResponse

  if (!response.ok || result.error) {
    throw new Error(result.error || `Print failed: HTTP ${response.status}`)
  }

  return result
}
