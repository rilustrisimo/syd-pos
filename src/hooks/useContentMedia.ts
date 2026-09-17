'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getClient } from '@/lib/supabase/client'

export type ContentMediaType = 'image' | 'video'
export type TranscriptStatus = 'pending' | 'processing' | 'done' | 'skipped' | 'failed'

export interface ContentMedia {
  id: string
  media_type: ContentMediaType
  storage_key: string
  original_filename: string
  mime_type: string
  size_bytes: number
  duration_seconds: number | null
  transcript: string | null
  transcript_status: TranscriptStatus
  attribution: string | null
  uploaded_by: string | null
  created_at: string
}

const keys = {
  all: ['content_media'] as const,
  list: () => [...keys.all, 'list'] as const,
}

// This media is inherently meant for public social posts eventually, unlike
// private documents (payment proofs) elsewhere in the app — so a public R2
// bucket URL is used directly rather than generating a signed GET URL per
// render. Requires the bucket's public access (R2.dev URL or a custom
// domain) to be enabled in the Cloudflare dashboard.
export function getContentMediaUrl(storageKey: string): string {
  const base = process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL
  if (!base) return ''
  return `${base.replace(/\/$/, '')}/${storageKey}`
}

export function useContentMedia() {
  return useQuery({
    queryKey: keys.list(),
    queryFn: async () => {
      const supabase = getClient()
      const { data, error } = await supabase
        .from('content_media')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as ContentMedia[]
    },
    staleTime: 1000 * 30,
  })
}

export interface NewContentMediaInput {
  media_type: ContentMediaType
  storage_key: string
  original_filename: string
  mime_type: string
  size_bytes: number
}

export function useCreateContentMedia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewContentMediaInput) => {
      const supabase = getClient()
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('content_media')
        .insert({ ...input, uploaded_by: user?.id ?? null })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as ContentMedia
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.list() }),
  })
}

export function useDeleteContentMedia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = getClient()
      const { error } = await supabase.from('content_media').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.list() }),
  })
}
