import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Admin/manager check used by the marketing API routes. Returns the user
 * id, or a ready-to-return error response.
 */
export async function requireMarketingStaff(
  supabase: SupabaseClient
): Promise<{ userId: string; error?: undefined } | { userId?: undefined; error: NextResponse }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  const { data: staffUser } = await (supabase as any)
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single() as { data: { role: string } | null }
  if (!staffUser || !['admin', 'manager'].includes(staffUser.role)) {
    return { error: NextResponse.json({ error: 'Not authorized' }, { status: 403 }) }
  }
  return { userId: user.id }
}
