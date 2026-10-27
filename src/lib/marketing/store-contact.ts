// The store's contact block for post captions, taken from shop_settings
// (the same phone/address staff edit in Settings) and appended verbatim —
// never written by the AI, so the number and address are always exact.

import type { SupabaseClient } from '@supabase/supabase-js'

const SHOP_LINK = 'sydconstruct.com'

export async function loadStoreContact(supabase: SupabaseClient): Promise<string> {
  const { data } = await (supabase as any)
    .from('shop_settings')
    .select('store_name, store_phone, store_address')
    .limit(1)
    .maybeSingle() as { data: { store_name: string | null; store_phone: string | null; store_address: string | null } | null }

  const lines = [
    data?.store_address?.trim() ? `📍 ${data.store_address.trim()}` : null,
    data?.store_phone?.trim() ? `📞 ${data.store_phone.trim()}` : null,
    `🛒 Request a quote: ${SHOP_LINK}`,
  ].filter(Boolean)
  return lines.join('\n')
}

/** caption → contact block → hashtags, without repeating a block already present. */
export function composeCaption(caption: string, contact: string, hashtags: string[] | string): string {
  const tags = (Array.isArray(hashtags) ? hashtags.join(' ') : hashtags).trim()
  const body = caption.trim()
  const parts = [body]
  if (contact && !body.includes(contact.split('\n')[0])) parts.push(contact)
  if (tags) parts.push(tags)
  return parts.filter(Boolean).join('\n\n')
}
