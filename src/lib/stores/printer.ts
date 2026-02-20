'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PrinterStore {
  /** CUPS queue name of the selected thermal printer (e.g. STMicroelectronics_POS80_Printer_USB) */
  cupsQueueName: string
  setCupsQueueName: (name: string) => void
}

export const usePrinterStore = create<PrinterStore>()(
  persist(
    (set) => ({
      cupsQueueName: 'STMicroelectronics_POS80_Printer_USB',
      setCupsQueueName: (name) => set({ cupsQueueName: name }),
    }),
    {
      name: 'syd-printer-settings',
    }
  )
)
