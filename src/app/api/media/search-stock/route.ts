/**
 * GET /api/media/search-stock?q=...
 *
 * Searches Pexels, Pixabay, and Unsplash in parallel and returns a
 * combined, normalized result list for the Marketing > Library
 * "Search Stock" tab. Keys stay server-side (PEXELS_API_KEY,
 * PIXABAY_API_KEY, UNSPLASH_ACCESS_KEY) — see src/lib/marketing/stock-providers.ts.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { searchPexels, searchPixabay, searchUnsplash } from '@/lib/marketing/stock-providers'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: staffUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single() as { data: { role: string } | null }

    if (!staffUser || !['admin', 'manager'].includes(staffUser.role)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const q = new URL(request.url).searchParams.get('q')?.trim()
    if (!q) {
      return NextResponse.json({ error: 'q is required' }, { status: 400 })
    }

    const [pexels, pixabay, unsplash] = await Promise.all([
      searchPexels(q),
      searchPixabay(q),
      searchUnsplash(q),
    ])

    return NextResponse.json({ results: [...pexels, ...pixabay, ...unsplash] })
  } catch (err: any) {
    console.error('[search-stock]', err)
    return NextResponse.json({ error: err?.message || 'Failed to search stock media' }, { status: 500 })
  }
}
