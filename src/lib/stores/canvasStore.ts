import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CanvasItem {
  id: string // unique cart item id
  product_id: string
  product_code: string
  product_name: string
  variant_id: string | null
  variant_name: string | null
  quantity: number
  uom_id: string
  uom_name: string
  unit_price: number
  cogs_per_unit: number  // stored so Convert-to-Sale can populate POS correctly
  markup_percentage: number
  discount_amount: number
  available_stock: number
}

export interface CanvasCustomer {
  id: string
  name: string
  phone: string | null
  customer_type: 'cash' | 'credit' | 'wholesale' | 'retail'
  credit_limit: number
  outstanding_balance: number
}

type DiscountType = 'none' | 'fixed' | 'percentage' | 'standard' | 'cost'

interface CanvasState {
  // Items
  items: CanvasItem[]
  customer: CanvasCustomer | null
  branchId: string | null
  deliveryFee: number
  otherFees: number
  otherFeesNotes: string
  discountAmount: number
  discountPercentage: number
  discountType: DiscountType
  notes: string
  title: string

  // Actions — items
  addItem: (item: Omit<CanvasItem, 'id'>) => void
  updateItemQuantity: (id: string, quantity: number) => void
  updateItemDiscount: (id: string, discount: number) => void
  removeItem: (id: string) => void
  clearCanvas: () => void

  // Actions — metadata
  setCustomer: (customer: CanvasCustomer | null) => void
  setBranchId: (branchId: string) => void
  setDeliveryFee: (fee: number) => void
  setOtherFees: (fees: number) => void
  setOtherFeesNotes: (notes: string) => void
  setDiscountAmount: (amount: number) => void
  setDiscountPercentage: (percentage: number) => void
  setDiscountType: (type: DiscountType) => void
  setNotes: (notes: string) => void
  setTitle: (title: string) => void

  // Reset
  resetAll: () => void

  // Computed
  getSubtotal: () => number
  getItemsDiscount: () => number
  getOrderDiscount: () => number
  getTotalDiscount: () => number
  getTotal: () => number
  getItemCount: () => number
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

const initialState = {
  items: [] as CanvasItem[],
  customer: null as CanvasCustomer | null,
  branchId: null as string | null,
  deliveryFee: 0,
  otherFees: 0,
  otherFeesNotes: '',
  discountAmount: 0,
  discountPercentage: 0,
  discountType: 'none' as DiscountType,
  notes: '',
  title: '',
}

export const useCanvasStore = create<CanvasState>()(
  persist(
    (set, get) => ({
      ...initialState,

      addItem: (item) => {
        set((state) => {
          const normalised = {
            ...item,
            unit_price: round2(item.unit_price),
            cogs_per_unit: round2(item.cogs_per_unit),
          }

          const existingIndex = state.items.findIndex(
            (i) => i.product_id === normalised.product_id && i.variant_id === normalised.variant_id
          )

          if (existingIndex >= 0) {
            const newItems = [...state.items]
            newItems[existingIndex] = {
              ...newItems[existingIndex],
              quantity: newItems[existingIndex].quantity + normalised.quantity,
            }
            return { items: newItems }
          }

          return {
            items: [...state.items, { ...normalised, id: generateId() }],
          }
        })
      },

      updateItemQuantity: (id, quantity) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, quantity: Math.max(0.01, quantity) } : item
          ),
        }))
      },

      updateItemDiscount: (id, discount) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, discount_amount: Math.max(0, discount) } : item
          ),
        }))
      },

      removeItem: (id) => {
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        }))
      },

      clearCanvas: () => {
        set({ items: [] })
      },

      setCustomer: (customer) => set({ customer }),
      setBranchId: (branchId) => set({ branchId }),
      setDeliveryFee: (fee) => set({ deliveryFee: Math.max(0, fee) }),
      setOtherFees: (fees) => set({ otherFees: Math.max(0, fees) }),
      setOtherFeesNotes: (notes) => set({ otherFeesNotes: notes }),
      setDiscountType: (type) => set({ discountType: type }),
      setDiscountAmount: (amount) => set({ discountAmount: Math.max(0, amount), discountPercentage: 0 }),
      setDiscountPercentage: (percentage) =>
        set({ discountPercentage: Math.max(0, Math.min(100, percentage)), discountAmount: 0 }),
      setNotes: (notes) => set({ notes }),
      setTitle: (title) => set({ title }),

      resetAll: () => set(initialState),

      getSubtotal: () => {
        const { items } = get()
        return items.reduce((sum, item) => sum + round2(item.quantity * item.unit_price), 0)
      },

      getItemsDiscount: () => {
        const { items } = get()
        return items.reduce((sum, item) => sum + item.discount_amount, 0)
      },

      getOrderDiscount: () => {
        const { discountAmount, discountPercentage } = get()
        if (discountAmount > 0) return discountAmount
        if (discountPercentage > 0) {
          const subtotal = get().getSubtotal()
          const itemsDiscount = get().getItemsDiscount()
          return ((subtotal - itemsDiscount) * discountPercentage) / 100
        }
        return 0
      },

      getTotalDiscount: () => {
        return get().getItemsDiscount() + get().getOrderDiscount()
      },

      getTotal: () => {
        const subtotal = get().getSubtotal()
        const totalDiscount = get().getTotalDiscount()
        const { deliveryFee, otherFees } = get()
        return Math.max(0, subtotal - totalDiscount + deliveryFee + otherFees)
      },

      getItemCount: () => {
        const { items } = get()
        return items.reduce((sum, item) => sum + item.quantity, 0)
      },
    }),
    {
      name: 'canvas-store',
      partialize: (state) => ({
        items: state.items,
        customer: state.customer,
        branchId: state.branchId,
        deliveryFee: state.deliveryFee,
        otherFees: state.otherFees,
        otherFeesNotes: state.otherFeesNotes,
        discountAmount: state.discountAmount,
        discountPercentage: state.discountPercentage,
        discountType: state.discountType,
        notes: state.notes,
        title: state.title,
      }),
    }
  )
)
