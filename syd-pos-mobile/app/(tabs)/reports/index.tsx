import { useState, useMemo, useCallback } from 'react'
import {
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@syd/api'
import { SettingsModal } from '../../../components/SettingsModal'
import { useNetworkStatus } from '../../../hooks/useNetworkStatus'
import { usePrinterStore } from '../../../store/printer'

type TodayStats = {
  salesCount: number
  totalRevenue: number
  totalItems: number
  topProducts: { name: string; qty: number; revenue: number }[]
  paymentBreakdown: { method: string; amount: number }[]
}

function startOfToday(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function useTodayReport() {
  return useQuery<TodayStats>({
    queryKey: ['today-report', new Date().toDateString()],
    queryFn: async (): Promise<TodayStats> => {
      const { data, error } = await supabase
        .from('transactions')
        .select(
          `
          id,
          total_amount,
          lines:transaction_lines(quantity, unit_price, discount_amount, product:products(name)),
          payments:transaction_payments(payment_method, amount)
        `
        )
        .gte('created_at', startOfToday())
        .eq('transaction_type', 'sale')

      if (error) throw new Error(error.message)

      const txns = data ?? []

      const salesCount   = txns.length
      const totalRevenue = txns.reduce((s, t) => s + Number(t.total_amount ?? 0), 0)

      // Aggregate product quantities
      const productMap = new Map<string, { name: string; qty: number; revenue: number }>()

      let totalItems = 0
      for (const tx of txns) {
        for (const line of (tx.lines ?? []) as any[]) {
          const name = (line.product as any)?.name ?? 'Unknown'
          const qty  = Number(line.quantity ?? 0)
          const rev  = qty * Number(line.unit_price ?? 0) - Number(line.discount_amount ?? 0)
          totalItems += qty

          const existing = productMap.get(name)
          if (existing) {
            existing.qty     += qty
            existing.revenue += rev
          } else {
            productMap.set(name, { name, qty, revenue: rev })
          }
        }
      }

      const topProducts = Array.from(productMap.values())
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5)

      // Payment breakdown
      const payMap = new Map<string, number>()
      for (const tx of txns) {
        for (const p of (tx.payments ?? []) as any[]) {
          const method = p.payment_method as string
          payMap.set(method, (payMap.get(method) ?? 0) + Number(p.amount ?? 0))
        }
      }
      const paymentBreakdown = Array.from(payMap.entries())
        .map(([method, amount]) => ({ method, amount }))
        .sort((a, b) => b.amount - a.amount)

      return { salesCount, totalRevenue, totalItems, topProducts, paymentBreakdown }
    },
    staleTime: 1000 * 60 * 5,  // 5 min
    gcTime:    1000 * 60 * 15,
    retry: 2,
  })
}

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

export default function ReportsScreen() {
  const [showSettings, setShowSettings] = useState(false)
  const { isOnline }    = useNetworkStatus()
  const printerStatus   = usePrinterStore((s) => s.status)
  const report          = useTodayReport()
  const stats           = report.data

  const today = useMemo(
    () => new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    []
  )

  const onRefresh = useCallback(() => { report.refetch() }, [report])

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Today's Report</Text>
          <Text style={styles.headerDate}>{today}</Text>
        </View>
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
        refreshControl={
          <RefreshControl refreshing={report.isRefetching} onRefresh={onRefresh} />
        }
      >
        {report.isLoading ? (
          <View style={styles.loading}>
            <Text style={styles.loadingText}>Loading today's data…</Text>
          </View>
        ) : report.isError ? (
          <View style={styles.loading}>
            <Ionicons name="cloud-offline-outline" size={40} color="#9ca3af" />
            <Text style={styles.loadingText}>Could not load report</Text>
            <Pressable onPress={onRefresh} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* KPI row */}
            <View style={styles.kpiRow}>
              <View style={styles.kpiCard}>
                <Ionicons name="receipt-outline" size={20} color="#3b82f6" />
                <Text style={styles.kpiValue}>{stats?.salesCount ?? 0}</Text>
                <Text style={styles.kpiLabel}>Sales</Text>
              </View>
              <View style={styles.kpiCard}>
                <Ionicons name="cash-outline" size={20} color="#10b981" />
                <Text style={styles.kpiValue}>₱{fmt(stats?.totalRevenue ?? 0)}</Text>
                <Text style={styles.kpiLabel}>Revenue</Text>
              </View>
              <View style={styles.kpiCard}>
                <Ionicons name="cube-outline" size={20} color="#f59e0b" />
                <Text style={styles.kpiValue}>{stats?.totalItems ?? 0}</Text>
                <Text style={styles.kpiLabel}>Items sold</Text>
              </View>
            </View>

            {/* Top products */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Top Products</Text>
              {!stats?.topProducts.length ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>No sales today</Text>
                </View>
              ) : (
                <View style={styles.card}>
                  {stats.topProducts.map((p, i) => (
                    <View key={p.name}>
                      <View style={styles.productRow}>
                        <View style={styles.rank}>
                          <Text style={styles.rankText}>#{i + 1}</Text>
                        </View>
                        <View style={styles.productInfo}>
                          <Text style={styles.productName} numberOfLines={1}>{p.name}</Text>
                          <Text style={styles.productMeta}>{p.qty} units sold</Text>
                        </View>
                        <Text style={styles.productRevenue}>₱{fmt(p.revenue)}</Text>
                      </View>
                      {i < (stats?.topProducts.length ?? 0) - 1 && <View style={styles.divider} />}
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Payment breakdown */}
            {(stats?.paymentBreakdown.length ?? 0) > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Payment Methods</Text>
                <View style={styles.card}>
                  {stats!.paymentBreakdown.map((p, i) => (
                    <View key={p.method}>
                      <View style={styles.payRow}>
                        <Text style={styles.payLabel}>
                          {PAYMENT_LABELS[p.method] ?? p.method}
                        </Text>
                        <Text style={styles.payAmount}>₱{fmt(p.amount)}</Text>
                      </View>
                      {i < (stats?.paymentBreakdown.length ?? 0) - 1 && <View style={styles.divider} />}
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.bottomPad} />
          </>
        )}
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
  headerDate: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
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
    padding: 16,
  },
  loading: {
    flex: 1,
    paddingVertical: 80,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#3b82f6',
    borderRadius: 10,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  kpiLabel: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '500',
  },
  section: {
    marginBottom: 20,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  rank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3b82f6',
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  productMeta: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  productRevenue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  payRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  payLabel: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '500',
  },
  payAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  divider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginHorizontal: -16,
  },
  emptyState: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  bottomPad: {
    height: 24,
  },
})
