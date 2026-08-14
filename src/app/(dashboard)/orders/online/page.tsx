'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ShoppingBag, RefreshCw, Search } from 'lucide-react'
import { useOnlineOrders, type OnlineOrderStatus } from '@/hooks/useOnlineOrders'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const STATUS_LABELS: Record<OnlineOrderStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  picked_up: 'Picked Up',
  cancelled: 'Cancelled',
}

const STATUS_COLORS: Record<OnlineOrderStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  confirmed: 'bg-blue-100 text-blue-800 border-blue-200',
  preparing: 'bg-purple-100 text-purple-800 border-purple-200',
  out_for_delivery: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  delivered: 'bg-green-100 text-green-800 border-green-200',
  picked_up: 'bg-green-100 text-green-800 border-green-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
}

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  unpaid: 'bg-gray-100 text-gray-600',
  submitted: 'bg-orange-100 text-orange-700',
  verified: 'bg-green-100 text-green-700',
  refunded: 'bg-red-100 text-red-600',
}

function formatPrice(amount: number) {
  return '₱' + Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function OnlineOrdersPage() {
  const [statusFilter, setStatusFilter] = useState<OnlineOrderStatus | 'all'>('all')
  const [search, setSearch] = useState('')

  const { data: orders = [], isLoading, refetch, isRefetching } = useOnlineOrders(
    statusFilter !== 'all' ? statusFilter : undefined
  )

  const filtered = orders.filter(o =>
    !search ||
    o.order_number.toLowerCase().includes(search.toLowerCase()) ||
    o.customer_name.toLowerCase().includes(search.toLowerCase()) ||
    o.customer_phone.includes(search)
  )

  const pendingCount = orders.filter(o => o.status === 'pending').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShoppingBag className="w-6 h-6" />
            Online Orders
            {pendingCount > 0 && (
              <Badge className="bg-red-500 text-white ml-1">{pendingCount} new</Badge>
            )}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Orders placed from the online shop</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isRefetching}
        >
          <RefreshCw className={`w-4 h-4 mr-1 ${isRefetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by order number, name, phone..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={v => setStatusFilter(v as any)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {(Object.keys(STATUS_LABELS) as OnlineOrderStatus[]).map(s => (
                  <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
              Loading orders...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
              <ShoppingBag className="w-10 h-10 opacity-30" />
              <p className="text-sm">No orders found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Fulfillment</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(order => (
                  <TableRow
                    key={order.id}
                    className={order.status === 'pending' ? 'bg-yellow-50 hover:bg-yellow-100' : ''}
                  >
                    <TableCell>
                      <Link
                        href={`/orders/online/${order.id}`}
                        className="font-mono font-bold text-blue-600 hover:underline text-sm"
                      >
                        {order.order_number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{order.customer_name}</p>
                        <p className="text-xs text-slate-400">{order.customer_phone}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm capitalize">{order.fulfillment}</span>
                      {order.distance_km && (
                        <span className="text-xs text-slate-400 ml-1">({order.distance_km} km)</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <p className="text-xs capitalize">{order.payment_method.replace('_', ' ')}</p>
                        <Badge
                          variant="outline"
                          className={`text-xs ${PAYMENT_STATUS_COLORS[order.payment_status]}`}
                        >
                          {order.payment_status}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-sm">
                      {formatPrice(order.total_amount)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-xs ${STATUS_COLORS[order.status]}`}
                      >
                        {STATUS_LABELS[order.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-400">
                      {formatDate(order.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
