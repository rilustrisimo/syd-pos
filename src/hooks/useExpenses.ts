'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { ExpenseCategoryRow, ExpenseRow } from '@/types/database'

// ── Re-exported convenience types ──────────────────────────────────────────────

export type ExpenseCategory = ExpenseCategoryRow

export interface Expense extends ExpenseRow {
  category?: ExpenseCategory | null
  created_user?: { id: string; full_name: string | null; email: string } | null
  branch?: { id: string; name: string } | null
}

export interface ExpenseFilters {
  date_from?: string
  date_to?: string
  category_id?: string
  search?: string
  page?: number
  limit?: number
}

export interface CreateExpenseInput {
  branch_id: string
  category_id?: string | null
  amount: number
  expense_date: string
  description?: string | null
  notes?: string | null
  reference_number?: string | null
  paid_to?: string | null
}

export interface UpdateExpenseInput extends Partial<CreateExpenseInput> {}

// ── Query keys ─────────────────────────────────────────────────────────────────

export const expenseKeys = {
  all: ['expenses'] as const,
  lists: () => [...expenseKeys.all, 'list'] as const,
  list: (filters: ExpenseFilters) => [...expenseKeys.lists(), filters] as const,
  categories: () => [...expenseKeys.all, 'categories'] as const,
}

// ── Select clause ──────────────────────────────────────────────────────────────

const EXPENSE_SELECT = `
  *,
  category:expense_categories(id, name, color, is_system),
  branch:branches(id, name)
`

// ── Hooks ──────────────────────────────────────────────────────────────────────

export function useExpenseCategories() {
  return useQuery({
    queryKey: expenseKeys.categories(),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('expense_categories')
        .select('*')
        .eq('is_active', true)
        .order('name')
      if (error) throw new Error(`Failed to fetch expense categories: ${error.message}`)
      return (data || []) as ExpenseCategory[]
    },
    staleTime: 1000 * 60 * 5,
  })
}

export function useExpenses(filters: ExpenseFilters = {}) {
  const { page = 1, limit = 20, ...rest } = filters
  const offset = (page - 1) * limit

  return useQuery({
    queryKey: expenseKeys.list(filters),
    queryFn: async () => {
      const supabase = createClient()

      let query = supabase
        .from('expenses')
        .select(EXPENSE_SELECT, { count: 'exact' })
        .eq('is_deleted', false)

      if (rest.date_from) {
        query = query.gte('expense_date', `${rest.date_from}T00:00:00+08:00`)
      }
      if (rest.date_to) {
        query = query.lte('expense_date', `${rest.date_to}T23:59:59+08:00`)
      }
      if (rest.category_id) {
        query = query.eq('category_id', rest.category_id)
      }
      if (rest.search) {
        query = query.or(
          `description.ilike.%${rest.search}%,paid_to.ilike.%${rest.search}%,reference_number.ilike.%${rest.search}%,expense_number.ilike.%${rest.search}%`
        )
      }

      const { data, error, count } = await query
        .order('expense_date', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) throw new Error(`Failed to fetch expenses: ${error.message}`)

      return {
        data: (data || []) as Expense[],
        total: count || 0,
        page,
        limit,
      }
    },
    staleTime: 1000 * 60,
  })
}

export function useCreateExpense() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ input, userId }: { input: CreateExpenseInput; userId: string }) => {
      const supabase = createClient()

      const { data: expenseNumber, error: numError } = await supabase
        .rpc('generate_expense_number')
      if (numError) throw new Error(`Failed to generate expense number: ${numError.message}`)

      const { data: expense, error } = await supabase
        .from('expenses')
        .insert({
          expense_number: expenseNumber as string,
          branch_id: input.branch_id,
          category_id: input.category_id ?? null,
          amount: input.amount,
          expense_date: input.expense_date,
          description: input.description ?? null,
          notes: input.notes ?? null,
          reference_number: input.reference_number ?? null,
          paid_to: input.paid_to ?? null,
          created_by: userId,
        })
        .select(EXPENSE_SELECT)
        .single()

      if (error) throw new Error(`Failed to create expense: ${error.message}`)
      return expense as Expense
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.all })
    },
  })
}

export function useUpdateExpense() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateExpenseInput }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('expenses')
        .update({
          category_id: input.category_id ?? null,
          amount: input.amount,
          expense_date: input.expense_date,
          description: input.description ?? null,
          notes: input.notes ?? null,
          reference_number: input.reference_number ?? null,
          paid_to: input.paid_to ?? null,
        })
        .eq('id', id)
        .select(EXPENSE_SELECT)
        .single()

      if (error) throw new Error(`Failed to update expense: ${error.message}`)
      return data as Expense
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.all })
    },
  })
}

export function useDeleteExpense() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('expenses')
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw new Error(`Failed to delete expense: ${error.message}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.all })
    },
  })
}

export function useCreateExpenseCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { name: string; description?: string; color: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('expense_categories')
        .insert({
          name: input.name,
          description: input.description ?? null,
          color: input.color,
          is_system: false,
        })
        .select()
        .single()

      if (error) throw new Error(`Failed to create category: ${error.message}`)
      return data as ExpenseCategory
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.categories() })
    },
  })
}

export function useDeleteExpenseCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      // Mark inactive instead of deleting — preserves foreign key references
      const { error } = await supabase
        .from('expense_categories')
        .update({ is_active: false })
        .eq('id', id)
        .eq('is_system', false)   // safety: never deactivate system categories
      if (error) throw new Error(`Failed to delete category: ${error.message}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.categories() })
    },
  })
}

// ── Export helper (no pagination) ──────────────────────────────────────────────

export interface ExpenseExportRow {
  expense_number: string
  date: string
  category: string
  description: string
  paid_to: string
  reference_number: string
  branch: string
  amount: number
}

export async function getAllExpenses(filters: Pick<ExpenseFilters, 'date_from' | 'date_to' | 'category_id' | 'search'>): Promise<ExpenseExportRow[]> {
  const supabase = createClient()

  let query = supabase
    .from('expenses')
    .select(EXPENSE_SELECT)
    .eq('is_deleted', false)

  if (filters.date_from) {
    query = query.gte('expense_date', `${filters.date_from}T00:00:00+08:00`)
  }
  if (filters.date_to) {
    query = query.lte('expense_date', `${filters.date_to}T23:59:59+08:00`)
  }
  if (filters.category_id) {
    query = query.eq('category_id', filters.category_id)
  }
  if (filters.search) {
    query = query.or(
      `description.ilike.%${filters.search}%,paid_to.ilike.%${filters.search}%,reference_number.ilike.%${filters.search}%,expense_number.ilike.%${filters.search}%`
    )
  }

  const { data, error } = await query.order('expense_date', { ascending: true })
  if (error) throw new Error(`Failed to fetch expenses for export: ${error.message}`)

  return ((data as any[]) || []).map(e => ({
    expense_number: e.expense_number || '',
    date: e.expense_date?.split('T')[0] ?? '',
    category: e.category?.name || 'Uncategorized',
    description: e.description || '',
    paid_to: e.paid_to || '',
    reference_number: e.reference_number || '',
    branch: e.branch?.name || '',
    amount: Number(e.amount ?? 0),
  }))
}
