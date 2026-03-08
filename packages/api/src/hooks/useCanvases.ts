import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { Canvas, CreateCanvasPayload } from '../types'

const CANVASES_QUERY_KEY = ['canvases']

const CANVAS_LINES_SELECT = `
  *,
  product:products(id, code, name),
  uom:units_of_measure(id, name, code)
`

const CANVAS_SELECT = `
  *,
  customer:customers(id, name, phone),
  lines:canvas_lines(${CANVAS_LINES_SELECT})
`

/**
 * Hook to fetch paginated canvases (excludes soft-deleted)
 */
export const useCanvases = (
  page: number = 1,
  limit: number = 20,
  options?: { enabled?: boolean }
) => {
  const offset = (page - 1) * limit

  return useQuery({
    queryKey: [...CANVASES_QUERY_KEY, 'list', page, limit],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('canvases')
        .select(CANVAS_SELECT, { count: 'exact' })
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) {
        throw new Error(`Failed to fetch canvases: ${error.message}`)
      }

      return {
        data: (data || []) as Canvas[],
        total: count || 0,
        page,
        limit,
      }
    },
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 10,
    enabled: options?.enabled !== false,
    retry: 2,
  })
}

/**
 * Hook to get a single canvas by ID (with lines + products joined)
 */
export const useCanvas = (id: string | undefined) => {
  return useQuery({
    queryKey: [...CANVASES_QUERY_KEY, id],
    queryFn: async () => {
      if (!id) return null

      const { data, error } = await supabase
        .from('canvases')
        .select(CANVAS_SELECT)
        .eq('id', id)
        .single()

      if (error) {
        throw new Error(`Failed to fetch canvas: ${error.message}`)
      }

      return data as Canvas
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    enabled: !!id,
    retry: 2,
  })
}

/**
 * Hook to create a new canvas (header + lines — no RPC needed, no inventory side effects)
 */
export const useCreateCanvas = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: CreateCanvasPayload) => {
      const input = payload.input

      // 1. Generate canvas number
      const { data: canvasNumber, error: numError } = await supabase
        .rpc('generate_canvas_number')

      if (numError) {
        throw new Error(`Failed to generate canvas number: ${numError.message}`)
      }

      // 2. Insert canvas header
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

      if (headerError) {
        throw new Error(`Failed to create canvas: ${headerError.message}`)
      }

      // 3. Insert canvas lines
      if (payload.lines.length > 0) {
        const lines = payload.lines.map((line, index) => ({
          canvas_id:       canvas.id,
          line_number:     index + 1,
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
          // Roll back header if lines fail
          await supabase.from('canvases').delete().eq('id', canvas.id)
          throw new Error(`Failed to create canvas lines: ${linesError.message}`)
        }
      }

      return canvas as Canvas
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CANVASES_QUERY_KEY })
    },
  })
}

/**
 * Hook to update an existing canvas (replaces all lines)
 */
export const useUpdateCanvas = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string
      payload: Omit<CreateCanvasPayload, 'userId'>
    }) => {
      const input = payload.input

      // 1. Update header
      const { data: canvas, error: headerError } = await supabase
        .from('canvases')
        .update({
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
        })
        .eq('id', id)
        .select()
        .single()

      if (headerError) {
        throw new Error(`Failed to update canvas: ${headerError.message}`)
      }

      // 2. Delete existing lines and re-insert
      const { error: deleteError } = await supabase
        .from('canvas_lines')
        .delete()
        .eq('canvas_id', id)

      if (deleteError) {
        throw new Error(`Failed to replace canvas lines: ${deleteError.message}`)
      }

      if (payload.lines.length > 0) {
        const lines = payload.lines.map((line, index) => ({
          canvas_id:       id,
          line_number:     index + 1,
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
          throw new Error(`Failed to insert updated canvas lines: ${linesError.message}`)
        }
      }

      return canvas as Canvas
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: CANVASES_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: [...CANVASES_QUERY_KEY, id] })
    },
  })
}

/**
 * Hook to soft-delete a canvas
 */
export const useDeleteCanvas = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('canvases')
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq('id', id)

      if (error) {
        throw new Error(`Failed to delete canvas: ${error.message}`)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CANVASES_QUERY_KEY })
    },
  })
}

export default useCanvases
