'use client'

// Animated reels: storyboard generation, render requests, and job polling.
// Rendering itself runs on GitHub Actions (see .github/workflows/render-reel.yml).

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getClient } from '@/lib/supabase/client'
import type { ReelStyle, Storyboard } from '@/lib/marketing/reel-styles'

export type ReelJobStatus = 'queued' | 'rendering' | 'done' | 'failed'

export interface ReelRenderJob {
  id: string
  suggestion_id: string
  style: ReelStyle
  status: ReelJobStatus
  output_media_id: string | null
  error: string | null
  github_run_url: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
  output_media?: { id: string; storage_key: string } | null
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data as T
}

export function useGenerateStoryboard() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (suggestionId: string) =>
      postJson<{ storyboard: Storyboard }>('/api/content/generate-storyboard', { suggestion_id: suggestionId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['content_suggestions'] }),
  })
}

export function useRenderReel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { suggestion_id: string; style: ReelStyle; storyboard: Storyboard; narration_seconds?: number }) =>
      postJson<{ job: ReelRenderJob }>('/api/content/render-reel', input),
    onSettled: (_d, _e, input) => queryClient.invalidateQueries({ queryKey: ['reel_render_jobs', input.suggestion_id] }),
  })
}

/** Latest render job for a post; polls every 5 s while it's queued or rendering. */
export function useLatestReelJob(suggestionId: string, enabled = true) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: ['reel_render_jobs', suggestionId],
    enabled,
    queryFn: async () => {
      const { data, error } = await (getClient() as any)
        .from('reel_render_jobs')
        .select('id, suggestion_id, style, status, output_media_id, error, github_run_url, created_at, started_at, finished_at, output_media:content_media!reel_render_jobs_output_media_id_fkey(id, storage_key)')
        .eq('suggestion_id', suggestionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(error.message)
      const job = data as ReelRenderJob | null
      // The worker attaches the MP4 to the post — refresh the feed when it lands.
      if (job?.status === 'done') {
        queryClient.invalidateQueries({ queryKey: ['content_suggestions'] })
        queryClient.invalidateQueries({ queryKey: ['content_media'] })
      }
      return job
    },
    refetchInterval: (query) => {
      const job = query.state.data as ReelRenderJob | null | undefined
      return job && (job.status === 'queued' || job.status === 'rendering') ? 5000 : false
    },
  })
}
