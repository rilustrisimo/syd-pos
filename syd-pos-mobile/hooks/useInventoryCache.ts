import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useMemo, useState } from 'react'
import { useProducts } from '@syd/api'

const CACHE_KEY = 'syd-pos-inventory-cache'
const STALE_MS = 5 * 60 * 1000
const MAX_SAFE_AGE_MS = 30 * 60 * 1000

export function useInventoryCache() {
  const [cachedAt, setCachedAt] = useState<string | null>(null)

  const productsQuery = useProducts()

  useEffect(() => {
    AsyncStorage.getItem(CACHE_KEY)
      .then((value) => {
        if (!value) return
        const parsed = JSON.parse(value) as { cachedAt?: string }
        setCachedAt(parsed.cachedAt ?? null)
      })
      .catch(() => null)
  }, [])

  useEffect(() => {
    if (!productsQuery.data) return

    const nextCachedAt = new Date().toISOString()
    setCachedAt(nextCachedAt)

    AsyncStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        cachedAt: nextCachedAt,
        data: productsQuery.data,
      })
    ).catch(() => null)
  }, [productsQuery.data])

  const ageMs = useMemo(() => {
    if (!cachedAt) return Number.POSITIVE_INFINITY
    return Math.max(0, Date.now() - new Date(cachedAt).getTime())
  }, [cachedAt])

  const isStale = ageMs > STALE_MS
  const exceedsSafeWindow = ageMs > MAX_SAFE_AGE_MS

  useEffect(() => {
    const interval = setInterval(() => {
      productsQuery.refetch().catch(() => null)
    }, STALE_MS)

    return () => clearInterval(interval)
  }, [productsQuery])

  return {
    products: productsQuery.data ?? [],
    isLoading: productsQuery.isLoading,
    isStale,
    exceedsSafeWindow,
    cacheAgeMinutes: Number.isFinite(ageMs) ? Math.floor(ageMs / 1000 / 60) : null,
    refetch: productsQuery.refetch,
  }
}
