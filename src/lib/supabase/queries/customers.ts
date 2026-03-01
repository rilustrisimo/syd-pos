import { createClient } from '../client'

export interface Customer {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  customer_type: 'cash' | 'credit' | 'wholesale' | 'retail'
  credit_limit: number
  outstanding_balance: number
  payment_terms: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CustomerInput {
  name: string
  phone?: string | null
  email?: string | null
  address?: string | null
  customer_type?: 'cash' | 'credit' | 'wholesale' | 'retail'
  credit_limit?: number
  payment_terms?: number | null
  is_active?: boolean
}

export interface CustomerFilters {
  search?: string
  customer_type?: string
  is_active?: boolean
  page?: number
  limit?: number
}

// Get customers with filters and pagination
export async function getCustomers(filters: CustomerFilters = {}) {
  const supabase = createClient()
  const { search, customer_type, is_active = true, page = 1, limit = 20 } = filters
  const offset = (page - 1) * limit

  let query = supabase
    .from('customers')
    .select('*', { count: 'exact' })

  // Apply filters
  if (is_active !== undefined) {
    query = query.eq('is_active', is_active)
  }

  if (customer_type) {
    query = query.eq('customer_type', customer_type)
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`)
  }

  // Apply pagination and ordering
  query = query
    .order('name', { ascending: true })
    .range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) throw error

  return {
    customers: data as Customer[],
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit)
  }
}

// Get a single customer by ID
export async function getCustomer(id: string) {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('customers')
    .select('id, name, phone, email, address, customer_type, credit_limit, outstanding_balance, payment_terms, is_active, created_at, updated_at')
    .eq('id', id)
    .single()

  if (error) throw error

  return data as Customer
}

// Search customers (for autocomplete/quick search)
export async function searchCustomers(query: string, limit = 10) {
  const supabase = createClient()

  let dbQuery = supabase
    .from('customers')
    .select('id, name, phone, customer_type, outstanding_balance, credit_limit')
    .eq('is_active', true)

  // If query is provided, search by name or phone
  if (query && query.trim().length > 0) {
    dbQuery = dbQuery.or(`name.ilike.%${query}%,phone.ilike.%${query}%`)
  }

  // Order by name for empty queries (recent customers), or by relevance for search
  const { data, error } = await dbQuery
    .order('name')
    .limit(limit)

  if (error) throw error

  return data as Pick<Customer, 'id' | 'name' | 'phone' | 'customer_type' | 'outstanding_balance' | 'credit_limit'>[]
}

// Get the default walk-in customer
export async function getWalkInCustomer() {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('customers')
    .select('id, name, phone, email, address, customer_type, credit_limit, outstanding_balance, payment_terms, is_active, created_at, updated_at')
    .eq('name', 'Walk-in Customer')
    .eq('is_active', true)
    .single()

  if (error) throw error

  return data as Customer
}

// Create a new customer
export async function createCustomer(input: CustomerInput) {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('customers')
    .insert({
      name: input.name,
      phone: input.phone || null,
      email: input.email || null,
      address: input.address || null,
      customer_type: input.customer_type || 'cash',
      credit_limit: input.credit_limit || 0,
      payment_terms: input.payment_terms || null,
      is_active: input.is_active ?? true
    } as any)
    .select()
    .single()

  if (error) throw error

  return data as Customer
}

// Update a customer
export async function updateCustomer(id: string, input: Partial<CustomerInput>) {
  const supabase = createClient()

  const updateData: Record<string, any> = {}

  if (input.name !== undefined) updateData.name = input.name
  if (input.phone !== undefined) updateData.phone = input.phone
  if (input.email !== undefined) updateData.email = input.email
  if (input.address !== undefined) updateData.address = input.address
  if (input.customer_type !== undefined) updateData.customer_type = input.customer_type
  if (input.credit_limit !== undefined) updateData.credit_limit = input.credit_limit
  if (input.payment_terms !== undefined) updateData.payment_terms = input.payment_terms
  if (input.is_active !== undefined) updateData.is_active = input.is_active

  const { data, error } = await supabase
    .from('customers')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error

  return data as Customer
}

// Update customer outstanding balance
export async function updateCustomerBalance(id: string, amountChange: number) {
  const supabase = createClient()

  // Get current balance
  const { data: customer, error: fetchError } = await supabase
    .from('customers')
    .select('outstanding_balance')
    .eq('id', id)
    .single()

  if (fetchError) throw fetchError

  const currentBalance = (customer as any).outstanding_balance || 0
  const newBalance = currentBalance + amountChange

  const { data, error } = await supabase
    .from('customers')
    .update({ outstanding_balance: newBalance } as any)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error

  return data as Customer
}

// Delete (deactivate) a customer
export async function deleteCustomer(id: string) {
  const supabase = createClient()

  // Soft delete by setting is_active to false
  const { error } = await supabase
    .from('customers')
    .update({ is_active: false } as any)
    .eq('id', id)

  if (error) throw error

  return true
}

// Get customer statistics
export async function getCustomerStats() {
  const supabase = createClient()

  const { data: allCustomers, error: allError } = await supabase
    .from('customers')
    .select('id, customer_type, outstanding_balance, is_active')

  if (allError) throw allError

  const customers = allCustomers as any[] || []
  const active = customers.filter(c => c.is_active)

  return {
    total: active.length,
    byType: {
      cash: active.filter(c => c.customer_type === 'cash').length,
      credit: active.filter(c => c.customer_type === 'credit').length,
      wholesale: active.filter(c => c.customer_type === 'wholesale').length,
      retail: active.filter(c => c.customer_type === 'retail').length
    },
    totalOutstanding: active.reduce((sum, c) => sum + (c.outstanding_balance || 0), 0),
    customersWithBalance: active.filter(c => c.outstanding_balance > 0).length
  }
}
