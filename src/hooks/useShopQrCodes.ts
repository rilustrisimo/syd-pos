'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createShopQrCode,
  deleteShopQrCode,
  getShopQrCodes,
  updateShopQrCode,
  type ShopQrCode,
} from '@/lib/supabase/queries/shop-qr-codes'

const QUERY_KEY = ['shop-qr-codes']

export function useShopQrCodes() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: getShopQrCodes,
    staleTime: 1000 * 60 * 5,
  })
}

export function useCreateShopQrCode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (row: Pick<ShopQrCode, 'label' | 'image_url' | 'sort_order'>) => createShopQrCode(row),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export function useUpdateShopQrCode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Omit<ShopQrCode, 'id' | 'created_at' | 'updated_at'>> }) =>
      updateShopQrCode(id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export function useDeleteShopQrCode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteShopQrCode(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}
