import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CartItem {
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
  cogs_per_unit: number
  markup_percentage: number
  discount_amount: number
  available_stock: number
}

export interface Payment {
  id: string
  payment_method: 'cash' | 'gcash' | 'maya' | 'bank_transfer' | 'credit'
  amount: number
  reference_number: string | null
}

export interface Customer {
  id: string
  name: string
  phone: string | null
  customer_type: 'cash' | 'credit' | 'wholesale' | 'retail'
  credit_limit: number
  outstanding_balance: number
}

interface POSState {
  // Cart
  items: CartItem[]
  customer: Customer | null
  branchId: string | null
  deliveryType: 'pickup' | 'delivery'
  deliveryAddress: string
  deliveryPhone: string
  discountAmount: number
  discountPercentage: number
  notes: string

  // Payments
  payments: Payment[]

  // Actions - Cart
  addItem: (item: Omit<CartItem, 'id'>) => void
  updateItemQuantity: (id: string, quantity: number) => void
  updateItemDiscount: (id: string, discount: number) => void
  removeItem: (id: string) => void
  clearCart: () => void

  // Actions - Customer
  setCustomer: (customer: Customer | null) => void
  setBranchId: (branchId: string) => void
  setDeliveryType: (type: 'pickup' | 'delivery') => void
  setDeliveryAddress: (address: string) => void
  setDeliveryPhone: (phone: string) => void
  setDiscountAmount: (amount: number) => void
  setDiscountPercentage: (percentage: number) => void
  setNotes: (notes: string) => void

  // Actions - Payments
  addPayment: (payment: Omit<Payment, 'id'>) => void
  removePayment: (id: string) => void
  clearPayments: () => void

  // Actions - Reset
  resetAll: () => void

  // Computed values
  getSubtotal: () => number
  getItemsDiscount: () => number
  getOrderDiscount: () => number
  getTotalDiscount: () => number
  getTotal: () => number
  getTotalPaid: () => number
  getBalance: () => number
  getItemCount: () => number
  getCreditPaymentTotal: () => number
  getAvailableCredit: () => number
  wouldExceedCreditLimit: (additionalCredit?: number) => boolean
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11)
}

const initialState = {
  items: [] as CartItem[],
  customer: null as Customer | null,
  branchId: null as string | null,
  deliveryType: 'pickup' as const,
  deliveryAddress: '',
  deliveryPhone: '',
  discountAmount: 0,
  discountPercentage: 0,
  notes: '',
  payments: [] as Payment[],
}

export const usePOSStore = create<POSState>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Cart Actions
      addItem: (item) => {
        set((state) => {
          // Check if item already exists (same product and variant)
          const existingIndex = state.items.findIndex(
            (i) => i.product_id === item.product_id && i.variant_id === item.variant_id
          )

          if (existingIndex >= 0) {
            // Update quantity
            const newItems = [...state.items]
            newItems[existingIndex] = {
              ...newItems[existingIndex],
              quantity: newItems[existingIndex].quantity + item.quantity,
            }
            return { items: newItems }
          }

          // Add new item
          return {
            items: [...state.items, { ...item, id: generateId() }],
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

      clearCart: () => {
        set({ items: [] })
      },

      // Customer Actions
      setCustomer: (customer) => {
        set({ customer })
      },

      setBranchId: (branchId) => {
        set({ branchId })
      },

      setDeliveryType: (type) => {
        set({ deliveryType: type })
      },

      setDeliveryAddress: (address) => {
        set({ deliveryAddress: address })
      },

      setDeliveryPhone: (phone) => {
        set({ deliveryPhone: phone })
      },

      setDiscountAmount: (amount) => {
        set({ discountAmount: Math.max(0, amount), discountPercentage: 0 })
      },

      setDiscountPercentage: (percentage) => {
        set({ discountPercentage: Math.max(0, Math.min(100, percentage)), discountAmount: 0 })
      },

      setNotes: (notes) => {
        set({ notes })
      },

      // Payment Actions
      addPayment: (payment) => {
        set((state) => ({
          payments: [...state.payments, { ...payment, id: generateId() }],
        }))
      },

      removePayment: (id) => {
        set((state) => ({
          payments: state.payments.filter((p) => p.id !== id),
        }))
      },

      clearPayments: () => {
        set({ payments: [] })
      },

      // Reset
      resetAll: () => {
        set(initialState)
      },

      // Computed values
      getSubtotal: () => {
        const { items } = get()
        return items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
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
        return Math.max(0, subtotal - totalDiscount)
      },

      getTotalPaid: () => {
        const { payments } = get()
        return payments.reduce((sum, p) => sum + p.amount, 0)
      },

      getBalance: () => {
        return get().getTotal() - get().getTotalPaid()
      },

      getItemCount: () => {
        const { items } = get()
        return items.reduce((sum, item) => sum + item.quantity, 0)
      },

      getCreditPaymentTotal: () => {
        const { payments } = get()
        return payments
          .filter((p) => p.payment_method === 'credit')
          .reduce((sum, p) => sum + p.amount, 0)
      },

      getAvailableCredit: () => {
        const { customer } = get()
        if (!customer) return 0
        return Math.max(0, customer.credit_limit - customer.outstanding_balance)
      },

      wouldExceedCreditLimit: (additionalCredit = 0) => {
        const { customer } = get()
        if (!customer) return false

        const currentCreditPayments = get().getCreditPaymentTotal()
        const totalCreditUsage = customer.outstanding_balance + currentCreditPayments + additionalCredit

        return totalCreditUsage > customer.credit_limit
      },
    }),
    {
      name: 'pos-store',
      partialize: (state) => ({
        items: state.items,
        customer: state.customer,
        branchId: state.branchId,
        deliveryType: state.deliveryType,
        deliveryAddress: state.deliveryAddress,
        deliveryPhone: state.deliveryPhone,
        discountAmount: state.discountAmount,
        discountPercentage: state.discountPercentage,
        notes: state.notes,
        payments: state.payments,
      }),
    }
  )
)
