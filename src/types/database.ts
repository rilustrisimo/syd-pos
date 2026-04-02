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
export type MovementType = 'purchase' | 'sale' | 'adjustment' | 'return' | 'transfer' | 'damaged_return'
export type TransactionType = 'sale' | 'return'
export type ReturnReason = 'customer_request' | 'wrong_item' | 'defective' | 'damaged' | 'expired' | 'quality_issue' | 'other'
export type LiabilityPayableStatus = 'unpaid' | 'partial' | 'paid' | 'overdue'
export type LoanStatus = 'active' | 'completed' | 'defaulted'
export type InstallmentStatus = 'upcoming' | 'paid' | 'partial' | 'overdue'

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

export interface ProductSellingUnitRow {
  id: string
  product_id: string
  uom_id: string
  conversion_factor: number
  markup_percentage: number
  selling_price: number
  is_primary: boolean
  is_active: boolean
  created_at: string
  updated_at: string
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
  should_restock: boolean | null
  return_reason: ReturnReason | null
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

export interface ExpenseCategoryRow {
  id: string
  name: string
  description: string | null
  color: string
  is_active: boolean
  is_system: boolean
  created_at: string
  updated_at: string
}

export interface ExpenseRow {
  id: string
  expense_number: string
  branch_id: string
  category_id: string | null
  amount: number
  expense_date: string
  description: string | null
  notes: string | null
  reference_number: string | null
  paid_to: string | null
  is_deleted: boolean
  deleted_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

// ── Liability Payables ────────────────────────────────────────────────────────

export interface LiabilityPayableRow {
  id: string
  payable_number: string
  branch_id: string
  supplier_id: string
  description: string | null
  invoice_reference: string | null
  total_amount: number
  paid_amount: number
  invoice_date: string
  credit_days: number
  due_date: string
  status: LiabilityPayableStatus
  notes: string | null
  is_deleted: boolean
  deleted_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface LiabilityPayablePOLinkRow {
  id: string
  payable_id: string
  po_id: string
  amount: number | null
  notes: string | null
  created_at: string
}

export interface LiabilityPayablePaymentRow {
  id: string
  payable_id: string
  amount: number
  payment_date: string
  payment_method: PaymentMethod
  reference_number: string | null
  notes: string | null
  created_by: string
  created_at: string
}

// ── Liability Loans ───────────────────────────────────────────────────────────

export interface LiabilityLoanRow {
  id: string
  loan_number: string
  branch_id: string
  lender_name: string
  principal_amount: number
  interest_rate_monthly: number
  rate_type: 'flat_rate' | 'diminishing' | 'interest_only'
  term_months: number
  start_date: string
  monthly_payment: number
  total_interest: number
  total_payable: number
  outstanding_balance: number
  status: LoanStatus
  notes: string | null
  loan_reference: string | null
  is_deleted: boolean
  deleted_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface LiabilityLoanScheduleRow {
  id: string
  loan_id: string
  installment_number: number
  due_date: string
  principal_portion: number
  interest_portion: number
  scheduled_amount: number
  balance_before: number
  balance_after: number
  paid_amount: number
  paid_date: string | null
  payment_reference: string | null
  status: InstallmentStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export interface LiabilityLoanPaymentRow {
  id: string
  loan_id: string
  schedule_id: string | null
  amount: number
  payment_date: string
  payment_method: PaymentMethod
  reference_number: string | null
  notes: string | null
  created_by: string
  created_at: string
}

// ── Notifications ─────────────────────────────────────────────────────────────

export interface NotificationRow {
  id: string
  type: string
  title: string
  message: string
  entity_type: string | null
  entity_id: string | null
  target_roles: string[]
  branch_id: string | null
  metadata: Record<string, unknown> | null
  is_read: boolean
  read_at: string | null
  created_at: string
}

export interface NotificationSettingsRow {
  id: string
  branch_id: string | null
  entity_type: string
  reminder_days: number[]
  email_enabled: boolean
  in_app_enabled: boolean
  updated_at: string
}

// ── Tax Module ─────────────────────────────────────────────────────────────────

export type TaxRegime = '8_flat' | 'graduated_osd' | 'graduated_itemized' | 'comparison'
export type TaxType = '2551q' | '1701q' | '1701a' | '0605' | 'lbt' | 'mayors_permit' | 'barangay_clearance'

export interface TaxSettingsRow {
  id: string
  branch_id: string
  bir_tin: string | null
  tax_regime: TaxRegime
  lbt_rate: number
  mayors_permit_amount: number
  barangay_clearance_amount: number
  bir_registration_amount: number
  notify_days_before: number[]
  created_at: string
  updated_at: string
}

export interface TaxPaymentRow {
  id: string
  branch_id: string
  payment_number: string
  tax_type: TaxType
  period_year: number
  period_quarter: number | null
  amount_due: number
  amount_paid: number
  payment_date: string
  reference_number: string | null
  notes: string | null
  is_deleted: boolean
  deleted_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
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
      expense_categories: {
        Row: ExpenseCategoryRow
        Insert: Omit<ExpenseCategoryRow, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }
        Update: Partial<Omit<ExpenseCategoryRow, 'id' | 'created_at' | 'updated_at'>>
      }
      expenses: {
        Row: ExpenseRow
        Insert: Omit<ExpenseRow, 'id' | 'created_at' | 'updated_at' | 'is_deleted' | 'deleted_at'> & { id?: string; created_at?: string; updated_at?: string; is_deleted?: boolean; deleted_at?: string | null }
        Update: Partial<Omit<ExpenseRow, 'id' | 'created_at' | 'updated_at'>>
      }
      liability_payables: {
        Row: LiabilityPayableRow
        Insert: Omit<LiabilityPayableRow, 'id' | 'created_at' | 'updated_at' | 'is_deleted' | 'deleted_at' | 'paid_amount' | 'status'> & { id?: string; created_at?: string; updated_at?: string; is_deleted?: boolean; deleted_at?: string | null; paid_amount?: number; status?: LiabilityPayableStatus }
        Update: Partial<Omit<LiabilityPayableRow, 'id' | 'created_at' | 'updated_at'>>
      }
      liability_payable_po_links: {
        Row: LiabilityPayablePOLinkRow
        Insert: Omit<LiabilityPayablePOLinkRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<LiabilityPayablePOLinkRow, 'id' | 'created_at'>>
      }
      liability_payable_payments: {
        Row: LiabilityPayablePaymentRow
        Insert: Omit<LiabilityPayablePaymentRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<LiabilityPayablePaymentRow, 'id' | 'created_at'>>
      }
      liability_loans: {
        Row: LiabilityLoanRow
        Insert: Omit<LiabilityLoanRow, 'id' | 'created_at' | 'updated_at' | 'is_deleted' | 'deleted_at'> & { id?: string; created_at?: string; updated_at?: string; is_deleted?: boolean; deleted_at?: string | null }
        Update: Partial<Omit<LiabilityLoanRow, 'id' | 'created_at' | 'updated_at'>>
      }
      liability_loan_schedule: {
        Row: LiabilityLoanScheduleRow
        Insert: Omit<LiabilityLoanScheduleRow, 'id' | 'created_at' | 'updated_at' | 'paid_amount' | 'status' | 'paid_date'> & { id?: string; created_at?: string; updated_at?: string; paid_amount?: number; status?: InstallmentStatus; paid_date?: string | null }
        Update: Partial<Omit<LiabilityLoanScheduleRow, 'id' | 'created_at' | 'updated_at'>>
      }
      liability_loan_payments: {
        Row: LiabilityLoanPaymentRow
        Insert: Omit<LiabilityLoanPaymentRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<LiabilityLoanPaymentRow, 'id' | 'created_at'>>
      }
      notifications: {
        Row: NotificationRow
        Insert: Omit<NotificationRow, 'id' | 'created_at' | 'is_read' | 'read_at'> & { id?: string; created_at?: string; is_read?: boolean; read_at?: string | null }
        Update: Partial<Omit<NotificationRow, 'id' | 'created_at'>>
      }
      notification_settings: {
        Row: NotificationSettingsRow
        Insert: Omit<NotificationSettingsRow, 'id' | 'updated_at'> & { id?: string; updated_at?: string }
        Update: Partial<Omit<NotificationSettingsRow, 'id' | 'updated_at'>>
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
      generate_expense_number: {
        Args: Record<string, never>
        Returns: string
      }
      generate_payable_number: {
        Args: Record<string, never>
        Returns: string
      }
      generate_loan_number: {
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
      return_reason: ReturnReason
      liability_payable_status: LiabilityPayableStatus
      loan_status: LoanStatus
      installment_status: InstallmentStatus
    }
  }
}

// Helper types for easier use
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
