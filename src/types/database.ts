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

export interface Database {
  public: {
    Tables: {
      branches: {
        Row: {
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
        Insert: Omit<Database['public']['Tables']['branches']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['branches']['Insert']>
      }
      users: {
        Row: {
          id: string
          email: string
          full_name: string
          role: UserRole
          branch_id: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['users']['Insert']>
      }
      product_categories: {
        Row: {
          id: string
          name: string
          description: string | null
          is_active: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['product_categories']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['product_categories']['Insert']>
      }
      product_subcategories: {
        Row: {
          id: string
          category_id: string
          name: string
          description: string | null
          is_active: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['product_subcategories']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['product_subcategories']['Insert']>
      }
      units_of_measure: {
        Row: {
          id: string
          code: string
          name: string
          description: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['units_of_measure']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['units_of_measure']['Insert']>
      }
      products: {
        Row: {
          id: string
          code: string
          name: string
          description: string | null
          category_id: string
          subcategory_id: string | null
          base_uom_id: string
          selling_uom_id: string
          latest_cogs: number
          markup_percentage: number
          current_selling_price: number
          reorder_point: number
          reorder_quantity: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['products']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['products']['Insert']>
      }
      product_variants: {
        Row: {
          id: string
          product_id: string
          name: string
          sku: string | null
          description: string | null
          override_selling_price: number | null
          is_active: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['product_variants']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['product_variants']['Insert']>
      }
      product_images: {
        Row: {
          id: string
          product_id: string
          url: string
          alt_text: string | null
          is_primary: boolean
          sort_order: number
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['product_images']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['product_images']['Insert']>
      }
      unit_conversions: {
        Row: {
          id: string
          product_id: string
          from_uom_id: string
          to_uom_id: string
          conversion_factor: number
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['unit_conversions']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['unit_conversions']['Insert']>
      }
      suppliers: {
        Row: {
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
        Insert: Omit<Database['public']['Tables']['suppliers']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['suppliers']['Insert']>
      }
      customers: {
        Row: {
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
        Insert: Omit<Database['public']['Tables']['customers']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['customers']['Insert']>
      }
      branch_inventory: {
        Row: {
          id: string
          branch_id: string
          product_id: string
          variant_id: string | null
          quantity_on_hand: number
          quantity_reserved: number
          last_movement_at: string | null
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['branch_inventory']['Row'], 'id' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['branch_inventory']['Insert']>
      }
      purchase_orders: {
        Row: {
          id: string
          po_number: string
          branch_id: string
          supplier_id: string
          po_date: string
          expected_delivery_date: string | null
          actual_delivery_date: string | null
          status: POStatus
          total_amount: number
          notes: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['purchase_orders']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['purchase_orders']['Insert']>
      }
      purchase_order_lines: {
        Row: {
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
        Insert: Omit<Database['public']['Tables']['purchase_order_lines']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['purchase_order_lines']['Insert']>
      }
      transactions: {
        Row: {
          id: string
          transaction_number: string
          branch_id: string
          customer_id: string
          transaction_date: string
          transaction_type: 'sale' | 'return'
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
        Insert: Omit<Database['public']['Tables']['transactions']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['transactions']['Insert']>
      }
      transaction_lines: {
        Row: {
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
        Insert: Omit<Database['public']['Tables']['transaction_lines']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['transaction_lines']['Insert']>
      }
      transaction_payments: {
        Row: {
          id: string
          transaction_id: string
          payment_method: PaymentMethod
          amount: number
          reference_number: string | null
          payment_date: string
          notes: string | null
          created_by: string
        }
        Insert: Omit<Database['public']['Tables']['transaction_payments']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['transaction_payments']['Insert']>
      }
      inventory_movements: {
        Row: {
          id: string
          branch_id: string
          product_id: string
          variant_id: string | null
          movement_type: MovementType
          quantity_change: number
          reference_id: string | null
          reference_type: string | null
          notes: string | null
          created_by: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['inventory_movements']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['inventory_movements']['Insert']>
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      user_role: UserRole
      customer_type: CustomerType
      delivery_type: DeliveryType
      payment_method: PaymentMethod
      payment_status: PaymentStatus
      po_status: POStatus
      movement_type: MovementType
    }
  }
}

// Helper types for easier use
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
