// Database types - will be auto-generated from Supabase later
// For now, define the core types manually

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole = 'admin' | 'manager' | 'cashier' | 'inventory_staff' | 'accountant'
export type CustomerType = 'cash' | 'credit' | 'wholesale' | 'retail'
export type DeliveryType = 'pickup' | 'delivery'
export type PaymentMethod = 'cash' | 'gcash' | 'maya' | 'bank_transfer' | 'credit'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid'
export type POStatus = 'draft' | 'sent' | 'confirmed' | 'partially_received' | 'received' | 'cancelled'
export type MovementType = 'purchase' | 'sale' | 'adjustment' | 'return' | 'transfer'
export type TransactionType = 'sale' | 'return'

// Row types (what you get from the database)
export interface BranchRow {
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

export interface UserRow {
  id: string
  email: string
  full_name: string
  role: UserRole
  branch_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ProductCategoryRow {
  id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
}

export interface ProductSubcategoryRow {
  id: string
  category_id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
}

export interface UnitOfMeasureRow {
  id: string
  code: string
  name: string
  description: string | null
  created_at: string
}

export interface ProductRow {
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
}

export interface ProductVariantRow {
  id: string
  product_id: string
  name: string
  sku: string | null
  description: string | null
  override_selling_price: number | null
  is_active: boolean
  created_at: string
}

export interface ProductImageRow {
  id: string
  product_id: string
  url: string
  alt_text: string | null
  is_primary: boolean
  sort_order: number
  created_at: string
}

export interface UnitConversionRow {
  id: string
  product_id: string
  from_uom_id: string
  to_uom_id: string
  conversion_factor: number
  created_at: string
}

export interface SupplierRow {
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

export interface CustomerRow {
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

export interface BranchInventoryRow {
  id: string
  branch_id: string
  product_id: string
  variant_id: string | null
  quantity_on_hand: number
  quantity_reserved: number
  last_movement_at: string | null
  updated_at: string
}

export interface PurchaseOrderRow {
  id: string
  po_number: string
  branch_id: string
  supplier_id: string
  po_date: string
  expected_delivery_date: string | null
  actual_delivery_date: string | null
  status: POStatus
  delivery_charge: number
  total_amount: number
  notes: string | null
  is_deleted: boolean
  deleted_at: string | null
  deleted_by: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface PurchaseOrderLineRow {
  id: string
  po_id: string
  line_number: number
  product_id: string
  variant_id: string | null
  quantity_ordered: number
  quantity_received: number
  uom_id: string
  unit_cost: number
  notes: string | null
}

export interface TransactionRow {
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
}

export interface TransactionLineRow {
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
}

export interface TransactionPaymentRow {
  id: string
  transaction_id: string
  payment_method: PaymentMethod
  amount: number
  reference_number: string | null
  payment_date: string
  notes: string | null
  created_by: string
}

export interface InventoryMovementRow {
  id: string
  branch_id: string
  product_id: string
  variant_id: string | null
  movement_type: MovementType
  quantity_change: number
  quantity_before: number
  quantity_after: number
  reference_id: string | null
  reference_type: string | null
  notes: string | null
  created_by: string
  created_at: string
}

// Database interface for Supabase
export interface Database {
  public: {
    Tables: {
      branches: {
        Row: BranchRow
        Insert: Omit<BranchRow, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }
        Update: Partial<Omit<BranchRow, 'id' | 'created_at' | 'updated_at'>>
      }
      users: {
        Row: UserRow
        Insert: Omit<UserRow, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }
        Update: Partial<Omit<UserRow, 'id' | 'created_at' | 'updated_at'>>
      }
      product_categories: {
        Row: ProductCategoryRow
        Insert: Omit<ProductCategoryRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<ProductCategoryRow, 'id' | 'created_at'>>
      }
      product_subcategories: {
        Row: ProductSubcategoryRow
        Insert: Omit<ProductSubcategoryRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<ProductSubcategoryRow, 'id' | 'created_at'>>
      }
      units_of_measure: {
        Row: UnitOfMeasureRow
        Insert: Omit<UnitOfMeasureRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<UnitOfMeasureRow, 'id' | 'created_at'>>
      }
      products: {
        Row: ProductRow
        Insert: Omit<ProductRow, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }
        Update: Partial<Omit<ProductRow, 'id' | 'created_at' | 'updated_at'>>
      }
      product_variants: {
        Row: ProductVariantRow
        Insert: Omit<ProductVariantRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<ProductVariantRow, 'id' | 'created_at'>>
      }
      product_images: {
        Row: ProductImageRow
        Insert: Omit<ProductImageRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<ProductImageRow, 'id' | 'created_at'>>
      }
      unit_conversions: {
        Row: UnitConversionRow
        Insert: Omit<UnitConversionRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<UnitConversionRow, 'id' | 'created_at'>>
      }
      suppliers: {
        Row: SupplierRow
        Insert: Omit<SupplierRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<SupplierRow, 'id' | 'created_at'>>
      }
      customers: {
        Row: CustomerRow
        Insert: Omit<CustomerRow, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }
        Update: Partial<Omit<CustomerRow, 'id' | 'created_at' | 'updated_at'>>
      }
      branch_inventory: {
        Row: BranchInventoryRow
        Insert: Omit<BranchInventoryRow, 'id' | 'updated_at'> & { id?: string; updated_at?: string }
        Update: Partial<Omit<BranchInventoryRow, 'id' | 'updated_at'>>
      }
      purchase_orders: {
        Row: PurchaseOrderRow
        Insert: Omit<PurchaseOrderRow, 'id' | 'created_at' | 'updated_at' | 'is_deleted' | 'deleted_at' | 'deleted_by'> & { id?: string; created_at?: string; updated_at?: string; is_deleted?: boolean; deleted_at?: string | null; deleted_by?: string | null }
        Update: Partial<Omit<PurchaseOrderRow, 'id' | 'created_at' | 'updated_at'>>
      }
      purchase_order_lines: {
        Row: PurchaseOrderLineRow
        Insert: Omit<PurchaseOrderLineRow, 'id'> & { id?: string }
        Update: Partial<Omit<PurchaseOrderLineRow, 'id'>>
      }
      transactions: {
        Row: TransactionRow
        Insert: Omit<TransactionRow, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }
        Update: Partial<Omit<TransactionRow, 'id' | 'created_at' | 'updated_at'>>
      }
      transaction_lines: {
        Row: TransactionLineRow
        Insert: Omit<TransactionLineRow, 'id'> & { id?: string }
        Update: Partial<Omit<TransactionLineRow, 'id'>>
      }
      transaction_payments: {
        Row: TransactionPaymentRow
        Insert: Omit<TransactionPaymentRow, 'id'> & { id?: string }
        Update: Partial<Omit<TransactionPaymentRow, 'id'>>
      }
      inventory_movements: {
        Row: InventoryMovementRow
        Insert: Omit<InventoryMovementRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<InventoryMovementRow, 'id' | 'created_at'>>
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_po_number: {
        Args: Record<string, never>
        Returns: string
      }
      generate_transaction_number: {
        Args: Record<string, never>
        Returns: string
      }
    }
    Enums: {
      user_role: UserRole
      customer_type: CustomerType
      delivery_type: DeliveryType
      payment_method: PaymentMethod
      payment_status: PaymentStatus
      po_status: POStatus
      movement_type: MovementType
      transaction_type: TransactionType
    }
  }
}

// Helper types for easier use
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
