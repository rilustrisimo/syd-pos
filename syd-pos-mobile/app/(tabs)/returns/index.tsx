import { useMemo, useState } from 'react'
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import {
  PaymentMethod,
  ReturnReasonCode,
  Transaction,
  TransactionLine,
  useAuth,
  useCreateReturn,
  useReturns,
  useTransactions,
} from '@syd/api'
import { useNetworkStatus } from '../../../hooks/useNetworkStatus'
import { usePrinterStore } from '../../../store/printer'
import { SettingsModal } from '../../../components/SettingsModal'

type QtyMap = Record<string, number>

const REFUND_METHODS: PaymentMethod[] = ['cash', 'gcash', 'maya', 'bank_transfer', 'credit']
const RETURN_REASONS: ReturnReasonCode[] = [
  'defective',
  'wrong_item',
  'customer_changed_mind',
  'damaged',
  'other',
]

const REASON_LABELS: Record<ReturnReasonCode, string> = {
  defective:              'Defective',
  wrong_item:             'Wrong Item',
  customer_changed_mind:  'Changed Mind',
  damaged:                'Damaged',
  other:                  'Other',
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash:          'Cash',
  gcash:         'GCash',
  maya:          'Maya',
  bank_transfer: 'Bank Transfer',
  credit:        'Credit',
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

export default function ReturnsScreen() {
  const [search, setSearch]                       = useState('')
  const [selectedTransactionId, setSelectedTxId] = useState<string | null>(null)
  const [selectedReason, setSelectedReason]       = useState<ReturnReasonCode>('defective')
  const [refundMethod, setRefundMethod]           = useState<PaymentMethod>('cash')
  const [notes, setNotes]                         = useState('')
  const [lineQty, setLineQty]                     = useState<QtyMap>({})
  const [showSettings, setShowSettings]           = useState(false)

  const { isOnline }       = useNetworkStatus()
  const printerStatus      = usePrinterStore((s) => s.status)
  const { data: authUser } = useAuth()
  const transactionsQuery  = useTransactions(1, 50)
  const returnsQuery       = useReturns(1, 20)
  const createReturn       = useCreateReturn()

  const transactions = transactionsQuery.data?.data ?? []

  const filteredTransactions = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return transactions
    return transactions.filter((tx) => {
      const customer = tx.customer as { name?: string; display_name?: string } | undefined
      const name     = (customer?.name ?? customer?.display_name ?? '').toLowerCase()
      return tx.transaction_number.toLowerCase().includes(q) || name.includes(q)
    })
  }, [transactions, search])

  const selectedTransaction = useMemo(
    () => transactions.find((tx) => tx.id === selectedTransactionId) ?? null,
    [transactions, selectedTransactionId]
  )

  const transactionLines = (selectedTransaction?.lines ?? []) as TransactionLine[]

  const selectedLines = useMemo(
    () =>
      transactionLines
        .map((line) => ({ line, qty: Math.min(lineQty[line.id] ?? 0, line.quantity) }))
        .filter((item) => item.qty > 0),
    [transactionLines, lineQty]
  )

  const refundAmount = useMemo(
    () =>
      selectedLines.reduce(
        (sum, item) =>
          sum + item.qty * (Number(item.line.unit_price) - Number(item.line.discount_amount ?? 0)),
        0
      ),
    [selectedLines]
  )

  const setQty = (lineId: string, maxQty: number, delta: number) => {
    setLineQty((prev) => {
      const next = Math.max(0, Math.min(maxQty, (prev[lineId] ?? 0) + delta))
      return { ...prev, [lineId]: next }
    })
  }

  const submitReturn = async () => {
    if (!selectedTransaction) {
      Alert.alert('No Transaction', 'Please select a transaction to return.')
      return
    }
    if (!authUser?.id || !authUser.branch_id) {
      Alert.alert('Auth Error', 'Please log in with a valid branch user.')
      return
    }
    if (!selectedLines.length) {
      Alert.alert('No Items', 'Select at least one item to return.')
      return
    }

    try {
      await createReturn.mutateAsync({
        input: {
          original_transaction_id: selectedTransaction.id,
          branch_id:   selectedTransaction.branch_id,
          customer_id: selectedTransaction.customer_id,
          reason:      selectedReason,
          notes:       notes || null,
        },
        lines: selectedLines.map(({ line, qty }) => ({
          original_line_id: line.id,
          product_id:       line.product_id,
          variant_id:       line.variant_id,
          quantity:         qty,
          uom_id:           line.uom_id,
          unit_price:       Number(line.unit_price),
          cogs_per_unit:    Number(line.cogs_per_unit),
          restock:          true,
          reason_code:      selectedReason,
        })),
        refund: {
          refund_method:    refundMethod,
          amount:           refundAmount,
          reference_number: null,
          notes:            notes || null,
        },
        userId: authUser.id,
      })

      setLineQty({})
      setNotes('')
      setSelectedTxId(null)
      Alert.alert('Success', 'Return processed successfully.')
      transactionsQuery.refetch().catch(() => null)
      returnsQuery.refetch().catch(() => null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process return'
      Alert.alert('Return Failed', message)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Returns</Text>
        <View style={styles.headerRight}>
          <View style={[styles.netDot, isOnline ? styles.online : styles.offline]} />
          <Pressable onPress={() => setShowSettings(true)} hitSlop={8} style={styles.profileBtn}>
            <Ionicons name="person-circle-outline" size={28} color="#374151" />
            {printerStatus === 'connected' && <View style={styles.printerDot} />}
          </Pressable>
        </View>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Step 1 – Select transaction */}
        <View style={styles.section}>
          <Text style={styles.stepLabel}>1  Select Transaction</Text>

          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={16} color="#9ca3af" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by # or customer…"
              placeholderTextColor="#9ca3af"
              style={styles.searchInput}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color="#9ca3af" />
              </Pressable>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.txScroll}
            contentContainerStyle={styles.txScrollContent}
          >
            {filteredTransactions.slice(0, 20).map((tx: Transaction) => {
              const customer  = tx.customer as { name?: string; display_name?: string } | undefined
              const isSelected = tx.id === selectedTransactionId
              return (
                <Pressable
                  key={tx.id}
                  onPress={() => { setSelectedTxId(tx.id); setLineQty({}) }}
                  style={[styles.txCard, isSelected && styles.txCardSelected]}
                >
                  {isSelected && (
                    <View style={styles.txCheckBadge}>
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    </View>
                  )}
                  <Text style={styles.txCardNumber} numberOfLines={1}>{tx.transaction_number}</Text>
                  <Text style={styles.txCardCustomer} numberOfLines={1}>
                    {customer?.name ?? customer?.display_name ?? 'Walk-in'}
                  </Text>
                  <Text style={[styles.txCardAmount, isSelected && styles.txCardAmountSelected]}>
                    ₱{fmt(Number(tx.total_amount ?? 0))}
                  </Text>
                </Pressable>
              )
            })}
            {filteredTransactions.length === 0 && (
              <View style={styles.txEmptyCard}>
                <Text style={styles.txEmptyText}>No transactions found</Text>
              </View>
            )}
          </ScrollView>
        </View>

        {/* Steps 2–5 – only when a transaction is selected */}
        {selectedTransaction && (
          <>
            {/* Step 2 – Items */}
            <View style={styles.section}>
              <Text style={styles.stepLabel}>2  Items to Return</Text>
              {transactionLines.length === 0 ? (
                <Text style={styles.emptyText}>No items in this transaction</Text>
              ) : (
                transactionLines.map((line) => {
                  const currentQty = lineQty[line.id] ?? 0
                  const maxQty     = Number(line.quantity)
                  return (
                    <View key={line.id} style={styles.lineCard}>
                      <View style={styles.lineCardTop}>
                        <Text style={styles.lineName} numberOfLines={2}>
                          {line.product?.name ?? line.product_id}
                        </Text>
                        <Text style={styles.linePrice}>₱{fmt(Number(line.unit_price))}</Text>
                      </View>
                      <Text style={styles.lineMaxQty}>Max returnable: {maxQty}</Text>
                      <View style={styles.qtyRow}>
                        <Pressable
                          onPress={() => setQty(line.id, maxQty, -1)}
                          style={[styles.qtyBtn, currentQty === 0 && styles.qtyBtnDisabled]}
                          disabled={currentQty === 0}
                        >
                          <Ionicons name="remove" size={20} color={currentQty === 0 ? '#d1d5db' : '#374151'} />
                        </Pressable>
                        <Text style={styles.qtyValue}>{currentQty}</Text>
                        <Pressable
                          onPress={() => setQty(line.id, maxQty, 1)}
                          style={[styles.qtyBtn, currentQty >= maxQty && styles.qtyBtnDisabled]}
                          disabled={currentQty >= maxQty}
                        >
                          <Ionicons name="add" size={20} color={currentQty >= maxQty ? '#d1d5db' : '#374151'} />
                        </Pressable>
                      </View>
                    </View>
                  )
                })
              )}
            </View>

            {/* Step 3 – Reason */}
            <View style={styles.section}>
              <Text style={styles.stepLabel}>3  Return Reason</Text>
              <View style={styles.pillGroup}>
                {RETURN_REASONS.map((reason) => (
                  <Pressable
                    key={reason}
                    onPress={() => setSelectedReason(reason)}
                    style={[styles.pill, selectedReason === reason && styles.pillActive]}
                  >
                    <Text style={[styles.pillText, selectedReason === reason && styles.pillTextActive]}>
                      {REASON_LABELS[reason]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Step 4 – Refund method */}
            <View style={styles.section}>
              <Text style={styles.stepLabel}>4  Refund Method</Text>
              <View style={styles.pillGroup}>
                {REFUND_METHODS.map((method) => (
                  <Pressable
                    key={method}
                    onPress={() => setRefundMethod(method)}
                    style={[styles.pill, refundMethod === method && styles.pillActive]}
                  >
                    <Text style={[styles.pillText, refundMethod === method && styles.pillTextActive]}>
                      {PAYMENT_LABELS[method]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Step 5 – Notes */}
            <View style={styles.section}>
              <Text style={styles.stepLabel}>5  Notes  <Text style={styles.optional}>(optional)</Text></Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Add any relevant notes…"
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={3}
                style={styles.notesInput}
              />
            </View>

            {/* Submit */}
            <View style={styles.section}>
              <View style={styles.refundCard}>
                <Text style={styles.refundLabel}>Total Refund</Text>
                <Text style={styles.refundAmount}>₱{fmt(refundAmount)}</Text>
              </View>
              <Pressable
                onPress={submitReturn}
                disabled={createReturn.isPending || selectedLines.length === 0}
                style={[
                  styles.submitBtn,
                  (createReturn.isPending || selectedLines.length === 0) && styles.submitBtnDisabled,
                ]}
              >
                <Ionicons name="return-up-back-outline" size={18} color="#fff" />
                <Text style={styles.submitBtnText}>
                  {createReturn.isPending ? 'Processing…' : 'Process Return'}
                </Text>
              </Pressable>
            </View>
          </>
        )}

        {/* Recent returns */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Returns</Text>
          {returnsQuery.isLoading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Loading…</Text>
            </View>
          ) : (returnsQuery.data?.data?.length ?? 0) === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="return-up-back-outline" size={36} color="#d1d5db" />
              <Text style={styles.emptyText}>No returns yet</Text>
            </View>
          ) : (
            returnsQuery.data?.data?.map((item: any) => (
              <View key={item.id} style={styles.returnCard}>
                <View style={styles.returnTop}>
                  <Text style={styles.returnId}>#{item.id?.slice(0, 8)}</Text>
                  <Text style={styles.returnDate}>
                    {item.created_at
                      ? new Date(item.created_at).toLocaleDateString('en-PH', {
                          month: 'short', day: 'numeric',
                        })
                      : '—'}
                  </Text>
                </View>
                <Text style={styles.returnTx}>
                  Transaction: {item.transaction?.transaction_number ?? item.transaction_id?.slice(0, 8)}
                </Text>
                <Text style={styles.returnReason}>
                  {REASON_LABELS[item.reason as ReturnReasonCode] ?? item.reason}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>

      <SettingsModal visible={showSettings} onClose={() => setShowSettings(false)} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  netDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  online:  { backgroundColor: '#10b981' },
  offline: { backgroundColor: '#ef4444' },
  profileBtn: {
    position: 'relative',
  },
  printerDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  scroll: {
    flex: 1,
  },
  section: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  stepLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  optional: {
    fontSize: 12,
    fontWeight: '400',
    color: '#9ca3af',
    textTransform: 'none',
    letterSpacing: 0,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 40,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
  },
  txScroll: {
    marginHorizontal: -16,
  },
  txScrollContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  txCard: {
    width: 150,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    position: 'relative',
    gap: 4,
  },
  txCardSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  txCheckBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  txCardNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  txCardCustomer: {
    fontSize: 12,
    color: '#6b7280',
  },
  txCardAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#374151',
    marginTop: 4,
  },
  txCardAmountSelected: {
    color: '#3b82f6',
  },
  txEmptyCard: {
    width: 200,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  txEmptyText: {
    fontSize: 13,
    color: '#9ca3af',
  },
  lineCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 6,
  },
  lineCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  lineName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  linePrice: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },
  lineMaxQty: {
    fontSize: 12,
    color: '#9ca3af',
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 4,
  },
  qtyBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnDisabled: {
    borderColor: '#f3f4f6',
    backgroundColor: '#f9fafb',
  },
  qtyValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    minWidth: 32,
    textAlign: 'center',
  },
  pillGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  pillActive: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  pillText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  pillTextActive: {
    color: '#3b82f6',
    fontWeight: '600',
  },
  notesInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  refundCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#3b82f6',
    paddingVertical: 20,
    alignItems: 'center',
    gap: 4,
  },
  refundLabel: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  refundAmount: {
    fontSize: 32,
    fontWeight: '700',
    color: '#3b82f6',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    borderRadius: 14,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  returnCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 4,
  },
  returnTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  returnId: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  returnDate: {
    fontSize: 12,
    color: '#9ca3af',
  },
  returnTx: {
    fontSize: 12,
    color: '#6b7280',
  },
  returnReason: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },
  bottomPad: {
    height: 32,
  },
})
