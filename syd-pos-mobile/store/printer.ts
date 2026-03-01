import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type PrinterStatus = 'idle' | 'loading' | 'connecting' | 'connected' | 'error'

/** A Classic Bluetooth device that is already paired in Android Settings. */
export type PairedDevice = {
  id:   string       // MAC address  e.g. "00:11:22:33:44:55"
  name: string | null
}

type PrinterState = {
  status: PrinterStatus
  deviceId: string | null
  deviceName: string | null
  errorMessage: string | null
  /** Persisted: last successfully connected printer ID (MAC address) */
  savedPrinterId: string | null
  /** Persisted: last successfully connected printer display name */
  savedPrinterName: string | null
  /** Persisted: paper width preference */
  paperWidth: '58mm' | '80mm'
  /** Ephemeral: paired devices loaded from Android Bluetooth */
  pairedDevices: PairedDevice[]

  setStatus: (status: PrinterStatus, deviceId?: string | null, deviceName?: string | null) => void
  setError: (message: string) => void
  setSavedPrinter: (id: string, name: string | null) => void
  clearSavedPrinter: () => void
  setPaperWidth: (width: '58mm' | '80mm') => void
  setPairedDevices: (devices: PairedDevice[]) => void
  clearPairedDevices: () => void
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
      pairedDevices: [],

      setStatus: (status, deviceId = null, deviceName = null) =>
        set({ status, deviceId, deviceName, errorMessage: null }),

      setError: (message) => set({ status: 'error', errorMessage: message }),

      setSavedPrinter: (id, name) =>
        set({ savedPrinterId: id, savedPrinterName: name }),

      clearSavedPrinter: () =>
        set({ savedPrinterId: null, savedPrinterName: null }),

      setPaperWidth: (width) => set({ paperWidth: width }),

      setPairedDevices: (devices) => set({ pairedDevices: devices }),

      clearPairedDevices: () => set({ pairedDevices: [] }),

      reset: () =>
        set({ status: 'idle', deviceId: null, deviceName: null, errorMessage: null }),
    }),
    {
      name: 'syd-printer-store',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist settings; ephemeral connection state is not persisted
      partialize: (state) => ({
        savedPrinterId:  state.savedPrinterId,
        savedPrinterName: state.savedPrinterName,
        paperWidth:      state.paperWidth,
      }),
    }
  )
)
