'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PrinterStore {
  serverUrl: string
  autoThermalPrint: boolean
  receiptWidth: '58mm' | '80mm'
  setServerUrl: (url: string) => void
  setAutoThermalPrint: (auto: boolean) => void
  setReceiptWidth: (width: '58mm' | '80mm') => void
}

export const usePrinterStore = create<PrinterStore>()(
  persist(
    (set) => ({
      serverUrl: 'http://localhost:9100',
      autoThermalPrint: false,
      receiptWidth: '80mm',
      setServerUrl: (url) => set({ serverUrl: url }),
      setAutoThermalPrint: (auto) => set({ autoThermalPrint: auto }),
      setReceiptWidth: (width) => set({ receiptWidth: width }),
    }),
    {
      name: 'syd-printer-settings',
    }
  )
)
