'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getClient } from '@/lib/supabase/client'

export type SuggestionStatus = 'suggested' | 'approved' | 'rejected'
export type SuggestionPlatform = 'facebook' | 'instagram' | 'both'

export interface ContentSuggestion {
  id: string
  source_product_id: string | null
  source_media_id: string | null
  creative_media_id: string | null
  platform: SuggestionPlatform
  notes: string | null
  caption_draft: string
  caption_final: string | null
  status: SuggestionStatus
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  // joined
  source_product?: { id: string; name: string } | null
  source_media?: { id: string; media_type: string; storage_key: string; original_filename: string } | null
  creative_media?: { id: string; media_type: string; storage_key: string; original_filename: string } | null
}

const keys = {
  all: ['content_suggestions'] as const,
  list: (status?: SuggestionStatus) => [...keys.all, 'list', status ?? 'all'] as const,
}

export function useContentSuggestions(statusFilter?: SuggestionStatus) {
  return useQuery({
    queryKey: keys.list(statusFilter),
    queryFn: async () => {
      const supabase = getClient()
      let q = supabase
        .from('content_suggestions')
        .select(`
          *,
          source_product:products(id, name),
          source_media:content_media!content_suggestions_source_media_id_fkey(id, media_type, storage_key, original_filename),
          creative_media:content_media!content_suggestions_creative_media_id_fkey(id, media_type, storage_key, original_filename)
        `)
        .order('created_at', { ascending: false })

      if (statusFilter) q = q.eq('status', statusFilter)

      const { data, error } = await q
      if (error) throw new Error(error.message)
      return (data ?? []) as ContentSuggestion[]
    },
    staleTime: 1000 * 30,
  })
}

export interface GenerateSuggestionInput {
  source_product_id?: string
  source_media_id?: string
  notes?: string
  platform?: SuggestionPlatform
}

// Goes through the API route (not a direct insert) since generating a
// suggestion calls the Claude API with a server-only key.
export function useGenerateContentSuggestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: GenerateSuggestionInput) => {
      const res = await fetch('/api/content/generate-suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate suggestion')
      return data.suggestion as ContentSuggestion
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  })
}

export function useUpdateContentSuggestionCaption() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, caption_final }: { id: string; caption_final: string }) => {
      const supabase = getClient()
      const { error } = await supabase
        .from('content_suggestions')
        .update({ caption_final })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  })
}

export function useAttachCreativeMedia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, creative_media_id }: { id: string; creative_media_id: string | null }) => {
      const supabase = getClient()
      const { error } = await supabase
        .from('content_suggestions')
        .update({ creative_media_id })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  })
}

export type CreativeTemplate = 'new-arrival' | 'promo' | 'spotlight'

// Goes through the API route since generating a creative renders a PNG
// server-side (next/og) and uploads it to R2 with server-only credentials.
export function useGenerateCreative() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, template }: { id: string; template: CreativeTemplate }) => {
      const res = await fetch('/api/content/generate-creative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestion_id: id, template }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate creative')
      return data.media
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.all })
      qc.invalidateQueries({ queryKey: ['content_media'] })
    },
  })
}

export function useReviewContentSuggestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'approved' | 'rejected' }) => {
      const supabase = getClient()
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('content_suggestions')
        .update({ status, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  })
}

export function useDeleteContentSuggestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = getClient()
      const { error } = await supabase.from('content_suggestions').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  })
}
