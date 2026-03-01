import { useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, Text, View, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { TransactionLine, useTransaction, useAuth } from '@syd/api'
import { btPrinter } from '../../../lib/bt-printer'
import { usePrinterStore } from '../../../store/printer'
import type { ReceiptData } from '../../../lib/escpos-mobile'

const PAYMENT_LABELS: Record<string, string> = {
  cash:          'Cash',
  gcash:         'GCash',
  maya:          'Maya',
  bank_transfer: 'Bank Transfer',
  credit:        'Credit/AR',
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

const STATUS_COLOR: Record<string, string> = {
  paid:    '#10b981',
  partial: '#f59e0b',
  unpaid:  '#ef4444',
}

const STATUS_BG: Record<string, string> = {
  paid:    '#d1fae5',
  partial: '#fef3c7',
  unpaid:  '#fee2e2',
}

export default function TransactionDetailScreen() {
  const params            = useLocalSearchParams<{ id?: string }>()
  const transactionId     = typeof params.id === 'string' ? params.id : undefined
  const { data: authUser } = useAuth()
  const printerStatus     = usePrinterStore((s) => s.status)

  const transactionQuery  = useTransaction(transactionId)
  const tx                = transactionQuery.data
  const [isPrinting, setIsPrinting] = useState(false)

  const lines    = (tx?.lines    ?? []) as TransactionLine[]
  const payments = (tx?.payments ?? []) as { payment_method: string; amount: number; reference_number?: string | null }[]

  const lineSubtotal = useMemo(
    () => lines.reduce(
      (sum, line) =>
        sum + Number(line.quantity) * Number(line.unit_price) - Number(line.discount_amount ?? 0),
      0
    ),
    [lines]
  )

  const amountPaid = useMemo(() => payments.reduce((s, p) => s + Number(p.amount), 0), [payments])
  const change     = Math.max(0, amountPaid - Number(tx?.total_amount ?? 0))

  const handleReprint = async () => {
    if (!tx || isPrinting) return

    if (printerStatus !== 'connected') {
      Alert.alert('Printer Not Connected', 'Please connect the BLE printer in Settings first.')
      return
    }

    const customer = tx.customer as { name?: string; display_name?: string; phone?: string } | undefined
    const txDate   = new Date(tx.created_at)

    const receiptData: ReceiptData = {
      transaction_number: tx.transaction_number,
      date: txDate.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }),
      time: txDate.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
      cashier: authUser?.email ?? 'Cashier',
      branch:  'Main Branch',
      customer: {
        name:  customer?.name ?? customer?.display_name ?? 'Walk-in Customer',
        phone: customer?.phone ?? null,
      },
      delivery_type:    tx.delivery_type ?? 'pickup',
      delivery_address: (tx as any).delivery_address ?? null,
      items: lines.map((line) => ({
        name:       line.product?.name ?? line.product_id,
        quantity:   Number(line.quantity),
        unit_price: Number(line.unit_price),
        uom:        (line as any).uom?.name ?? 'pc',
        discount:   Number(line.discount_amount ?? 0),
        total:      Number(line.quantity) * Number(line.unit_price) - Number(line.discount_amount ?? 0),
      })),
      subtotal:    lineSubtotal,
      discount:    0,
      tax:         0,
      total:       Number(tx.total_amount ?? 0),
      payments:    payments.map((p) => ({
        method:    p.payment_method,
        amount:    Number(p.amount),
        reference: p.reference_number ?? null,
      })),
      amount_paid: amountPaid,
      change,
      notes: tx.notes ?? null,
    }

    try {
      setIsPrinting(true)
      await btPrinter.printReceipt(receiptData, '80mm')
      Alert.alert('Printed', 'Receipt sent to printer.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Print failed'
      Alert.alert('Print Error', msg)
    } finally {
      setIsPrinting(false)
    }
  }

  // ── Loading / error states ────────────────────────────────────────────────────

  if (transactionQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <Text style={styles.stateText}>Loading…</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (!tx) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <Ionicons name="receipt-outline" size={40} color="#d1d5db" />
          <Text style={styles.stateText}>Transaction not found</Text>
        </View>
      </SafeAreaView>
    )
  }

  const customer = tx.customer as { name?: string; display_name?: string } | undefined
  const status   = (tx.payment_status || 'unknown').toLowerCase()
  const color    = STATUS_COLOR[status] ?? '#6b7280'
  const bg       = STATUS_BG[status]   ?? '#f3f4f6'

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Hero card */}
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <Text style={styles.txNumber}>{tx.transaction_number}</Text>
            <View style={[styles.statusBadge, { backgroundColor: bg }]}>
              <Text style={[styles.statusText, { color }]}>{status.toUpperCase()}</Text>
            </View>
          </View>
          <Text style={styles.txDate}>
            {new Date(tx.created_at).toLocaleDateString('en-PH', {
              weekday: 'short', month: 'long', day: 'numeric', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </Text>
          <Text style={styles.txTotal}>₱{fmt(Number(tx.total_amount ?? 0))}</Text>
        </View>

        {/* Customer */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Customer</Text>
          <View style={styles.rowGroup}>
            <Row label="Name" value={customer?.name ?? customer?.display_name ?? 'Walk-in Customer'} />
            <Row label="Type" value={(tx.delivery_type ?? 'Pickup')} capitalize />
            {tx.notes ? <Row label="Notes" value={tx.notes} /> : null}
          </View>
        </View>

        {/* Items */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Items</Text>
          {lines.length === 0 ? (
            <Text style={styles.emptyText}>No items</Text>
          ) : (
            lines.map((line, i) => {
              const lineTotal = Number(line.quantity) * Number(line.unit_price) - Number(line.discount_amount ?? 0)
              return (
                <View key={line.id}>
                  <View style={styles.lineItem}>
                    <View style={styles.lineItemLeft}>
                      <Text style={styles.lineItemName} numberOfLines={2}>
                        {line.product?.name ?? line.product_id}
                      </Text>
                      <Text style={styles.lineItemMeta}>
                        {line.quantity} × ₱{fmt(Number(line.unit_price))}
                        {Number(line.discount_amount ?? 0) > 0
                          ? `  −₱${fmt(Number(line.discount_amount))}`
                          : ''}
                      </Text>
                    </View>
                    <Text style={styles.lineItemTotal}>₱{fmt(lineTotal)}</Text>
                  </View>
                  {i < lines.length - 1 && <View style={styles.divider} />}
                </View>
              )
            })
          )}
        </View>

        {/* Totals */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Summary</Text>
          <View style={styles.rowGroup}>
            <Row label="Subtotal" value={`₱${fmt(lineSubtotal)}`} />
            <View style={styles.divider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>₱{fmt(Number(tx.total_amount ?? 0))}</Text>
            </View>
          </View>
        </View>

        {/* Payments */}
        {payments.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Payments</Text>
            {payments.map((p, i) => (
              <View key={i}>
                <View style={styles.payRow}>
                  <View style={styles.payLeft}>
                    <Text style={styles.payMethod}>{PAYMENT_LABELS[p.payment_method] ?? p.payment_method}</Text>
                    {p.reference_number ? (
                      <Text style={styles.payRef}>Ref: {p.reference_number}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.payAmount}>₱{fmt(Number(p.amount))}</Text>
                </View>
                {i < payments.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
            {change > 0 && (
              <>
                <View style={styles.divider} />
                <View style={styles.payRow}>
                  <Text style={styles.payMethod}>Change</Text>
                  <Text style={[styles.payAmount, { color: '#10b981' }]}>₱{fmt(change)}</Text>
                </View>
              </>
            )}
          </View>
        )}

        {/* Reprint */}
        <Pressable
          onPress={handleReprint}
          disabled={isPrinting}
          style={[styles.printBtn, isPrinting && styles.printBtnDisabled]}
        >
          <Ionicons
            name={isPrinting ? 'time-outline' : 'print-outline'}
            size={18}
            color="#fff"
          />
          <Text style={styles.printBtnText}>
            {isPrinting ? 'Printing…' : 'Reprint Receipt'}
          </Text>
        </Pressable>

        {printerStatus !== 'connected' && (
          <Text style={styles.printerHint}>Connect a printer in Settings to enable reprinting.</Text>
        )}

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  )
}

// ── Shared row component ──────────────────────────────────────────────────────

function Row({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, capitalize && styles.capitalize]}>{value}</Text>
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  stateText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  heroCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    gap: 6,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  txDate: {
    fontSize: 13,
    color: '#6b7280',
  },
  txTotal: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    gap: 12,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rowGroup: {
    gap: 10,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  infoLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'right',
    flex: 1,
    marginLeft: 16,
  },
  capitalize: {
    textTransform: 'capitalize',
  },
  divider: {
    height: 1,
    backgroundColor: '#f3f4f6',
  },
  lineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    gap: 12,
  },
  lineItemLeft: {
    flex: 1,
    gap: 3,
  },
  lineItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  lineItemMeta: {
    fontSize: 12,
    color: '#6b7280',
  },
  lineItemTotal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  payRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  payLeft: {
    gap: 2,
  },
  payMethod: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  payRef: {
    fontSize: 12,
    color: '#9ca3af',
  },
  payAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    paddingVertical: 12,
  },
  printBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3b82f6',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 4,
  },
  printBtnDisabled: {
    opacity: 0.55,
  },
  printBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  printerHint: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 4,
  },
  bottomPad: {
    height: 16,
  },
})
