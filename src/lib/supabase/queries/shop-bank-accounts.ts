import { getClient } from '../client'

export interface ShopBankAccount {
  id: string
  bank_name: string
  account_name: string
  account_number: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export async function getShopBankAccounts() {
  const supabase = getClient()
  const { data, error } = await supabase
    .from('shop_bank_accounts')
    .select('*')
    .order('sort_order')
    .order('created_at')
  if (error) throw error
  return data as ShopBankAccount[]
}

export async function createShopBankAccount(
  row: Pick<ShopBankAccount, 'bank_name' | 'account_name' | 'account_number' | 'sort_order'>
) {
  const supabase = getClient()
  const { data, error } = await supabase
    .from('shop_bank_accounts')
    .insert(row)
    .select()
    .single()
  if (error) throw error
  return data as ShopBankAccount
}

export async function updateShopBankAccount(id: string, updates: Partial<Omit<ShopBankAccount, 'id' | 'created_at' | 'updated_at'>>) {
  const supabase = getClient()
  const { data, error } = await supabase
    .from('shop_bank_accounts')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as ShopBankAccount
}

export async function deleteShopBankAccount(id: string) {
  const supabase = getClient()
  const { error } = await supabase.from('shop_bank_accounts').delete().eq('id', id)
  if (error) throw error
}
