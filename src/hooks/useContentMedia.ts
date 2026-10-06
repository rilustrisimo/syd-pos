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
//
// Product photos imported from the Library's "Product Photos" tab are the
// one exception — they're referenced directly from wherever the product
// catalog already hosts them (not copied into R2), so storage_key holds a
// full URL for those rows instead of an R2-relative key.
export function getContentMediaUrl(storageKey: string): string {
  if (/^https?:\/\//.test(storageKey)) return storageKey
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

export interface ProductImageResult {
  product_id: string
  product_name: string
  url: string
  is_primary: boolean
}

// Every image for every matching product (not just one representative
// thumbnail like the POS product search returns) — used by the Library's
// "Product Photos" tab so staff can pull in any existing product photo
// without re-uploading it.
export function useProductImagesSearch(query: string) {
  return useQuery({
    queryKey: ['product_images_search', query],
    queryFn: async () => {
      const supabase = getClient()
      const { data, error } = await supabase
        .from('products')
        .select('id, name, images:product_images(url, is_primary, sort_order)')
        .eq('is_active', true)
        .ilike('name', `%${query}%`)
        .order('name')
        .limit(20)
      if (error) throw new Error(error.message)

      const results: ProductImageResult[] = []
      for (const p of (data ?? []) as any[]) {
        const sorted = [...(p.images ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
        for (const img of sorted) {
          results.push({ product_id: p.id, product_name: p.name, url: img.url, is_primary: img.is_primary })
        }
      }
      return results
    },
    enabled: query.trim().length >= 2,
    staleTime: 10000,
  })
}
