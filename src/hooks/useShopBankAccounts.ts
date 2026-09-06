'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createShopBankAccount,
  deleteShopBankAccount,
  getShopBankAccounts,
  updateShopBankAccount,
  type ShopBankAccount,
} from '@/lib/supabase/queries/shop-bank-accounts'

const QUERY_KEY = ['shop-bank-accounts']

export function useShopBankAccounts() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: getShopBankAccounts,
    staleTime: 1000 * 60 * 5,
  })
}

export function useCreateShopBankAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (row: Pick<ShopBankAccount, 'bank_name' | 'account_name' | 'account_number' | 'sort_order'>) =>
      createShopBankAccount(row),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export function useUpdateShopBankAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Omit<ShopBankAccount, 'id' | 'created_at' | 'updated_at'>> }) =>
      updateShopBankAccount(id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export function useDeleteShopBankAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteShopBankAccount(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}
