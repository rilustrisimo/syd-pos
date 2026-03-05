import { create } from 'zustand'

export type CartItem = {
  productId: string
  name: string
  quantity: number
  price: number
  cogs_per_unit: number  // cost of goods sold per unit (for markup/at-cost discounts)
  discount: number       // per-unit discount amount (default 0)
  uom_name?: string      // unit of measure display name (e.g. 'bag', 'pc', 'kg')
}

type PosState = {
  cart: CartItem[]
  addItem: (item: CartItem) => void
  updateQuantity: (productId: string, quantity: number) => void
  updateDiscount: (productId: string, discount: number) => void
  incrementItem: (productId: string) => void
  decrementItem: (productId: string) => void
  removeItem: (productId: string) => void
  clearCart: () => void
}

export const usePosStore = create<PosState>((set) => ({
  cart: [],

  addItem: (item) =>
    set((state) => {
      const existing = state.cart.find((c) => c.productId === item.productId)
      if (existing) {
        return {
          cart: state.cart.map((c) =>
            c.productId === item.productId
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
        .map((c) =>
          c.productId === productId ? { ...c, quantity: Math.max(0, c.quantity - 1) } : c
        )
        .filter((c) => c.quantity > 0),
    })),

  removeItem: (productId) =>
    set((state) => ({ cart: state.cart.filter((c) => c.productId !== productId) })),

  clearCart: () => set({ cart: [] }),
}))
