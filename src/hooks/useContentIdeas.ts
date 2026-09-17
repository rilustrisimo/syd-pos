'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getClient } from '@/lib/supabase/client'

export type ContentIdeaStatus = 'idea' | 'created' | 'posted'

export interface ContentIdea {
  id: string
  title: string
  description: string | null
  image_concept: string | null
  source_product_id: string | null
  status: ContentIdeaStatus
  created_by: string | null
  created_at: string
  // joined
  source_product?: { id: string; name: string } | null
}

const keys = {
  all: ['content_ideas'] as const,
  list: (status?: ContentIdeaStatus) => [...keys.all, 'list', status ?? 'all'] as const,
}

// content_ideas isn't in the hand-maintained Database type yet — casts
// here match this codebase's established pattern for content_suggestions
// and scheduled_posts.
export function useContentIdeas(statusFilter?: ContentIdeaStatus) {
  return useQuery({
    queryKey: keys.list(statusFilter),
    queryFn: async () => {
      const supabase = getClient()
      let q = (supabase as any)
        .from('content_ideas')
        .select('*, source_product:products(id, name)')
        .order('created_at', { ascending: false })
      if (statusFilter) q = q.eq('status', statusFilter)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return (data ?? []) as ContentIdea[]
    },
    staleTime: 1000 * 30,
  })
}

export interface NewContentIdeaInput {
  title: string
  description?: string
  image_concept?: string
  source_product_id?: string
}

export function useCreateContentIdea() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewContentIdeaInput) => {
      const supabase = getClient()
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await (supabase as any)
        .from('content_ideas')
        .insert({ ...input, created_by: user?.id ?? null })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as ContentIdea
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  })
}

export function useUpdateContentIdea() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, title, description, image_concept }: {
      id: string; title?: string; description?: string; image_concept?: string
    }) => {
      const supabase = getClient()
      const updates: Record<string, unknown> = {}
      if (title !== undefined) updates.title = title
      if (description !== undefined) updates.description = description
      if (image_concept !== undefined) updates.image_concept = image_concept
      const { error } = await (supabase as any).from('content_ideas').update(updates).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  })
}

export function useMarkContentIdeaStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ContentIdeaStatus }) => {
      const supabase = getClient()
      const { error } = await (supabase as any).from('content_ideas').update({ status }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  })
}

export function useDeleteContentIdea() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = getClient()
      const { error } = await (supabase as any).from('content_ideas').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  })
}
