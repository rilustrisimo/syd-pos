'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Canvas, CanvasLineInput } from '@syd/api'

type SupabaseClient = ReturnType<typeof createClient>

// ── Query keys ────────────────────────────────────────────────────────────────
export const govCanvasKeys = {
  all: ['government-canvases'] as const,
  lists: () => [...govCanvasKeys.all, 'list'] as const,
  list: (page: number, limit: number) => [...govCanvasKeys.lists(), page, limit] as const,
  detail: (id: string) => [...govCanvasKeys.all, 'detail', id] as const,
}

const CANVAS_SELECT = `
  *,
  customer:customers(id, name, phone),
  branch:branches(id, name, address, phone),
  lines:canvas_lines(
    *,
    product:products(id, code, name),
    uom:units_of_measure(id, name, code)
  )
`

export interface CreateGovernmentCanvasPayload {
  input: {
    branch_id: string
    customer_id?: string | null
    title?: string | null
    notes?: string | null
    subtotal: number
    discount_amount: number
    discount_percentage: number
    delivery_fee: number
    other_fees: number
    other_fees_notes?: string | null
    total_amount: number
    canvas_date?: string
    government_agency: string
    po_number?: string | null
    contact_person?: string | null
    markup_percentage: number
  }
  lines: CanvasLineInput[]
  userId: string
}

// Blocks an action when an active (non-deleted) sale already references this
// canvass — used by both delete and full-edit so a converted canvass can no
// longer be changed out from under its sale.
async function assertCanvasNotLinkedToSale(supabase: SupabaseClient, id: string, action: 'edit' | 'delete') {
  const { data: linked, error } = await supabase
    .from('transactions')
    .select('id, transaction_number')
    .eq('canvas_id', id)
    .eq('is_deleted', false)
    .limit(1)
  if (error) throw new Error(error.message)
  if (linked && linked.length > 0) {
    const suffix = action === 'delete' ? ' Delete the sale first.' : ''
    throw new Error(
      `Cannot ${action}: canvass is linked to sale ${(linked[0] as any).transaction_number}.${suffix}`
    )
  }
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useGovernmentCanvases(page = 1, limit = 20) {
  const offset = (page - 1) * limit

  return useQuery({
    queryKey: govCanvasKeys.list(page, limit),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error, count } = await supabase
        .from('canvases')
        .select(CANVAS_SELECT, { count: 'exact' })
        .eq('is_government', true)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) throw new Error(`Failed to fetch government canvases: ${error.message}`)

      return { data: (data || []) as Canvas[], total: count || 0, page, limit }
    },
    staleTime: 1000 * 60,
  })
}

export function useGovernmentCanvas(id: string | undefined) {
  return useQuery({
    queryKey: govCanvasKeys.detail(id || ''),
    queryFn: async () => {
      if (!id) return null
      const supabase = createClient()
      const { data, error } = await supabase
        .from('canvases')
        .select(CANVAS_SELECT)
        .eq('id', id)
        .eq('is_government', true)
        .single()
      if (error) throw new Error(`Failed to fetch government canvas: ${error.message}`)
      return data as Canvas
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
  })
}

export function useCreateGovernmentCanvas() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: CreateGovernmentCanvasPayload) => {
      const supabase = createClient()
      const input = payload.input

      const { data: canvasNumber, error: numError } = await supabase.rpc('generate_canvas_number')
      if (numError) throw new Error(`Failed to generate canvas number: ${numError.message}`)

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
          is_government:      true,
          government_agency:  input.government_agency,
          po_number:          input.po_number          ?? null,
          contact_person:     input.contact_person     ?? null,
          markup_percentage:  input.markup_percentage  ?? 0,
          created_by:         payload.userId,
        } as any)
        .select()
        .single()
      if (headerError) throw new Error(`Failed to create canvas: ${headerError.message}`)

      if (payload.lines.length > 0) {
        const lines = payload.lines.map((line, i) => ({
          canvas_id:        (canvas as any).id,
          line_number:      i + 1,
          product_id:       line.product_id       ?? null,
          quantity:         line.quantity,
          uom_id:           line.uom_id           ?? null,
          unit_price:       line.unit_price,
          cogs_per_unit:    line.cogs_per_unit,
          discount_amount:  line.discount_amount  ?? 0,
          notes:            line.notes            ?? null,
          line_description: line.line_description ?? null,
          unit_label:       line.unit_label       ?? null,
          base_unit_price:  line.base_unit_price  ?? null,
        }))

        const { error: linesError } = await supabase.from('canvas_lines').insert(lines as any)
        if (linesError) {
          await supabase.from('canvases').delete().eq('id', (canvas as any).id)
          throw new Error(`Failed to create canvas lines: ${linesError.message}`)
        }
      }

      return canvas as Canvas
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: govCanvasKeys.all })
    },
  })
}

export function useUpdateGovernmentCanvas() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string
      updates: { po_number?: string | null; notes?: string | null; government_agency?: string | null; contact_person?: string | null }
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('canvases')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(`Failed to update canvas: ${error.message}`)
      return data as Canvas
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: govCanvasKeys.detail(variables.id) })
      queryClient.invalidateQueries({ queryKey: govCanvasKeys.lists() })
    },
  })
}

// Returns the active (non-deleted) sale referencing this canvass, if any.
// Once a sale exists the canvass is considered converted and should no
// longer be editable.
export function useCanvasLinkedTransaction(id: string | undefined) {
  return useQuery({
    queryKey: [...govCanvasKeys.detail(id || ''), 'linked-transaction'] as const,
    queryFn: async () => {
      if (!id) return null
      const supabase = createClient()
      const { data, error } = await supabase
        .from('transactions')
        .select('id, transaction_number')
        .eq('canvas_id', id)
        .eq('is_deleted', false)
        .limit(1)
      if (error) throw new Error(error.message)
      return (data && data[0]) as { id: string; transaction_number: string } | undefined || null
    },
    enabled: !!id,
    staleTime: 1000 * 60,
  })
}

export function useUpdateGovernmentCanvasFull() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      input,
      lines,
    }: {
      id: string
      input: CreateGovernmentCanvasPayload['input']
      lines: CanvasLineInput[]
    }) => {
      const supabase = createClient()

      await assertCanvasNotLinkedToSale(supabase, id, 'edit')

      const { data: canvas, error: headerError } = await supabase
        .from('canvases')
        .update({
          branch_id:           input.branch_id,
          customer_id:         input.customer_id        ?? null,
          title:               input.title              ?? null,
          notes:               input.notes              ?? null,
          subtotal:            input.subtotal,
          discount_amount:     input.discount_amount,
          discount_percentage: input.discount_percentage,
          delivery_fee:        input.delivery_fee,
          other_fees:          input.other_fees,
          other_fees_notes:    input.other_fees_notes   ?? null,
          total_amount:        input.total_amount,
          canvas_date:         input.canvas_date        ?? new Date().toISOString(),
          government_agency:   input.government_agency,
          po_number:           input.po_number          ?? null,
          contact_person:      input.contact_person     ?? null,
          markup_percentage:   input.markup_percentage  ?? 0,
        } as any)
        .eq('id', id)
        .select()
        .single()
      if (headerError) throw new Error(`Failed to update canvas: ${headerError.message}`)

      const { error: deleteLinesError } = await supabase.from('canvas_lines').delete().eq('canvas_id', id)
      if (deleteLinesError) throw new Error(`Failed to update canvas lines: ${deleteLinesError.message}`)

      if (lines.length > 0) {
        const newLines = lines.map((line, i) => ({
          canvas_id:        id,
          line_number:      i + 1,
          product_id:       line.product_id       ?? null,
          quantity:         line.quantity,
          uom_id:           line.uom_id           ?? null,
          unit_price:       line.unit_price,
          cogs_per_unit:    line.cogs_per_unit,
          discount_amount:  line.discount_amount  ?? 0,
          notes:            line.notes            ?? null,
          line_description: line.line_description ?? null,
          unit_label:       line.unit_label       ?? null,
          base_unit_price:  line.base_unit_price  ?? null,
        }))

        const { error: insertLinesError } = await supabase.from('canvas_lines').insert(newLines as any)
        if (insertLinesError) throw new Error(`Failed to update canvas lines: ${insertLinesError.message}`)
      }

      return canvas as Canvas
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: govCanvasKeys.detail(variables.id) })
      queryClient.invalidateQueries({ queryKey: govCanvasKeys.lists() })
    },
  })
}

export function useDeleteGovernmentCanvas() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()

      // Block deletion if any active (non-deleted) sale is linked to this canvass
      await assertCanvasNotLinkedToSale(supabase, id, 'delete')

      const { error } = await supabase
        .from('canvases')
        .update({ is_deleted: true, deleted_at: new Date().toISOString() } as any)
        .eq('id', id)
      if (error) throw new Error(`Failed to delete canvass: ${error.message}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: govCanvasKeys.all })
    },
  })
}
