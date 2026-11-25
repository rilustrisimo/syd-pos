import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Insights are admin-only. Returns the user id, or a ready-to-return error response. */
export async function requireAdmin(
  supabase: SupabaseClient
): Promise<{ userId: string; error?: undefined } | { userId?: undefined; error: NextResponse }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  const { data } = await (supabase as any).from('users').select('role').eq('id', user.id).single()
  if (data?.role !== 'admin') return { error: NextResponse.json({ error: 'Admins only' }, { status: 403 }) }
  return { userId: user.id }
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
export function parseRange(url: URL, today: string) {
  const to = url.searchParams.get('to')
  const from = url.searchParams.get('from')
  const branch = url.searchParams.get('branch')
  const t = to && ISO.test(to) && to <= today ? to : today
  const f = from && ISO.test(from) && from <= t ? from : `${t.slice(0, 7)}-01`
  return { from: f, to: t, branchId: branch && /^[0-9a-f-]{36}$/i.test(branch) ? branch : null }
}
