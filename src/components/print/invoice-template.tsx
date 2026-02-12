'use client'

import { forwardRef } from 'react'

interface InvoiceItem {
  code: string
  name: string
  quantity: number
  uom: string
  unit_price: number
  discount: number
  total: number
}

interface InvoicePayment {
  method: string
  amount: number
  reference?: string | null
  date: string
}

interface InvoiceData {
  invoice_number: string
  transaction_number: string
  date: string
  due_date?: string | null
  branch: {
    name: string
    address: string
    phone: string
    email?: string | null
  }
  customer: {
    name: string
    address?: string | null
    phone?: string | null
    email?: string | null
  }
  delivery_type: 'pickup' | 'delivery'
  delivery_address?: string | null
  delivery_phone?: string | null
  items: InvoiceItem[]
  subtotal: number
  discount: number
  tax: number
  total: number
  amount_paid: number
  balance_due: number
  payments: InvoicePayment[]
  notes?: string | null
  prepared_by: string
}

interface InvoiceTemplateProps {
  data: InvoiceData
  showPrices?: boolean // For packing slips, hide prices
}

const paymentMethodLabels: Record<string, string> = {
  cash: 'Cash',
  gcash: 'GCash',
  maya: 'Maya',
  bank_transfer: 'Bank Transfer',
  credit: 'Credit/AR',
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export const InvoiceTemplate = forwardRef<HTMLDivElement, InvoiceTemplateProps>(
  ({ data, showPrices = true }, ref) => {
    return (
      <div
        ref={ref}
        className="invoice-print bg-white text-black p-8"
        style={{
          width: '210mm',
          minHeight: '297mm',
          fontFamily: 'Arial, sans-serif',
          fontSize: '12px',
          lineHeight: 1.5,
        }}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              SYD CONSTRUCTION SUPPLIES TRADING
            </h1>
            <p className="text-gray-600 mt-1">{data.branch.name}</p>
            <p className="text-gray-600 text-sm">{data.branch.address}</p>
            <p className="text-gray-600 text-sm">
              Tel: {data.branch.phone}
              {data.branch.email && ` | Email: ${data.branch.email}`}
            </p>
          </div>
          <div className="text-right">
            <h2 className="text-3xl font-bold text-gray-700">
              {showPrices ? 'INVOICE' : 'DELIVERY RECEIPT'}
            </h2>
            <p className="text-lg font-semibold mt-2">#{data.invoice_number}</p>
            <p className="text-sm text-gray-600">TXN: {data.transaction_number}</p>
          </div>
        </div>

        {/* Customer & Invoice Details */}
        <div className="flex justify-between mb-8">
          <div className="w-1/2">
            <h3 className="font-bold text-gray-700 mb-2 border-b pb-1">BILL TO:</h3>
            <p className="font-semibold">{data.customer.name}</p>
            {data.customer.address && (
              <p className="text-sm text-gray-600">{data.customer.address}</p>
            )}
            {data.customer.phone && (
              <p className="text-sm text-gray-600">Tel: {data.customer.phone}</p>
            )}
            {data.customer.email && (
              <p className="text-sm text-gray-600">Email: {data.customer.email}</p>
            )}
          </div>
          <div className="w-1/3">
            <table className="w-full text-sm">
              <tbody>
                <tr>
                  <td className="py-1 text-gray-600">Invoice Date:</td>
                  <td className="py-1 font-semibold text-right">
                    {formatDate(data.date)}
                  </td>
                </tr>
                {data.due_date && (
                  <tr>
                    <td className="py-1 text-gray-600">Due Date:</td>
                    <td className="py-1 font-semibold text-right">
                      {formatDate(data.due_date)}
                    </td>
                  </tr>
                )}
                <tr>
                  <td className="py-1 text-gray-600">Type:</td>
                  <td className="py-1 font-semibold text-right uppercase">
                    {data.delivery_type}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Delivery Address */}
        {data.delivery_type === 'delivery' && data.delivery_address && (
          <div className="mb-6 p-3 bg-gray-50 rounded">
            <h3 className="font-bold text-gray-700 mb-1">DELIVER TO:</h3>
            <p>{data.delivery_address}</p>
            {data.delivery_phone && <p>Contact: {data.delivery_phone}</p>}
          </div>
        )}

        {/* Items Table */}
        <table className="w-full mb-6">
          <thead>
            <tr className="bg-gray-800 text-white">
              <th className="py-2 px-3 text-left w-16">#</th>
              <th className="py-2 px-3 text-left w-24">Code</th>
              <th className="py-2 px-3 text-left">Description</th>
              <th className="py-2 px-3 text-center w-20">Qty</th>
              <th className="py-2 px-3 text-center w-16">Unit</th>
              {showPrices && (
                <>
                  <th className="py-2 px-3 text-right w-28">Unit Price</th>
                  <th className="py-2 px-3 text-right w-28">Amount</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, index) => (
              <tr
                key={index}
                className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}
              >
                <td className="py-2 px-3 border-b">{index + 1}</td>
                <td className="py-2 px-3 border-b font-mono text-xs">
                  {item.code}
                </td>
                <td className="py-2 px-3 border-b">{item.name}</td>
                <td className="py-2 px-3 border-b text-center">{item.quantity}</td>
                <td className="py-2 px-3 border-b text-center">{item.uom}</td>
                {showPrices && (
                  <>
                    <td className="py-2 px-3 border-b text-right">
                      {formatCurrency(item.unit_price)}
                    </td>
                    <td className="py-2 px-3 border-b text-right font-semibold">
                      {formatCurrency(item.total)}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        {showPrices && (
          <div className="flex justify-end mb-8">
            <div className="w-72">
              <table className="w-full">
                <tbody>
                  <tr>
                    <td className="py-1 text-gray-600">Subtotal:</td>
                    <td className="py-1 text-right">{formatCurrency(data.subtotal)}</td>
                  </tr>
                  {data.discount > 0 && (
                    <tr>
                      <td className="py-1 text-gray-600">Discount:</td>
                      <td className="py-1 text-right text-green-600">
                        -{formatCurrency(data.discount)}
                      </td>
                    </tr>
                  )}
                  {data.tax > 0 && (
                    <tr>
                      <td className="py-1 text-gray-600">Tax:</td>
                      <td className="py-1 text-right">{formatCurrency(data.tax)}</td>
                    </tr>
                  )}
                  <tr className="border-t-2 border-gray-800">
                    <td className="py-2 font-bold text-lg">TOTAL:</td>
                    <td className="py-2 text-right font-bold text-lg">
                      {formatCurrency(data.total)}
                    </td>
                  </tr>
                  {data.amount_paid > 0 && (
                    <tr>
                      <td className="py-1 text-gray-600">Amount Paid:</td>
                      <td className="py-1 text-right text-green-600">
                        {formatCurrency(data.amount_paid)}
                      </td>
                    </tr>
                  )}
                  {data.balance_due > 0 && (
                    <tr className="border-t">
                      <td className="py-2 font-bold text-red-600">Balance Due:</td>
                      <td className="py-2 text-right font-bold text-red-600">
                        {formatCurrency(data.balance_due)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Payments */}
        {showPrices && data.payments.length > 0 && (
          <div className="mb-8">
            <h3 className="font-bold text-gray-700 mb-2 border-b pb-1">
              PAYMENT HISTORY:
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="py-2 px-3 text-left">Date</th>
                  <th className="py-2 px-3 text-left">Method</th>
                  <th className="py-2 px-3 text-left">Reference</th>
                  <th className="py-2 px-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((payment, index) => (
                  <tr key={index} className="border-b">
                    <td className="py-2 px-3">{formatDate(payment.date)}</td>
                    <td className="py-2 px-3">
                      {paymentMethodLabels[payment.method] || payment.method}
                    </td>
                    <td className="py-2 px-3">{payment.reference || '-'}</td>
                    <td className="py-2 px-3 text-right font-semibold">
                      {formatCurrency(payment.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Notes */}
        {data.notes && (
          <div className="mb-8 p-3 bg-yellow-50 border border-yellow-200 rounded">
            <h3 className="font-bold text-gray-700 mb-1">Notes:</h3>
            <p className="text-sm">{data.notes}</p>
          </div>
        )}

        {/* Signature Section */}
        {data.delivery_type === 'delivery' && (
          <div className="flex justify-between mt-12 mb-8">
            <div className="w-1/3 text-center">
              <div className="border-t border-gray-400 pt-2 mx-8">
                <p className="text-sm text-gray-600">Prepared by</p>
                <p className="font-semibold">{data.prepared_by}</p>
              </div>
            </div>
            <div className="w-1/3 text-center">
              <div className="border-t border-gray-400 pt-2 mx-8">
                <p className="text-sm text-gray-600">Delivered by</p>
                <p className="text-gray-400 text-sm">(Signature over printed name)</p>
              </div>
            </div>
            <div className="w-1/3 text-center">
              <div className="border-t border-gray-400 pt-2 mx-8">
                <p className="text-sm text-gray-600">Received by</p>
                <p className="text-gray-400 text-sm">(Signature over printed name)</p>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-auto pt-8 border-t text-center text-xs text-gray-500">
          <p>Thank you for your business!</p>
          <p className="mt-1">
            For inquiries, please contact us at {data.branch.phone}
          </p>
          <p className="mt-2">
            This is a computer-generated document. No signature required unless for
            delivery.
          </p>
        </div>
      </div>
    )
  }
)

InvoiceTemplate.displayName = 'InvoiceTemplate'

export type { InvoiceData, InvoiceItem, InvoicePayment }
