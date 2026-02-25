import { useMemo, useState, useCallback } from 'react'
import {
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTransactions } from '@syd/api'
import { useOfflineStore } from '../../../store/offline'
import { useNetworkStatus } from '../../../hooks/useNetworkStatus'
import { usePrinterStore } from '../../../store/printer'
import { SettingsModal } from '../../../components/SettingsModal'

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

export default function HistoryScreen() {
  const router         = useRouter()
  const [query, setQuery] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const { isOnline }   = useNetworkStatus()
  const printerStatus  = usePrinterStore((s) => s.status)
  const queue          = useOfflineStore((s) => s.queue)
  const clearSynced    = useOfflineStore((s) => s.clearSynced)

  const transactionsQuery = useTransactions(1, 50)

  const filteredTransactions = useMemo(() => {
    const list = transactionsQuery.data?.data ?? []
    const q    = query.trim().toLowerCase()
    if (!q) return list
    return list.filter((tx) => {
      const num      = tx.transaction_number?.toLowerCase() ?? ''
      const customer = tx.customer as { name?: string; display_name?: string } | undefined
      const name     = (customer?.name ?? customer?.display_name ?? '').toLowerCase()
      return num.includes(q) || name.includes(q)
    })
  }, [transactionsQuery.data?.data, query])

  const pendingQueue   = queue.filter((item) => item.status !== 'synced')
  const syncedCount    = queue.length - pendingQueue.length

  const onRefresh = useCallback(() => { transactionsQuery.refetch() }, [transactionsQuery])

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>History</Text>
        <View style={styles.headerRight}>
          <View style={[styles.netDot, isOnline ? styles.online : styles.offline]} />
          <Pressable onPress={() => setShowSettings(true)} hitSlop={8} style={styles.profileBtn}>
            <Ionicons name="person-circle-outline" size={28} color="#374151" />
            {printerStatus === 'connected' && <View style={styles.printerDot} />}
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={transactionsQuery.isRefetching} onRefresh={onRefresh} />
        }
      >
        {/* Search */}
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={18} color="#9ca3af" style={styles.searchIcon} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by # or customer…"
            placeholderTextColor="#9ca3af"
            style={styles.searchInput}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color="#9ca3af" />
            </Pressable>
          )}
        </View>

        {/* Offline queue banner */}
        {(pendingQueue.length > 0 || syncedCount > 0) && (
          <View style={styles.queueBanner}>
            <View style={styles.queueBannerLeft}>
              <Ionicons name="cloud-offline-outline" size={18} color="#92400e" />
              <View>
                <Text style={styles.queueTitle}>Offline Queue</Text>
                <Text style={styles.queueMeta}>
                  {pendingQueue.length > 0 && `${pendingQueue.length} pending`}
                  {pendingQueue.length > 0 && syncedCount > 0 && '  ·  '}
                  {syncedCount > 0 && `${syncedCount} synced`}
                </Text>
              </View>
            </View>
            {syncedCount > 0 && (
              <Pressable onPress={clearSynced} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>Clear</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Queued transactions */}
        {pendingQueue.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Queued</Text>
            {pendingQueue.map((item) => (
              <View key={item.id} style={styles.queuedCard}>
                <View style={styles.queuedLeft}>
                  <Text style={styles.queuedId}>#{item.id.slice(0, 8)}</Text>
                  <Text style={styles.queuedDate}>
                    {new Date(item.createdAt).toLocaleString('en-PH', {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </Text>
                </View>
                <View style={styles.queuedRight}>
                  <Text style={styles.queuedAmount}>
                    ₱{fmt(item.transactionData.payments?.[0]?.amount ?? 0)}
                  </Text>
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingBadgeText}>{item.status.toUpperCase()}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Server transactions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Transactions</Text>
          {transactionsQuery.isLoading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Loading…</Text>
            </View>
          ) : filteredTransactions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={40} color="#d1d5db" />
              <Text style={styles.emptyText}>No transactions found</Text>
            </View>
          ) : (
            filteredTransactions.map((tx) => {
              const customer = tx.customer as { name?: string; display_name?: string } | undefined
              const total    = Number(tx.total_amount ?? 0)
              const status   = (tx.payment_status || 'unknown').toLowerCase()
              const color    = STATUS_COLOR[status] ?? '#6b7280'
              const bg       = STATUS_BG[status]   ?? '#f3f4f6'

              return (
                <Pressable
                  key={tx.id}
                  onPress={() => router.push(`/(tabs)/history/${tx.id}`)}
                  style={styles.txCard}
                >
                  <View style={styles.txTop}>
                    <View>
                      <Text style={styles.txNumber}>{tx.transaction_number}</Text>
                      <Text style={styles.txDate}>
                        {new Date(tx.created_at).toLocaleDateString('en-PH', {
                          month: 'short', day: 'numeric', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: bg }]}>
                      <Text style={[styles.statusText, { color }]}>{status.toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={styles.txCustomer}>
                    {customer?.name ?? customer?.display_name ?? 'Walk-in Customer'}
                  </Text>
                  <View style={styles.txBottom}>
                    <Text style={styles.txTotal}>₱{fmt(total)}</Text>
                    <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
                  </View>
                </Pressable>
              )
            })
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    height: 44,
    gap: 8,
  },
  searchIcon: {
    marginRight: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
  },
  queueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  queueBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  queueTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400e',
  },
  queueMeta: {
    fontSize: 12,
    color: '#b45309',
    marginTop: 1,
  },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d97706',
  },
  clearBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#d97706',
  },
  section: {
    marginTop: 16,
    paddingHorizontal: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 4,
  },
  queuedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  queuedLeft: {
    gap: 2,
  },
  queuedId: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
    fontVariant: ['tabular-nums'],
  },
  queuedDate: {
    fontSize: 12,
    color: '#9ca3af',
  },
  queuedRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  queuedAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  pendingBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  pendingBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#f59e0b',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  txCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  txTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  txNumber: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  txDate: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  txCustomer: {
    fontSize: 14,
    color: '#374151',
  },
  txBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  txTotal: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  bottomPad: {
    height: 24,
  },
})
