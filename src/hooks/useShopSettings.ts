'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getStoreContactInfo,
  updateStoreContactInfo,
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
