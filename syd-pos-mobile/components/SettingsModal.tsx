import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useLogout, useAuth, useBranches } from '@syd/api'
import { useAuthStore } from '../store/auth'
import { usePrinterStore } from '../store/printer'
import { btPrinter } from '../lib/bt-printer'
import type { PairedDevice } from '../store/printer'

type Props = {
  visible: boolean
  onClose: () => void
}

export function SettingsModal({ visible, onClose }: Props) {
  const logout             = useLogout()
  const { data: authUser } = useAuth()
  const { data: branches = [] } = useBranches()

  const clearAuth       = useAuthStore((s) => s.clearAuth)
  const localBranchId   = useAuthStore((s) => s.localBranchId)
  const localBranchName = useAuthStore((s) => s.localBranchName)
  const setLocalBranch  = useAuthStore((s) => s.setLocalBranch)

  const printerStatus      = usePrinterStore((s) => s.status)
  const printerDeviceId    = usePrinterStore((s) => s.deviceId)
  const printerDeviceName  = usePrinterStore((s) => s.deviceName)
  const printerError       = usePrinterStore((s) => s.errorMessage)
  const savedPrinterName   = usePrinterStore((s) => s.savedPrinterName)
  const savedPrinterId     = usePrinterStore((s) => s.savedPrinterId)
  const paperWidth         = usePrinterStore((s) => s.paperWidth)
  const setPaperWidth      = usePrinterStore((s) => s.setPaperWidth)
  const pairedDevices      = usePrinterStore((s) => s.pairedDevices)
  const setPairedDevices   = usePrinterStore((s) => s.setPairedDevices)

  const [showBranchPicker, setShowBranchPicker] = useState(false)
  const [isConnecting, setIsConnecting]         = useState<string | null>(null)
  const [isLoadingPaired, setIsLoadingPaired]   = useState(false)

  // Effective branch
  const effectiveBranchId   = authUser?.branch_id ?? localBranchId
  const effectiveBranchName = authUser?.branch_id
    ? (branches.find((b) => b.id === authUser.branch_id)?.name ?? `Branch (${authUser.branch_id.slice(0, 8)}…)`)
    : (localBranchName ?? null)

  // ── Printer: load paired devices ──────────────────────────────────────────

  const handleLoadPaired = async () => {
    setIsLoadingPaired(true)
    try {
      const devices = await btPrinter.getPairedDevices()
      setPairedDevices(devices)
      if (devices.length === 0) {
        Alert.alert(
          'No Paired Printers Found',
          'No Bluetooth devices are paired on this phone.\n\n' +
          'Steps to fix:\n' +
          '1. Turn on the thermal printer\n' +
          '2. Open Android Settings → Bluetooth\n' +
          '3. Tap "Pair new device" and select your printer\n' +
          '4. Come back here and tap "Load Paired Printers" again',
        )
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not load devices'
      Alert.alert('Bluetooth Error', msg)
    } finally {
      setIsLoadingPaired(false)
    }
  }

  const handleConnectDevice = async (device: PairedDevice) => {
    if (isConnecting) return
    setIsConnecting(device.id)
    try {
      await btPrinter.connectToDevice(device.id, device.name)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not connect'
      Alert.alert('Connection Error', msg)
    } finally {
      setIsConnecting(null)
    }
  }

  const handleDisconnectPrinter = async () => {
    await btPrinter.disconnect()
  }

  // ── Logout ────────────────────────────────────────────────────────────────

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          try { await logout.mutateAsync() } catch { /* ignore */ }
          finally { clearAuth(); onClose() }
        },
      },
    ])
  }

  // ── Printer status display ─────────────────────────────────────────────────

  const statusColor = {
    idle:       '#6b7280',
    loading:    '#f59e0b',
    connecting: '#3b82f6',
    connected:  '#10b981',
    error:      '#ef4444',
  }[printerStatus]

  const statusLabel = {
    idle:       savedPrinterName ? `Last: ${savedPrinterName}` : 'Not connected',
    loading:    'Loading paired devices…',
    connecting: `Connecting to ${printerDeviceName ?? printerDeviceId ?? '…'}`,
    connected:  printerDeviceName ?? 'Connected',
    error:      'Error',
  }[printerStatus]

  const initials = authUser?.email?.substring(0, 2).toUpperCase() ?? '?'
  const email    = authUser?.email ?? '—'

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.root}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Account & Settings</Text>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
            <Ionicons name="close" size={24} color="#374151" />
          </Pressable>
        </View>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* User card */}
          <View style={styles.card}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userEmail}>{email}</Text>
              <Text style={styles.userRole}>{authUser?.role?.replace('_', ' ').toUpperCase() ?? ''}</Text>
            </View>
          </View>

          {/* Branch card */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Branch</Text>
            <View style={styles.card}>
              <View style={styles.row}>
                <View style={styles.rowLeft}>
                  <Ionicons name="business-outline" size={20} color="#374151" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowLabel} numberOfLines={1}>
                      {effectiveBranchName ?? 'No branch assigned'}
                    </Text>
                    {!authUser?.branch_id && localBranchId && (
                      <Text style={styles.localBadge}>Stored on this device</Text>
                    )}
                    {authUser?.branch_id && (
                      <Text style={styles.dbBadge}>Set by admin</Text>
                    )}
                  </View>
                </View>
                {effectiveBranchId ? (
                  <View style={[styles.badge, { backgroundColor: '#d1fae5' }]}>
                    <View style={[styles.dot, { backgroundColor: '#10b981' }]} />
                    <Text style={[styles.badgeText, { color: '#10b981' }]}>Active</Text>
                  </View>
                ) : (
                  <View style={[styles.badge, { backgroundColor: '#fee2e2' }]}>
                    <View style={[styles.dot, { backgroundColor: '#ef4444' }]} />
                    <Text style={[styles.badgeText, { color: '#ef4444' }]}>Missing</Text>
                  </View>
                )}
              </View>

              {!authUser?.branch_id && (
                <>
                  <Text style={styles.hint}>
                    Your account has no branch assigned by an admin. Pick your working branch below — saved on this device only.
                  </Text>
                  <Pressable
                    onPress={() => setShowBranchPicker(true)}
                    style={styles.actionBtn}
                  >
                    <Ionicons name="swap-horizontal-outline" size={16} color="#fff" />
                    <Text style={styles.actionBtnText}>
                      {localBranchId ? 'Change Branch' : 'Select Branch'}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>

          {/* ── Thermal Printer card ───────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Thermal Printer</Text>
            <View style={styles.card}>

              {/* Status row */}
              <View style={styles.row}>
                <View style={styles.rowLeft}>
                  <Ionicons name="print-outline" size={20} color="#374151" />
                  <Text style={[styles.rowLabel, { color: statusColor }]} numberOfLines={1}>
                    {statusLabel}
                  </Text>
                </View>
                <View style={[styles.badge, { backgroundColor: statusColor + '22' }]}>
                  {printerStatus === 'loading' || printerStatus === 'connecting' ? (
                    <ActivityIndicator size="small" color={statusColor} />
                  ) : (
                    <View style={[styles.dot, { backgroundColor: statusColor }]} />
                  )}
                  <Text style={[styles.badgeText, { color: statusColor }]}>
                    {printerStatus === 'connected'  ? 'Connected'
                      : printerStatus === 'loading'   ? 'Loading'
                      : printerStatus === 'connecting' ? 'Connecting'
                      : printerStatus === 'error'      ? 'Error'
                      : 'Offline'}
                  </Text>
                </View>
              </View>

              {printerStatus === 'error' && printerError && (
                <Text style={styles.errorText}>{printerError}</Text>
              )}

              {/* Action buttons */}
              {printerStatus === 'connected' ? (
                <Pressable style={[styles.actionBtn, styles.actionBtnGray]} onPress={handleDisconnectPrinter}>
                  <Ionicons name="bluetooth-outline" size={16} color="#fff" />
                  <Text style={styles.actionBtnText}>Disconnect Printer</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={[
                    styles.actionBtn,
                    (isLoadingPaired || printerStatus === 'connecting') && styles.actionBtnDisabled,
                  ]}
                  onPress={handleLoadPaired}
                  disabled={isLoadingPaired || printerStatus === 'connecting'}
                >
                  {isLoadingPaired ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="bluetooth-outline" size={16} color="#fff" />
                  )}
                  <Text style={styles.actionBtnText}>
                    {isLoadingPaired ? 'Loading…' : 'Load Paired Printers'}
                  </Text>
                </Pressable>
              )}

              {/* Paired device list */}
              {pairedDevices.length > 0 && printerStatus !== 'connected' && (
                <View style={styles.deviceList}>
                  <Text style={styles.deviceListLabel}>
                    {pairedDevices.length} paired device{pairedDevices.length !== 1 ? 's' : ''}
                  </Text>
                  {pairedDevices.map((dev) => {
                    const isSaved = dev.id === savedPrinterId
                    const isBusy  = isConnecting === dev.id
                    return (
                      <View key={dev.id} style={[styles.deviceRow, isSaved && styles.deviceRowSaved]}>
                        <View style={styles.deviceRowLeft}>
                          <Ionicons name="print-outline" size={18} color={isSaved ? '#3b82f6' : '#374151'} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.deviceName, isSaved && { color: '#3b82f6' }]} numberOfLines={1}>
                              {dev.name ?? 'Unknown Device'}
                              {isSaved ? '  ★' : ''}
                            </Text>
                            <Text style={styles.deviceId}>{dev.id}</Text>
                          </View>
                        </View>
                        <Pressable
                          style={[styles.connectDeviceBtn, isBusy && { opacity: 0.5 }]}
                          onPress={() => handleConnectDevice(dev)}
                          disabled={!!isConnecting}
                        >
                          {isBusy ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text style={styles.connectDeviceBtnText}>Connect</Text>
                          )}
                        </Pressable>
                      </View>
                    )
                  })}
                </View>
              )}

              {/* Paper width */}
              <View style={styles.paperWidthRow}>
                <Text style={styles.paperWidthLabel}>Paper Width</Text>
                <View style={styles.paperWidthBtns}>
                  {(['58mm', '80mm'] as const).map((w) => (
                    <Pressable
                      key={w}
                      style={[styles.paperWidthBtn, paperWidth === w && styles.paperWidthBtnActive]}
                      onPress={() => setPaperWidth(w)}
                    >
                      <Text style={[styles.paperWidthBtnText, paperWidth === w && styles.paperWidthBtnTextActive]}>
                        {w}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <Text style={styles.hint}>
                Pair your printer once in Android Settings → Bluetooth, then tap "Load Paired Printers" above to connect.
              </Text>
            </View>
          </View>

          {/* Logout */}
          <View style={styles.section}>
            <Pressable onPress={handleLogout} style={styles.logoutBtn}>
              <Ionicons name="log-out-outline" size={20} color="#ef4444" />
              <Text style={styles.logoutText}>Log Out</Text>
            </Pressable>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>SYD POS Mobile v1.0</Text>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Branch Picker Modal */}
      <Modal
        visible={showBranchPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowBranchPicker(false)}
      >
        <SafeAreaView style={styles.root}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Select Branch</Text>
            <Pressable onPress={() => setShowBranchPicker(false)} style={styles.closeBtn} hitSlop={8}>
              <Ionicons name="close" size={24} color="#374151" />
            </Pressable>
          </View>
          <ScrollView style={styles.scroll}>
            <Text style={styles.pickerHint}>
              This selection is stored on this device only. Contact an admin to permanently assign your branch.
            </Text>
            {branches.length === 0 ? (
              <View style={styles.pickerEmpty}>
                <Ionicons name="business-outline" size={40} color="#d1d5db" />
                <Text style={styles.pickerEmptyText}>No branches found</Text>
              </View>
            ) : (
              branches.map((branch) => {
                const isSelected = branch.id === localBranchId
                return (
                  <Pressable
                    key={branch.id}
                    onPress={() => {
                      setLocalBranch(branch.id, branch.name)
                      setShowBranchPicker(false)
                    }}
                    style={[styles.branchOption, isSelected && styles.branchOptionSelected]}
                  >
                    <View style={styles.branchOptionLeft}>
                      <Text style={styles.branchOptionName}>{branch.name}</Text>
                      <Text style={styles.branchOptionCode}>{branch.code}</Text>
                      {branch.address ? (
                        <Text style={styles.branchOptionAddress} numberOfLines={1}>{branch.address}</Text>
                      ) : null}
                    </View>
                    {isSelected && <Ionicons name="checkmark-circle" size={22} color="#3b82f6" />}
                  </Pressable>
                )
              })
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  userInfo: {
    alignItems: 'center',
    gap: 4,
  },
  userEmail: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  userRole: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  section: {
    marginTop: 20,
    gap: 10,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  localBadge: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 1,
  },
  dbBadge: {
    fontSize: 11,
    color: '#10b981',
    marginTop: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  hint: {
    fontSize: 11,
    color: '#9ca3af',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 12,
    color: '#ef4444',
    lineHeight: 16,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#3b82f6',
  },
  actionBtnGray: {
    backgroundColor: '#6b7280',
  },
  actionBtnDisabled: {
    opacity: 0.55,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },

  // Device list
  deviceList: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 12,
  },
  deviceListLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  deviceRowSaved: {
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  deviceRowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  deviceName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  deviceId: {
    fontSize: 11,
    color: '#9ca3af',
    fontFamily: 'monospace',
    marginTop: 2,
  },
  connectDeviceBtn: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    minWidth: 76,
    alignItems: 'center',
  },
  connectDeviceBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },

  // Paper width
  paperWidthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 12,
  },
  paperWidthLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  paperWidthBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  paperWidthBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  paperWidthBtnActive: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  paperWidthBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  paperWidthBtnTextActive: {
    color: '#3b82f6',
  },

  // Logout
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ef4444',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  footerText: {
    fontSize: 12,
    color: '#9ca3af',
  },

  // Branch picker
  pickerHint: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
    marginBottom: 16,
    marginHorizontal: 4,
  },
  pickerEmpty: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  pickerEmptyText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  branchOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  branchOptionSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  branchOptionLeft: {
    flex: 1,
    gap: 3,
  },
  branchOptionName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  branchOptionCode: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  branchOptionAddress: {
    fontSize: 12,
    color: '#9ca3af',
  },
})
