import { create } from 'zustand'

export type CanvasItem = {
  productId: string
  name: string
  quantity: number
  price: number           // unit_price
  cogs_per_unit: number  // stored so Convert-to-Sale can populate POS cart correctly
  discount: number        // per-unit discount amount (default 0)
  uom_id: string
  uom_name: string        // display name (e.g. 'bag', 'pc', 'kg')
}

export type CanvasDiscountType = 'none' | 'fixed' | 'percentage' | 'standard' | 'cost'

type CanvasState = {
  // Items
  cart: CanvasItem[]

  // Order-level fields
  title: string
  customerName: string   // free-text — customer lookup is optional on mobile
  customerId: string | null
  deliveryFee: number
  otherFees: number
  otherFeesNotes: string
  discountAmount: number
  discountPercentage: number
  discountType: CanvasDiscountType
  notes: string

  // Item actions
  addItem: (item: CanvasItem) => void
  updateQuantity: (productId: string, quantity: number) => void
  updateDiscount: (productId: string, discount: number) => void
  incrementItem: (productId: string) => void
  decrementItem: (productId: string) => void
  removeItem: (productId: string) => void
  clearCart: () => void

  // Order-level actions
  setTitle: (title: string) => void
  setCustomerName: (name: string) => void
  setCustomerId: (id: string | null) => void
  setDeliveryFee: (fee: number) => void
  setOtherFees: (fees: number) => void
  setOtherFeesNotes: (notes: string) => void
  setDiscountAmount: (amount: number) => void
  setDiscountPercentage: (pct: number) => void
  setDiscountType: (type: CanvasDiscountType) => void
  setNotes: (notes: string) => void

  resetAll: () => void
}

const initialState = {
  cart: [] as CanvasItem[],
  title: '',
  customerName: '',
  customerId: null as string | null,
  deliveryFee: 0,
  otherFees: 0,
  otherFeesNotes: '',
  discountAmount: 0,
  discountPercentage: 0,
  discountType: 'none' as CanvasDiscountType,
  notes: '',
}

export const useCanvasStore = create<CanvasState>((set) => ({
  ...initialState,

  addItem: (item) =>
    set((state) => {
      const existing = state.cart.find((c) => c.productId === item.productId && c.uom_id === item.uom_id)
      if (existing) {
        return {
          cart: state.cart.map((c) =>
            c.productId === item.productId && c.uom_id === item.uom_id
              ? { ...c, quantity: c.quantity + item.quantity }
              : c
          ),
        }
      }
      return { cart: [...state.cart, { ...item, discount: item.discount ?? 0 }] }
    }),

  updateQuantity: (productId, quantity) =>
    set((state) => {
      if (quantity <= 0) {
        return { cart: state.cart.filter((c) => c.productId !== productId) }
      }
      return {
        cart: state.cart.map((c) =>
          c.productId === productId ? { ...c, quantity } : c
        ),
      }
    }),

  updateDiscount: (productId, discount) =>
    set((state) => ({
      cart: state.cart.map((c) =>
        c.productId === productId ? { ...c, discount: Math.max(0, discount) } : c
      ),
    })),

  incrementItem: (productId) =>
    set((state) => ({
      cart: state.cart.map((c) =>
        c.productId === productId ? { ...c, quantity: c.quantity + 1 } : c
      ),
    })),

  decrementItem: (productId) =>
    set((state) => ({
      cart: state.cart
        .map((c) => (c.productId === productId ? { ...c, quantity: Math.max(0, c.quantity - 1) } : c))
        .filter((c) => c.quantity > 0),
    })),

  removeItem: (productId) =>
    set((state) => ({ cart: state.cart.filter((c) => c.productId !== productId) })),

  clearCart: () => set({ cart: [] }),

  setTitle: (title) => set({ title }),
  setCustomerName: (name) => set({ customerName: name }),
  setCustomerId: (id) => set({ customerId: id }),
  setDeliveryFee: (fee) => set({ deliveryFee: Math.max(0, fee) }),
  setOtherFees: (fees) => set({ otherFees: Math.max(0, fees) }),
  setOtherFeesNotes: (notes) => set({ otherFeesNotes: notes }),
  setDiscountAmount: (amount) => set({ discountAmount: Math.max(0, amount), discountPercentage: 0 }),
  setDiscountPercentage: (pct) => set({ discountPercentage: Math.max(0, Math.min(100, pct)), discountAmount: 0 }),
  setDiscountType: (type) => set({ discountType: type }),
  setNotes: (notes) => set({ notes }),

  resetAll: () => set(initialState),
}))
