// ============================================================================
// Core Enums and Literal Types
// ============================================================================

export type UserRole = 'admin' | 'manager' | 'cashier' | 'inventory_staff' | 'accountant'
export type CustomerType = 'cash' | 'credit' | 'wholesale' | 'retail'
export type DeliveryType = 'pickup' | 'delivery'
export type PaymentMethod = 'cash' | 'gcash' | 'maya' | 'bank_transfer' | 'credit'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid'
export type POStatus = 'draft' | 'sent' | 'confirmed' | 'partially_received' | 'received' | 'cancelled'
export type MovementType = 'purchase' | 'sale' | 'adjustment' | 'return' | 'transfer'
export type TransactionType = 'sale' | 'return'

// ============================================================================
// Database Row Types
// ============================================================================

export interface Branch {
  id: string
  code: string
  name: string
  address: string | null
  phone: string | null
  email: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface User {
  id: string
  email: string
  full_name: string
  role: UserRole
  branch_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface UnitOfMeasure {
  id: string
  code: string
  name: string
  description: string | null
  created_at: string
}

export interface ProductCategory {
  id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
}

export interface ProductSubcategory {
  id: string
  category_id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
}

export interface ProductVariant {
  id: string
  product_id: string
  name: string
  sku: string | null
  description: string | null
  override_selling_price: number | null
  is_active: boolean
  created_at: string
}

export interface ProductImage {
  id: string
  product_id: string
  url: string
  alt_text: string | null
  is_primary: boolean
  sort_order: number
}

export interface Product {
  id: string
  code: string
  name: string
  description: string | null
  category_id: string
  subcategory_id: string | null
  base_uom_id: string
  selling_uom_id: string
  conversion_factor: number
  base_unit_cost: number
  latest_cogs: number
  markup_percentage: number
  current_selling_price: number
  reorder_point: number
  reorder_quantity: number
  is_active: boolean
  created_at: string
  updated_at: string
  // Joined data
  category?: ProductCategory
  uom?: UnitOfMeasure
  variants?: ProductVariant[]
  images?: ProductImage[]
}

export interface Supplier {
  id: string
  code: string
  name: string
  contact_person: string | null
  phone: string | null
  email: string | null
  address: string | null
  payment_terms: string | null
  is_active: boolean
  created_at: string
}

export interface Customer {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  customer_type: CustomerType
  credit_limit: number
  outstanding_balance: number
  payment_terms: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Inventory {
  id: string
  branch_id: string
  product_id: string
  variant_id: string | null
  quantity_on_hand: number
  quantity_reserved: number
  last_movement_at: string | null
  updated_at: string
  // Joined data
  product?: Product
}

export interface TransactionPayment {
  id: string
  transaction_id: string
  payment_method: PaymentMethod
  amount: number
  reference_number: string | null
  payment_date: string
  notes: string | null
  created_by: string
}

export interface TransactionLine {
  id: string
  transaction_id: string
  line_number: number
  product_id: string
  variant_id: string | null
  quantity: number
  uom_id: string
  unit_price: number
  cogs_per_unit: number
  discount_amount: number
  line_total: number
  notes: string | null
  // Joined data
  product?: Product
  uom?: UnitOfMeasure
}

export interface Transaction {
  id: string
  transaction_number: string
  branch_id: string
  customer_id: string
  transaction_date: string
  transaction_type: TransactionType
  delivery_type: DeliveryType
  delivery_address: string | null
  delivery_phone: string | null
  subtotal: number
  discount_amount: number
  discount_percentage: number
  tax_amount: number
  total_amount: number
  payment_status: PaymentStatus
  amount_paid: number
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
  // Joined data
  customer?: Customer
  branch?: Branch
  lines?: TransactionLine[]
  payments?: TransactionPayment[]
}

// ============================================================================
// Input/Mutation Types
// ============================================================================

export interface CreateTransactionInput {
  branch_id: string
  customer_id: string
  transaction_type: TransactionType
  delivery_type: DeliveryType
  delivery_address?: string | null
  delivery_phone?: string | null
  notes?: string | null
}

export interface TransactionLineInput {
  product_id: string
  variant_id?: string | null
  quantity: number
  uom_id: string
  unit_price: number
  cogs_per_unit: number
  discount_amount?: number
}

export interface TransactionPaymentInput {
  payment_method: PaymentMethod
  amount: number
  reference_number?: string | null
}

export interface CreateTransactionPayload {
  input: CreateTransactionInput
  lines: TransactionLineInput[]
  payments: TransactionPaymentInput[]
  userId: string
}

// ============================================================================
// Return/Refund Types
// ============================================================================

export type ReturnReasonCode = 'defective' | 'wrong_item' | 'customer_changed_mind' | 'damaged' | 'other'

export interface ReturnLine {
  original_line_id: string
  product_id: string
  variant_id?: string | null
  quantity: number
  uom_id: string
  unit_price: number
  cogs_per_unit: number
  restock: boolean
  reason_code: ReturnReasonCode
}

export interface ReturnRefund {
  refund_method: PaymentMethod
  amount: number
  reference_number?: string | null
  notes: string | null
}

export interface CreateReturnPayload {
  input: {
    original_transaction_id: string
    branch_id: string
    customer_id: string
    reason: string
    notes?: string | null
  }
  lines: ReturnLine[]
  refund: ReturnRefund
  userId: string
}

// ============================================================================
// Query Response Types
// ============================================================================

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface AuthUser {
  id: string
  email: string
  full_name: string
  role: UserRole
  branch_id: string | null
  is_active: boolean
}

// ============================================================================
// Offline Queue Types
// ============================================================================

export interface QueuedTransaction {
  id: string
  status: 'pending' | 'synced'
  transaction_data: CreateTransactionPayload
  created_at: number
  synced_at?: number
  server_id?: string
  error?: string
}

export interface CachedInventory {
  products: Product[]
  cached_at: number
  is_stale: boolean
}

// ============================================================================
// Error Types
// ============================================================================

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface ErrorResponse {
  error: string
  code: string
  details?: any
}
