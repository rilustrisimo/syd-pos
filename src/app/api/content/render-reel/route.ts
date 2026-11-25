/**
 * POST /api/content/render-reel  { suggestion_id, style, storyboard, narration_seconds? }
 *
 * Queues an animated reel render: saves the storyboard, inserts a
 * reel_render_jobs row with the exact template data (window.REEL), and starts
 * the GitHub Actions workflow (.github/workflows/render-reel.yml) that renders
 * it and attaches the MP4 to the post. The dialog then polls the job row.
 *
 * Needs GITHUB_REEL_TOKEN (fine-grained token, Actions: read & write on the
 * repo) and GITHUB_REEL_REPO ("owner/repo") on the server.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireMarketingStaff } from '@/lib/marketing/staff-auth'
import { buildReelData, formatPhoneForReel, isReelStyle, sanitizeStoryboard, MAX_SCENES } from '@/lib/marketing/reel-styles'

/** Keeps GitHub Actions inside the free 2,000 min/month (~2 min per render). */
const MAX_RENDERS_PER_MONTH = 300
const SITE = 'sydconstruct.com'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const auth = await requireMarketingStaff(supabase)
    if (auth.error) return auth.error
    const db = supabase as any

    const body = await request.json() as { suggestion_id?: string; style?: string; storyboard?: unknown; narration_seconds?: number }
    if (!body.suggestion_id) return NextResponse.json({ error: 'suggestion_id is required' }, { status: 400 })
    if (!isReelStyle(body.style)) return NextResponse.json({ error: 'Pick a style' }, { status: 400 })
    const storyboard = sanitizeStoryboard(body.storyboard)
    if (!storyboard) return NextResponse.json({ error: `The storyboard needs 1–${MAX_SCENES} scenes` }, { status: 400 })

    const { data: suggestion } = await db
      .from('content_suggestions')
      .select('id, voice_media_id, voice:content_media!content_suggestions_voice_media_id_fkey(storage_key, duration_seconds)')
      .eq('id', body.suggestion_id)
      .single()
    if (!suggestion?.voice_media_id || !suggestion.voice?.storage_key) {
      return NextResponse.json({ error: 'Make the narration first — the animation is timed to it.' }, { status: 400 })
    }
    const narrationSeconds = Number(suggestion.voice.duration_seconds) || Number(body.narration_seconds)
    if (!(narrationSeconds > 0 && narrationSeconds <= 120)) {
      return NextResponse.json({ error: 'Could not tell how long the narration is — reload and try again.' }, { status: 400 })
    }

    // Free-tier guard and one render at a time per post.
    const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0)
    const { count: thisMonth } = await db.from('reel_render_jobs')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'failed')
      .gte('created_at', monthStart.toISOString())
    if ((thisMonth ?? 0) >= MAX_RENDERS_PER_MONTH) {
      return NextResponse.json({ error: `Monthly limit of ${MAX_RENDERS_PER_MONTH} animated reels reached (keeps rendering free). It resets on the 1st.` }, { status: 429 })
    }
    const { data: active } = await db.from('reel_render_jobs')
      .select('id').eq('suggestion_id', body.suggestion_id).in('status', ['queued', 'rendering'])
      .gte('created_at', new Date(Date.now() - 20 * 60 * 1000).toISOString()).limit(1)
    if (active?.length) return NextResponse.json({ error: 'This post already has a reel rendering — wait for it to finish.' }, { status: 409 })

    const { data: shop } = await db.from('shop_settings').select('store_phone').limit(1).maybeSingle()
    const reelData = buildReelData({
      style: body.style,
      storyboard,
      narrationSeconds,
      site: SITE,
      phone: formatPhoneForReel(shop?.store_phone),
      logoUrl: '../syd-logo.svg',
    })

    await db.from('content_suggestions').update({ reel_storyboard: storyboard }).eq('id', body.suggestion_id)
    const { data: job, error: jobErr } = await db.from('reel_render_jobs').insert({
      suggestion_id: body.suggestion_id,
      style: body.style,
      storyboard,
      reel_data: reelData,
      voice_media_id: suggestion.voice_media_id,
      voice_storage_key: suggestion.voice.storage_key,
      created_by: auth.userId,
    }).select('*').single()
    if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 })

    // Start the renderer.
    const token = process.env.GITHUB_REEL_TOKEN
    const repo = process.env.GITHUB_REEL_REPO
    let dispatchError: string | null = null
    if (!token || !repo) {
      dispatchError = 'Animated reels are not set up yet (GITHUB_REEL_TOKEN / GITHUB_REEL_REPO missing on the server).'
    } else {
      const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/render-reel.yml/dispatches`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'main', inputs: { job_id: job.id } }),
      })
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 200)
        console.error('[render-reel] GitHub dispatch failed', res.status, detail)
        dispatchError = res.status === 401 || res.status === 403
          ? 'GitHub refused the render request — the token may be expired or missing Actions permission.'
          : `Could not start the renderer (GitHub HTTP ${res.status}).`
      }
    }
    if (dispatchError) {
      await db.from('reel_render_jobs').update({ status: 'failed', error: dispatchError, finished_at: new Date().toISOString() }).eq('id', job.id)
      return NextResponse.json({ error: dispatchError, job: { ...job, status: 'failed', error: dispatchError } }, { status: 502 })
    }

    return NextResponse.json({ job })
  } catch (err: any) {
    console.error('[render-reel]', err)
    return NextResponse.json({ error: err?.message || 'Failed to start the render' }, { status: 500 })
  }
}
