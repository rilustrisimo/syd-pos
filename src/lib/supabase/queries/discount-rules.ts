import { getClient } from '../client'

export interface DiscountRule {
  id: string
  name: string
  markup_min: number
  markup_max: number | null
  discount_percentage: number
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export async function getDiscountRules() {
  const supabase = getClient()
  const { data, error } = await supabase
    .from('discount_rules')
    .select('*')
    .order('sort_order')
    .order('markup_min')
  if (error) throw error
  return data as DiscountRule[]
}

export async function createDiscountRule(
  rule: Pick<DiscountRule, 'name' | 'markup_min' | 'markup_max' | 'discount_percentage' | 'sort_order'>
) {
  const supabase = getClient()
  const { data, error } = await supabase
    .from('discount_rules')
    .insert(rule)
    .select()
    .single()
  if (error) throw error
  return data as DiscountRule
}

export async function updateDiscountRule(id: string, updates: Partial<Omit<DiscountRule, 'id' | 'created_at' | 'updated_at'>>) {
  const supabase = getClient()
  const { data, error } = await supabase
    .from('discount_rules')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as DiscountRule
}

export async function deleteDiscountRule(id: string) {
  const supabase = getClient()
  const { error } = await supabase.from('discount_rules').delete().eq('id', id)
  if (error) throw error
}

/** Given a product's markup %, return the matching active rule's discount %, or 0. */
export function getStandardDiscountForMarkup(rules: DiscountRule[], markupPercentage: number): number {
  const active = rules.filter((r) => r.is_active)
  for (const rule of active) {
    const aboveMin = markupPercentage >= rule.markup_min
    const belowMax = rule.markup_max === null || markupPercentage <= rule.markup_max
    if (aboveMin && belowMax) return rule.discount_percentage
  }
  return 0
}
