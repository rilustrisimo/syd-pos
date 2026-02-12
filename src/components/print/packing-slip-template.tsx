'use client'

import { forwardRef } from 'react'

interface PackingItem {
  code: string
  name: string
  quantity: number
  uom: string
  location?: string | null
}

interface PackingSlipData {
  slip_number: string
  transaction_number: string
  date: string
  branch: {
    name: string
    address: string
    phone: string
  }
  customer: {
    name: string
    phone?: string | null
  }
  delivery_type: 'pickup' | 'delivery'
  delivery_address?: string | null
  delivery_phone?: string | null
  items: PackingItem[]
  notes?: string | null
  packed_by?: string | null
}

interface PackingSlipTemplateProps {
  data: PackingSlipData
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const PackingSlipTemplate = forwardRef<HTMLDivElement, PackingSlipTemplateProps>(
  ({ data }, ref) => {
    return (
      <div
        ref={ref}
        className="packing-slip-print bg-white text-black p-6"
        style={{
          width: '210mm',
          minHeight: '148mm', // A5 landscape or half A4
          fontFamily: 'Arial, sans-serif',
          fontSize: '14px',
          lineHeight: 1.4,
        }}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-4 pb-3 border-b-2 border-black">
          <div>
            <h1 className="text-2xl font-bold">PACKING SLIP</h1>
            <p className="text-sm text-gray-600 mt-1">{data.branch.name}</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold">#{data.slip_number}</p>
            <p className="text-sm">TXN: {data.transaction_number}</p>
            <p className="text-sm">{formatDate(data.date)}</p>
          </div>
        </div>

        {/* Customer & Delivery Info */}
        <div className="flex gap-8 mb-4">
          <div className="flex-1">
            <h3 className="font-bold text-sm uppercase text-gray-600 mb-1">Customer</h3>
            <p className="text-lg font-semibold">{data.customer.name}</p>
            {data.customer.phone && (
              <p className="text-sm">Tel: {data.customer.phone}</p>
            )}
          </div>

          {data.delivery_type === 'delivery' && (
            <div className="flex-1 bg-gray-100 p-3 rounded">
              <h3 className="font-bold text-sm uppercase text-gray-600 mb-1">
                Deliver To
              </h3>
              <p className="font-semibold">{data.delivery_address}</p>
              {data.delivery_phone && (
                <p className="text-sm">Contact: {data.delivery_phone}</p>
              )}
            </div>
          )}

          {data.delivery_type === 'pickup' && (
            <div className="flex-1 bg-yellow-100 p-3 rounded text-center">
              <p className="text-2xl font-bold">PICKUP</p>
              <p className="text-sm">Customer will collect</p>
            </div>
          )}
        </div>

        {/* Items Table */}
        <table className="w-full mb-4">
          <thead>
            <tr className="bg-gray-800 text-white">
              <th className="py-2 px-2 text-center w-12">Check</th>
              <th className="py-2 px-2 text-center w-20">Qty</th>
              <th className="py-2 px-2 text-center w-16">Unit</th>
              <th className="py-2 px-2 text-left w-24">Code</th>
              <th className="py-2 px-2 text-left">Item Description</th>
              {data.items.some(i => i.location) && (
                <th className="py-2 px-2 text-center w-20">Location</th>
              )}
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, index) => (
              <tr
                key={index}
                className={`border-b ${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}
              >
                <td className="py-3 px-2 text-center">
                  <div
                    className="w-6 h-6 border-2 border-gray-400 mx-auto"
                    style={{ borderRadius: '2px' }}
                  />
                </td>
                <td className="py-3 px-2 text-center">
                  <span className="text-xl font-bold">{item.quantity}</span>
                </td>
                <td className="py-3 px-2 text-center text-sm">{item.uom}</td>
                <td className="py-3 px-2 font-mono text-sm">{item.code}</td>
                <td className="py-3 px-2 font-medium">{item.name}</td>
                {data.items.some(i => i.location) && (
                  <td className="py-3 px-2 text-center text-sm font-mono">
                    {item.location || '-'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-200 font-bold">
              <td className="py-2 px-2 text-center">-</td>
              <td className="py-2 px-2 text-center text-lg">
                {data.items.reduce((sum, item) => sum + item.quantity, 0)}
              </td>
              <td colSpan={data.items.some(i => i.location) ? 4 : 3} className="py-2 px-2">
                Total Items: {data.items.length} | Total Qty: {data.items.reduce((sum, item) => sum + item.quantity, 0)}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Notes */}
        {data.notes && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-300 rounded">
            <h3 className="font-bold text-sm mb-1">Special Instructions:</h3>
            <p>{data.notes}</p>
          </div>
        )}

        {/* Signature Section */}
        <div className="flex justify-between mt-6 pt-4 border-t">
          <div className="w-1/3 text-center">
            <div className="border-b border-gray-400 pb-8 mx-4" />
            <p className="text-sm mt-2">Packed by</p>
            {data.packed_by && <p className="font-semibold">{data.packed_by}</p>}
            <p className="text-xs text-gray-500">Date: _______________</p>
          </div>
          <div className="w-1/3 text-center">
            <div className="border-b border-gray-400 pb-8 mx-4" />
            <p className="text-sm mt-2">Checked by</p>
            <p className="text-xs text-gray-500">Date: _______________</p>
          </div>
          <div className="w-1/3 text-center">
            <div className="border-b border-gray-400 pb-8 mx-4" />
            <p className="text-sm mt-2">
              {data.delivery_type === 'delivery' ? 'Received by' : 'Released to'}
            </p>
            <p className="text-xs text-gray-500">Date: _______________</p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 text-center text-xs text-gray-500">
          <p>Please verify all items before signing. Report any discrepancies immediately.</p>
          <p className="mt-1">{data.branch.name} | {data.branch.phone}</p>
        </div>
      </div>
    )
  }
)

PackingSlipTemplate.displayName = 'PackingSlipTemplate'

export type { PackingSlipData, PackingItem }
