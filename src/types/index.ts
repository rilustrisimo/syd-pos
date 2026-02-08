// Re-export database types
export * from './database'

// Cart types for POS
export interface CartItem {
  id: string
  productId: string
  variantId?: string
  productName: string
  variantName?: string
  quantity: number
  unitPrice: number
  cogsPerUnit: number
  uomId: string
  uomName: string
  lineTotal: number
  discountAmount: number
  imageUrl?: string
}

export interface Cart {
  items: CartItem[]
  customerId: string | null
  customerName: string | null
  deliveryType: 'pickup' | 'delivery'
  deliveryAddress: string | null
  deliveryPhone: string | null
  subtotal: number
  discountAmount: number
  discountPercentage: number
  taxAmount: number
  total: number
}

// Search/filter types
export interface ProductSearchParams {
  query?: string
  categoryId?: string
  subcategoryId?: string
  page?: number
  limit?: number
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}
