'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getDiscountRules,
  createDiscountRule,
  updateDiscountRule,
  deleteDiscountRule,
  type DiscountRule,
} from '@/lib/supabase/queries/discount-rules'

const QUERY_KEY = ['discount-rules']

export function useDiscountRules() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: getDiscountRules,
    staleTime: 1000 * 60 * 5,
  })
}

export function useCreateDiscountRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rule: Pick<DiscountRule, 'name' | 'markup_min' | 'markup_max' | 'discount_percentage' | 'sort_order'>) =>
      createDiscountRule(rule),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export function useUpdateDiscountRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Omit<DiscountRule, 'id' | 'created_at' | 'updated_at'>> }) =>
      updateDiscountRule(id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export function useDeleteDiscountRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteDiscountRule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}
