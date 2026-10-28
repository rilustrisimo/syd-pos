'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getClient } from '@/lib/supabase/client'
import { loadInsights } from '@/lib/marketing/insights-data'
import type { InsightSource } from '@/lib/marketing/insights-import'
import type { AdConcept, InsightsAnalysis, PlannedPost } from '@/lib/marketing/planner-prompts'
import type { ContentAudience } from '@/hooks/useContentIdeas'

const keys = {
  insights: ['marketing_insights'] as const,
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data as T
}

export function useMarketingInsights() {
  return useQuery({
    queryKey: keys.insights,
    queryFn: () => loadInsights(getClient() as any),
    staleTime: 1000 * 60,
  })
}

export function useImportInsights() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { source: InsightSource; rows: unknown[] }) => postJson<{ saved: number }>('/api/insights/import', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.insights }),
  })
}

export function usePlanPosts() {
  return useMutation({
    mutationFn: (input: { mode: 'today' | 'week'; note?: string }) =>
      postJson<{ posts: PlannedPost[]; confidence: string }>('/api/marketing/plan', input),
  })
}

export function useSavePlannedPosts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (posts: PlannedPost[]) => postJson<{ saved: number }>('/api/marketing/plan/save', { posts }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['content_suggestions'] })
      qc.invalidateQueries({ queryKey: ['content_ideas'] })
      qc.invalidateQueries({ queryKey: keys.insights })
    },
  })
}

export function useGenerateConcepts() {
  return useMutation({
    mutationFn: (input: { topic: string; source_product_id?: string; audiences: ContentAudience[]; count: number; kind?: 'ad' | 'post' }) =>
      postJson<{ concepts: AdConcept[] }>('/api/marketing/concepts', input),
  })
}

export function useAnalyzeInsights() {
  return useMutation({
    mutationFn: () => postJson<{ analysis: InsightsAnalysis }>('/api/marketing/analyze'),
  })
}
