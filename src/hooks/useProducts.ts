'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getCategories,
  getSubcategories,
  getUnitsOfMeasure,
  createCategory,
  updateCategory,
  deleteCategory,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
} from '@/lib/supabase/queries/products'
import type { InsertTables, UpdateTables } from '@/types/database'

// Products hooks
export function useProducts(params?: {
  search?: string
  categoryId?: string
  page?: number
  limit?: number
}) {
  return useQuery({
    queryKey: ['products', params],
    queryFn: () => getProducts(params),
  })
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: ['products', id],
    queryFn: () => getProduct(id),
    enabled: !!id,
  })
}

export function useCreateProduct() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (product: InsertTables<'products'>) => createProduct(product),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.refetchQueries({ queryKey: ['products'], type: 'active' })
    },
  })
}

export function useUpdateProduct() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateTables<'products'> }) =>
      updateProduct(id, updates),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['products', id] })
      queryClient.refetchQueries({ queryKey: ['products'], type: 'active' })
      queryClient.refetchQueries({ queryKey: ['products', id], type: 'active' })
    },
  })
}

export function useDeleteProduct() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.refetchQueries({ queryKey: ['products'], type: 'active' })
    },
  })
}

// Categories hooks
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
  })
}

export function useSubcategories(categoryId?: string) {
  return useQuery({
    queryKey: ['subcategories', categoryId],
    queryFn: () => getSubcategories(categoryId),
  })
}

export function useCreateCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (category: InsertTables<'product_categories'>) => createCategory(category),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
    },
  })
}

export function useUpdateCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateTables<'product_categories'> }) =>
      updateCategory(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
    },
  })
}

export function useDeleteCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
    },
  })
}

// Subcategories hooks
export function useCreateSubcategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (subcategory: InsertTables<'product_subcategories'>) => createSubcategory(subcategory),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subcategories'] })
    },
  })
}

export function useUpdateSubcategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateTables<'product_subcategories'> }) =>
      updateSubcategory(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subcategories'] })
    },
  })
}

export function useDeleteSubcategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteSubcategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subcategories'] })
    },
  })
}

// Units hooks
export function useUnitsOfMeasure() {
  return useQuery({
    queryKey: ['units'],
    queryFn: getUnitsOfMeasure,
  })
}
