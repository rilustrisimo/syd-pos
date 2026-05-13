import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface GovCartItem {
  id: string
  product_id: string
  product_code: string
  product_name: string
  variant_id: string | null
  variant_name: string | null
  quantity: number
  uom_id: string
  uom_name: string
  unit_price: number
  cogs_per_unit: number
  discount_amount: number
}

export interface GovCustomer {
  id: string
  name: string
  phone: string | null
  customer_type: 'government'
  credit_limit: number
  outstanding_balance: number
}

interface GovSaleState {
  items: GovCartItem[]
  customer: GovCustomer | null
  branchId: string | null
  poNumber: string
  governmentAgency: string
  withholdingRate: number
  notes: string
  saleDate: string

  // Canvass reference — required before submitting a sale
  canvasId: string | null
  canvasNumber: string
  canvasTotalBudget: number  // sale total must not exceed this

  // Actions
  addItem: (item: Omit<GovCartItem, 'id'>) => void
  updateItemQuantity: (id: string, quantity: number) => void
  updateItemUnitPrice: (id: string, price: number) => void
  updateItemDiscount: (id: string, discount: number) => void
  removeItem: (id: string) => void
  setCustomer: (customer: GovCustomer | null) => void
  setBranchId: (id: string | null) => void
  setPoNumber: (po: string) => void
  setGovernmentAgency: (agency: string) => void
  setWithholdingRate: (rate: number) => void
  setNotes: (notes: string) => void
  setSaleDate: (date: string) => void
  setCanvasReference: (canvasId: string, canvasNumber: string, totalBudget: number) => void
  clearCanvasReference: () => void
  resetAll: () => void

  // Computed
  getItemCount: () => number
  getGrossTotal: () => number        // actual items sold
  getWithholdingAmount: () => number // PO amount × rate
  getNetReceivable: () => number     // PO amount − withholding = cheque expected
  getSpread: () => number            // cheque − actual items (profit/commission)
  isBudgetExceeded: () => boolean
  getRemainingBudget: () => number
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

const DEFAULT_WITHHOLDING_RATE = 5

export const useGovernmentSaleStore = create<GovSaleState>()(
  persist(
    (set, get) => ({
      items: [],
      customer: null,
      branchId: null,
      poNumber: '',
      governmentAgency: '',
      withholdingRate: DEFAULT_WITHHOLDING_RATE,
      notes: '',
      saleDate: new Date().toISOString().slice(0, 10),
      canvasId: null,
      canvasNumber: '',
      canvasTotalBudget: 0,

      addItem: (item) =>
        set((state) => {
          const existing = state.items.find(
            (i) =>
              i.product_id === item.product_id &&
              i.variant_id === item.variant_id &&
              i.uom_id === item.uom_id
          )
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.id === existing.id
                  ? { ...i, quantity: round2(i.quantity + item.quantity) }
                  : i
              ),
            }
          }
          return {
            items: [
              ...state.items,
              { ...item, id: `${item.product_id}-${item.variant_id ?? ''}-${item.uom_id}-${Date.now()}` },
            ],
          }
        }),

      updateItemQuantity: (id, quantity) =>
        set((state) => ({
          items: state.items.map((i) => (i.id === id ? { ...i, quantity } : i)),
        })),

      updateItemUnitPrice: (id, price) =>
        set((state) => ({
          items: state.items.map((i) => (i.id === id ? { ...i, unit_price: price } : i)),
        })),

      updateItemDiscount: (id, discount) =>
        set((state) => ({
          items: state.items.map((i) => (i.id === id ? { ...i, discount_amount: discount } : i)),
        })),

      removeItem: (id) =>
        set((state) => ({ items: state.items.filter((i) => i.id !== id) })),

      setCustomer: (customer) =>
        set({ customer, governmentAgency: customer?.name ?? get().governmentAgency }),

      setBranchId: (id) => set({ branchId: id }),
      setPoNumber: (po) => set({ poNumber: po }),
      setGovernmentAgency: (agency) => set({ governmentAgency: agency }),
      setWithholdingRate: (rate) => set({ withholdingRate: rate }),
      setNotes: (notes) => set({ notes }),
      setSaleDate: (date) => set({ saleDate: date }),

      setCanvasReference: (canvasId, canvasNumber, totalBudget) =>
        set({ canvasId, canvasNumber, canvasTotalBudget: totalBudget }),

      clearCanvasReference: () =>
        set({ canvasId: null, canvasNumber: '', canvasTotalBudget: 0 }),

      resetAll: () =>
        set({
          items: [],
          customer: null,
          poNumber: '',
          governmentAgency: '',
          withholdingRate: DEFAULT_WITHHOLDING_RATE,
          notes: '',
          saleDate: new Date().toISOString().slice(0, 10),
          canvasId: null,
          canvasNumber: '',
          canvasTotalBudget: 0,
        }),

      getItemCount: () => get().items.reduce((s, i) => s + i.quantity, 0),

      getGrossTotal: () =>
        get().items.reduce(
          (s, i) => s + round2(i.quantity * i.unit_price - i.discount_amount),
          0
        ),

      // Withholding is based on the canvass PO amount, not the actual items sold
      getWithholdingAmount: () =>
        round2((get().canvasTotalBudget * get().withholdingRate) / 100),

      // Net receivable = cheque expected = PO amount − withholding
      getNetReceivable: () =>
        round2(get().canvasTotalBudget - get().getWithholdingAmount()),

      // Spread = cheque received − actual items sold (profit/commission/difference)
      getSpread: () =>
        round2(get().getNetReceivable() - get().getGrossTotal()),

      isBudgetExceeded: () => {
        const { canvasTotalBudget } = get()
        if (!canvasTotalBudget) return false
        return get().getGrossTotal() > canvasTotalBudget
      },

      getRemainingBudget: () => {
        const { canvasTotalBudget } = get()
        if (!canvasTotalBudget) return 0
        return round2(canvasTotalBudget - get().getGrossTotal())
      },
    }),
    { name: 'gov-sale-store' }
  )
)
