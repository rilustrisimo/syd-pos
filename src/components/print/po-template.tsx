'use client'

import { forwardRef } from 'react'

interface POItem {
  code: string
  name: string
  quantity: number
  uom: string
  unit_cost: number
  total: number
}

interface POData {
  po_number: string
  po_date: string
  expected_delivery_date?: string | null
  branch: {
    name: string
    address?: string | null
    phone?: string | null
    email?: string | null
  }
  supplier: {
    name: string
    contact_person?: string | null
    phone?: string | null
    email?: string | null
    address?: string | null
    payment_terms?: string | null
  }
  items: POItem[]
  total_amount: number
  notes?: string | null
  prepared_by: string
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

export const POTemplate = forwardRef<HTMLDivElement, { data: POData }>(
  ({ data }, ref) => {
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
            {data.branch.address && (
              <p className="text-gray-600 text-sm">{data.branch.address}</p>
            )}
            <p className="text-gray-600 text-sm">
              {data.branch.phone && `Tel: ${data.branch.phone}`}
              {data.branch.email && ` | Email: ${data.branch.email}`}
            </p>
          </div>
          <div className="text-right">
            <h2 className="text-3xl font-bold text-gray-700">PURCHASE ORDER</h2>
            <p className="text-lg font-semibold mt-2">#{data.po_number}</p>
          </div>
        </div>

        {/* Supplier & PO Details */}
        <div className="flex justify-between mb-8">
          <div className="w-1/2">
            <h3 className="font-bold text-gray-700 mb-2 border-b pb-1">SUPPLIER:</h3>
            <p className="font-semibold">{data.supplier.name}</p>
            {data.supplier.contact_person && (
              <p className="text-sm text-gray-600">Attn: {data.supplier.contact_person}</p>
            )}
            {data.supplier.address && (
              <p className="text-sm text-gray-600">{data.supplier.address}</p>
            )}
            {data.supplier.phone && (
              <p className="text-sm text-gray-600">Tel: {data.supplier.phone}</p>
            )}
            {data.supplier.email && (
              <p className="text-sm text-gray-600">Email: {data.supplier.email}</p>
            )}
          </div>
          <div className="w-1/3">
            <table className="w-full text-sm">
              <tbody>
                <tr>
                  <td className="py-1 text-gray-600">PO Date:</td>
                  <td className="py-1 font-semibold text-right">
                    {formatDate(data.po_date)}
                  </td>
                </tr>
                {data.expected_delivery_date && (
                  <tr>
                    <td className="py-1 text-gray-600">Expected Delivery:</td>
                    <td className="py-1 font-semibold text-right">
                      {formatDate(data.expected_delivery_date)}
                    </td>
                  </tr>
                )}
                {data.supplier.payment_terms && (
                  <tr>
                    <td className="py-1 text-gray-600">Payment Terms:</td>
                    <td className="py-1 font-semibold text-right">
                      {data.supplier.payment_terms}
                    </td>
                  </tr>
                )}
                <tr>
                  <td className="py-1 text-gray-600">Deliver To:</td>
                  <td className="py-1 font-semibold text-right">
                    {data.branch.name}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Items Table */}
        <table className="w-full mb-6">
          <thead>
            <tr className="bg-gray-800 text-white">
              <th className="py-2 px-3 text-left w-12">#</th>
              <th className="py-2 px-3 text-left w-24">Code</th>
              <th className="py-2 px-3 text-left">Description</th>
              <th className="py-2 px-3 text-center w-20">Qty</th>
              <th className="py-2 px-3 text-center w-16">Unit</th>
              <th className="py-2 px-3 text-right w-28">Unit Cost</th>
              <th className="py-2 px-3 text-right w-28">Amount</th>
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
                <td className="py-2 px-3 border-b text-right">
                  {formatCurrency(item.unit_cost)}
                </td>
                <td className="py-2 px-3 border-b text-right font-semibold">
                  {formatCurrency(item.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Total */}
        <div className="flex justify-end mb-8">
          <div className="w-72">
            <table className="w-full">
              <tbody>
                <tr className="border-t-2 border-gray-800">
                  <td className="py-2 font-bold text-lg">TOTAL:</td>
                  <td className="py-2 text-right font-bold text-lg">
                    {formatCurrency(data.total_amount)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Notes */}
        {data.notes && (
          <div className="mb-8 p-3 bg-gray-50 border border-gray-200 rounded">
            <h3 className="font-bold text-gray-700 mb-1">Notes:</h3>
            <p className="text-sm whitespace-pre-wrap">{data.notes}</p>
          </div>
        )}

        {/* Signature Section */}
        <div className="flex justify-between mt-16 mb-8">
          <div className="w-1/3 text-center">
            <div className="border-t border-gray-400 pt-2 mx-6">
              <p className="text-sm text-gray-600">Prepared by</p>
              <p className="font-semibold">{data.prepared_by}</p>
            </div>
          </div>
          <div className="w-1/3 text-center">
            <div className="border-t border-gray-400 pt-2 mx-6">
              <p className="text-sm text-gray-600">Approved by</p>
              <p className="text-gray-400 text-sm">(Signature over printed name)</p>
            </div>
          </div>
          <div className="w-1/3 text-center">
            <div className="border-t border-gray-400 pt-2 mx-6">
              <p className="text-sm text-gray-600">Supplier Confirmation</p>
              <p className="text-gray-400 text-sm">(Signature / Stamp)</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-auto pt-8 border-t text-center text-xs text-gray-500">
          <p>
            Please confirm this order and deliver to the address above by the expected
            delivery date.
          </p>
          <p className="mt-1">
            For inquiries, please contact us at {data.branch.phone || 'our office'}
          </p>
          <p className="mt-2">
            This is a computer-generated purchase order.
          </p>
        </div>
      </div>
    )
  }
)

POTemplate.displayName = 'POTemplate'

export type { POData, POItem }
