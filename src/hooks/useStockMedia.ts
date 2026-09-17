'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { StockSearchResult } from '@/lib/marketing/stock-providers'

export type { StockSearchResult }

// Mutations only, not a useQuery — search results aren't cached like a
// normal library listing, they're a fresh query-per-search.
export function useSearchStockMedia() {
  return useMutation({
    mutationFn: async (q: string) => {
      const res = await fetch(`/api/media/search-stock?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to search stock media')
      return data.results as StockSearchResult[]
    },
  })
}

export function useImportStockMedia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (result: StockSearchResult) => {
      const res = await fetch('/api/media/import-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: result.source,
          id: result.id,
          type: result.type,
          fullUrl: result.fullUrl,
          attribution: result.attribution,
          downloadLocation: result.downloadLocation,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to import media')
      return data.media
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content_media'] }),
  })
}
