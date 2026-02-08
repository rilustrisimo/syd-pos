import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Cart, CartItem } from '@/types'

interface CartState extends Cart {
  // Actions
  addItem: (item: Omit<CartItem, 'id' | 'lineTotal'>) => void
  updateItemQuantity: (id: string, quantity: number) => void
  removeItem: (id: string) => void
  clearCart: () => void
  setCustomer: (customerId: string, customerName: string) => void
  setDeliveryType: (type: 'pickup' | 'delivery') => void
  setDeliveryInfo: (address: string, phone: string) => void
  setDiscount: (amount: number, percentage: number) => void
  calculateTotals: () => void
}

const initialState: Cart = {
  items: [],
  customerId: null,
  customerName: null,
  deliveryType: 'pickup',
  deliveryAddress: null,
  deliveryPhone: null,
  subtotal: 0,
  discountAmount: 0,
  discountPercentage: 0,
  taxAmount: 0,
  total: 0,
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      ...initialState,

      addItem: (item) => {
        const id = `${item.productId}-${item.variantId || 'default'}`
        const existingItem = get().items.find((i) => i.id === id)

        if (existingItem) {
          // Update quantity if item exists
          set((state) => ({
            items: state.items.map((i) =>
              i.id === id
                ? {
                    ...i,
                    quantity: i.quantity + item.quantity,
                    lineTotal: (i.quantity + item.quantity) * i.unitPrice - i.discountAmount,
                  }
                : i
            ),
          }))
        } else {
          // Add new item
          const newItem: CartItem = {
            ...item,
            id,
            lineTotal: item.quantity * item.unitPrice - (item.discountAmount || 0),
          }
          set((state) => ({ items: [...state.items, newItem] }))
        }

        get().calculateTotals()
      },

      updateItemQuantity: (id, quantity) => {
        if (quantity <= 0) {
          get().removeItem(id)
          return
        }

        set((state) => ({
          items: state.items.map((i) =>
            i.id === id
              ? { ...i, quantity, lineTotal: quantity * i.unitPrice - i.discountAmount }
              : i
          ),
        }))
        get().calculateTotals()
      },

      removeItem: (id) => {
        set((state) => ({
          items: state.items.filter((i) => i.id !== id),
        }))
        get().calculateTotals()
      },

      clearCart: () => {
        set(initialState)
      },

      setCustomer: (customerId, customerName) => {
        set({ customerId, customerName })
      },

      setDeliveryType: (deliveryType) => {
        set({
          deliveryType,
          // Clear delivery info if switching to pickup
          ...(deliveryType === 'pickup' && {
            deliveryAddress: null,
            deliveryPhone: null,
          }),
        })
      },

      setDeliveryInfo: (deliveryAddress, deliveryPhone) => {
        set({ deliveryAddress, deliveryPhone })
      },

      setDiscount: (discountAmount, discountPercentage) => {
        set({ discountAmount, discountPercentage })
        get().calculateTotals()
      },

      calculateTotals: () => {
        const { items, discountPercentage } = get()

        const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0)
        const discountAmount = discountPercentage > 0
          ? subtotal * (discountPercentage / 100)
          : get().discountAmount
        const taxableAmount = subtotal - discountAmount
        const taxAmount = 0 // No tax for now, can be configured later
        const total = taxableAmount + taxAmount

        set({
          subtotal,
          discountAmount,
          taxAmount,
          total: Math.max(0, total),
        })
      },
    }),
    {
      name: 'syd-pos-cart',
      partialize: (state) => ({
        items: state.items,
        customerId: state.customerId,
        customerName: state.customerName,
        deliveryType: state.deliveryType,
        deliveryAddress: state.deliveryAddress,
        deliveryPhone: state.deliveryPhone,
        discountAmount: state.discountAmount,
        discountPercentage: state.discountPercentage,
      }),
    }
  )
)
