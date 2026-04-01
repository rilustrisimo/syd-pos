'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PrinterStore {
  /** CUPS queue name (macOS) or USB queue "usb:vid:pid" (Electron USB) */
  cupsQueueName: string
  setCupsQueueName: (name: string) => void

  /** COM port path for Bluetooth SPP printing (e.g. "COM4" on Windows) */
  btPortPath: string
  setBtPortPath: (path: string) => void

  /** Paper width preference — matches mobile app setting */
  paperWidth: '58mm' | '80mm'
  setPaperWidth: (w: '58mm' | '80mm') => void
}

export const usePrinterStore = create<PrinterStore>()(
  persist(
    (set) => ({
      cupsQueueName: 'STMicroelectronics_POS80_Printer_USB',
      setCupsQueueName: (name) => set({ cupsQueueName: name }),

      btPortPath: '',
      setBtPortPath: (path) => set({ btPortPath: path }),

      paperWidth: '80mm',
      setPaperWidth: (w) => set({ paperWidth: w }),
    }),
    {
      name: 'syd-printer-settings',
    }
  )
)
