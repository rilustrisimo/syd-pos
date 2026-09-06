import { getClient } from '../client'

export interface ShopQrCode {
  id: string
  label: string
  image_url: string
  logo_url: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export async function getShopQrCodes() {
  const supabase = getClient()
  const { data, error } = await supabase
    .from('shop_qr_codes')
    .select('*')
    .order('sort_order')
    .order('created_at')
  if (error) throw error
  return data as ShopQrCode[]
}

export async function createShopQrCode(
  row: Pick<ShopQrCode, 'label' | 'image_url' | 'sort_order'>
) {
  const supabase = getClient()
  const { data, error } = await supabase
    .from('shop_qr_codes')
    .insert(row)
    .select()
    .single()
  if (error) throw error
  return data as ShopQrCode
}

export async function updateShopQrCode(id: string, updates: Partial<Omit<ShopQrCode, 'id' | 'created_at' | 'updated_at'>>) {
  const supabase = getClient()
  const { data, error } = await supabase
    .from('shop_qr_codes')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as ShopQrCode
}

export async function deleteShopQrCode(id: string) {
  const supabase = getClient()
  const { error } = await supabase.from('shop_qr_codes').delete().eq('id', id)
  if (error) throw error
}
