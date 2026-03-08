'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Canvas, CreateCanvasPayload } from '@syd/api'

// ── Query keys ────────────────────────────────────────────────────────────────
export const canvasKeys = {
  all: ['canvases'] as const,
  lists: () => [...canvasKeys.all, 'list'] as const,
  list: (page: number, limit: number) => [...canvasKeys.lists(), page, limit] as const,
  detail: (id: string) => [...canvasKeys.all, 'detail', id] as const,
}

const CANVAS_SELECT = `
  *,
  customer:customers(id, name, phone),
  lines:canvas_lines(
    *,
    product:products(id, code, name),
    uom:units_of_measure(id, name, code)
  )
`

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useCanvases(page = 1, limit = 20) {
  const offset = (page - 1) * limit

  return useQuery({
    queryKey: canvasKeys.list(page, limit),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error, count } = await supabase
        .from('canvases')
        .select(CANVAS_SELECT, { count: 'exact' })
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) throw new Error(`Failed to fetch canvases: ${error.message}`)

      return {
        data: (data || []) as Canvas[],
        total: count || 0,
        page,
        limit,
      }
    },
    staleTime: 1000 * 60,
  })
}

export function useCanvas(id: string | undefined) {
  return useQuery({
    queryKey: canvasKeys.detail(id || ''),
    queryFn: async () => {
      if (!id) return null
      const supabase = createClient()
      const { data, error } = await supabase
        .from('canvases')
        .select(CANVAS_SELECT)
        .eq('id', id)
        .single()
      if (error) throw new Error(`Failed to fetch canvas: ${error.message}`)
      return data as Canvas
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
  })
}

export function useCreateCanvas() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: CreateCanvasPayload) => {
      const supabase = createClient()
      const input = payload.input

      // 1. Generate canvas number
      const { data: canvasNumber, error: numError } = await supabase
        .rpc('generate_canvas_number')
      if (numError) throw new Error(`Failed to generate canvas number: ${numError.message}`)

      // 2. Insert header
      const { data: canvas, error: headerError } = await supabase
        .from('canvases')
        .insert({
          canvas_number:      canvasNumber as string,
          branch_id:          input.branch_id,
          customer_id:        input.customer_id        ?? null,
          title:              input.title              ?? null,
          notes:              input.notes              ?? null,
          subtotal:           input.subtotal,
          discount_amount:    input.discount_amount,
          discount_percentage: input.discount_percentage,
          delivery_fee:       input.delivery_fee,
          other_fees:         input.other_fees,
          other_fees_notes:   input.other_fees_notes   ?? null,
          total_amount:       input.total_amount,
          canvas_date:        input.canvas_date        ?? new Date().toISOString(),
          created_by:         payload.userId,
        })
        .select()
        .single()
      if (headerError) throw new Error(`Failed to create canvas: ${headerError.message}`)

      // 3. Insert lines
      if (payload.lines.length > 0) {
        const lines = payload.lines.map((line, i) => ({
          canvas_id:       canvas.id,
          line_number:     i + 1,
          product_id:      line.product_id,
          quantity:        line.quantity,
          uom_id:          line.uom_id,
          unit_price:      line.unit_price,
          cogs_per_unit:   line.cogs_per_unit,
          discount_amount: line.discount_amount ?? 0,
          notes:           line.notes ?? null,
        }))

        const { error: linesError } = await supabase
          .from('canvas_lines')
          .insert(lines)

        if (linesError) {
          await supabase.from('canvases').delete().eq('id', canvas.id)
          throw new Error(`Failed to create canvas lines: ${linesError.message}`)
        }
      }

      return canvas as Canvas
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: canvasKeys.all })
    },
  })
}

export function useDeleteCanvas() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('canvases')
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw new Error(`Failed to delete canvas: ${error.message}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: canvasKeys.all })
    },
  })
}
