import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type PrinterStatus = 'idle' | 'scanning' | 'connecting' | 'connected' | 'error'

export type ScannedDevice = {
  id: string
  name: string | null
  rssi: number | null
}

type PrinterState = {
  status: PrinterStatus
  deviceId: string | null
  deviceName: string | null
  errorMessage: string | null
  /** Persisted: last successfully connected printer ID */
  savedPrinterId: string | null
  /** Persisted: last successfully connected printer display name */
  savedPrinterName: string | null
  /** Persisted: paper width preference */
  paperWidth: '58mm' | '80mm'
  /** Ephemeral: devices found during the current BLE scan */
  scannedDevices: ScannedDevice[]

  setStatus: (status: PrinterStatus, deviceId?: string | null, deviceName?: string | null) => void
  setError: (message: string) => void
  setSavedPrinter: (id: string, name: string | null) => void
  clearSavedPrinter: () => void
  setPaperWidth: (width: '58mm' | '80mm') => void
  addScannedDevice: (device: ScannedDevice) => void
  clearScannedDevices: () => void
  reset: () => void
}

export const usePrinterStore = create<PrinterState>()(
  persist(
    (set) => ({
      status: 'idle',
      deviceId: null,
      deviceName: null,
      errorMessage: null,
      savedPrinterId: null,
      savedPrinterName: null,
      paperWidth: '80mm',
      scannedDevices: [],

      setStatus: (status, deviceId = null, deviceName = null) =>
        set({ status, deviceId, deviceName, errorMessage: null }),

      setError: (message) => set({ status: 'error', errorMessage: message }),

      setSavedPrinter: (id, name) =>
        set({ savedPrinterId: id, savedPrinterName: name }),

      clearSavedPrinter: () =>
        set({ savedPrinterId: null, savedPrinterName: null }),

      setPaperWidth: (width) => set({ paperWidth: width }),

      addScannedDevice: (device) =>
        set((s) => ({
          scannedDevices: s.scannedDevices.some((d) => d.id === device.id)
            ? s.scannedDevices
            : [...s.scannedDevices, device],
        })),

      clearScannedDevices: () => set({ scannedDevices: [] }),

      reset: () =>
        set({ status: 'idle', deviceId: null, deviceName: null, errorMessage: null }),
    }),
    {
      name: 'syd-printer-store',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist settings, not ephemeral scan/connection state
      partialize: (state) => ({
        savedPrinterId: state.savedPrinterId,
        savedPrinterName: state.savedPrinterName,
        paperWidth: state.paperWidth,
      }),
    }
  )
)
