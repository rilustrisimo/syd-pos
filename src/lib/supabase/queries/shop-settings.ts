import { getClient } from '../client'

// shop_settings is a singleton table shared with syd-shop (same Supabase
// project) — syd-shop already reads store_address/store_phone from here for
// its "Call us" button and order confirmation page. This is the one place
// that value should be edited; everything printed in syd-pos (delivery
// slip, pickup slip, canvass/invoice/payout templates) reads from it too,
// instead of a hardcoded constant.
export interface StoreContactInfo {
  id: string
  store_address: string
  store_phone: string
}

const DEFAULT_STORE_ADDRESS = 'Sitio Landing, Talakag, Bukidnon'
const DEFAULT_STORE_PHONE = '09765524334'

export async function getStoreContactInfo(): Promise<StoreContactInfo> {
  const supabase = getClient()
  const { data, error } = await supabase
    .from('shop_settings')
    .select('id, store_address, store_phone')
    .limit(1)
    .single()

  if (error || !data) {
    return { id: '', store_address: DEFAULT_STORE_ADDRESS, store_phone: DEFAULT_STORE_PHONE }
  }
  return {
    id: data.id,
    store_address: data.store_address || DEFAULT_STORE_ADDRESS,
    store_phone: data.store_phone || DEFAULT_STORE_PHONE,
  }
}

export async function updateStoreContactInfo(
  id: string,
  updates: { store_address: string; store_phone: string }
): Promise<void> {
  const supabase = getClient()
  const { error } = await supabase.from('shop_settings').update(updates).eq('id', id)
  if (error) throw error
}
