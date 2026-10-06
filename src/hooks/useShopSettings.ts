'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getStoreContactInfo,
  updateStoreContactInfo,
  getShopBranchId,
  getHidePrices,
  updateHidePrices,
  type StoreContactInfo,
} from '@/lib/supabase/queries/shop-settings'

const QUERY_KEY = ['store-contact-info']

export function useStoreContactInfo() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: getStoreContactInfo,
    staleTime: 1000 * 60 * 5,
  })
}

export function useShopBranchId() {
  return useQuery({
    queryKey: ['shop-branch-id'],
    queryFn: getShopBranchId,
    staleTime: 1000 * 60 * 5,
  })
}

export function useUpdateStoreContactInfo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: StoreContactInfo) =>
      updateStoreContactInfo(input.id, {
        store_address: input.store_address,
        store_phone: input.store_phone,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

const HIDE_PRICES_QUERY_KEY = ['shop-hide-prices']

export function useHidePrices() {
  return useQuery({
    queryKey: HIDE_PRICES_QUERY_KEY,
    queryFn: getHidePrices,
    staleTime: 1000 * 60,
  })
}

export function useUpdateHidePrices() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, hide_prices }: { id: string; hide_prices: boolean }) => updateHidePrices(id, hide_prices),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: HIDE_PRICES_QUERY_KEY }),
  })
}
