'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getClient } from '@/lib/supabase/client'
import type { SuggestionPlatform } from '@/hooks/useContentSuggestions'

export type ScheduledPostStatus = 'scheduled' | 'posted' | 'failed'

export interface ScheduledPost {
  id: string
  suggestion_id: string
  platform: SuggestionPlatform
  scheduled_at: string
  status: ScheduledPostStatus
  posted_at: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  // joined
  suggestion?: {
    id: string
    caption_draft: string
    caption_final: string | null
    creative_media_id: string | null
    source_product: { id: string; name: string } | null
    creative_media: { id: string; media_type: string; storage_key: string } | null
  } | null
}

const keys = {
  all: ['scheduled_posts'] as const,
  list: () => [...keys.all, 'list'] as const,
}

// content_suggestions/scheduled_posts aren't in the hand-maintained
// Database type yet — casts here match this codebase's established
// pattern for querying tables the typed client doesn't know about.
export function useScheduledPosts() {
  return useQuery({
    queryKey: keys.list(),
    queryFn: async () => {
      const supabase = getClient()
      const { data, error } = await (supabase as any)
        .from('scheduled_posts')
        .select(`
          *,
          suggestion:content_suggestions(
            id, caption_draft, caption_final, creative_media_id,
            source_product:products(id, name),
            creative_media:content_media!content_suggestions_creative_media_id_fkey(id, media_type, storage_key)
          )
        `)
        .order('scheduled_at', { ascending: true })
      if (error) throw new Error(error.message)
      return (data ?? []) as ScheduledPost[]
    },
    staleTime: 1000 * 30,
  })
}

export interface NewScheduledPostInput {
  suggestion_id: string
  platform: SuggestionPlatform
  scheduled_at: string
  notes?: string
}

export function useCreateScheduledPost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewScheduledPostInput) => {
      const supabase = getClient()
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await (supabase as any)
        .from('scheduled_posts')
        .insert({ ...input, created_by: user?.id ?? null })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as ScheduledPost
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  })
}

export function useUpdateScheduledPost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, scheduled_at, platform, notes }: {
      id: string; scheduled_at?: string; platform?: SuggestionPlatform; notes?: string
    }) => {
      const supabase = getClient()
      const updates: Record<string, unknown> = {}
      if (scheduled_at !== undefined) updates.scheduled_at = scheduled_at
      if (platform !== undefined) updates.platform = platform
      if (notes !== undefined) updates.notes = notes
      const { error } = await (supabase as any).from('scheduled_posts').update(updates).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  })
}

export function useMarkScheduledPostStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'posted' | 'failed' }) => {
      const supabase = getClient()
      const updates: Record<string, unknown> = { status }
      if (status === 'posted') updates.posted_at = new Date().toISOString()
      const { error } = await (supabase as any).from('scheduled_posts').update(updates).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  })
}

export function useDeleteScheduledPost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = getClient()
      const { error } = await (supabase as any).from('scheduled_posts').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  })
}
