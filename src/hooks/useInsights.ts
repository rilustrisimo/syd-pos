import { useQuery } from '@tanstack/react-query'
import type { InsightsBundle } from '@/lib/insights/bundle'

export function useInsights(params: { from: string; to: string; branch: string | null }, enabled = true) {
  return useQuery<InsightsBundle>({
    queryKey: ['insights', params.from, params.to, params.branch],
    enabled,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const q = new URLSearchParams({ from: params.from, to: params.to })
      if (params.branch) q.set('branch', params.branch)
      const res = await fetch(`/api/insights?${q}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Failed to load insights')
      return j
    },
  })
}
