// Animated reel styles: the HTML templates in public/reel-templates/ turn a
// storyboard + narration into an animated 1080x1920 video. The same file
// plays as the live preview in the app and is rendered to MP4 by the
// GitHub Actions worker (reel-renderer/render.mjs). Plain constants and
// helpers — safe for server routes and the client.

export type ReelStyle = 'flat-poster' | 'pop-comic' | 'chalk-doodle' | 'golden-neon' | 'line-diagram' | 'whiteboard'

export const REEL_STYLES: Record<ReelStyle, { label: string; description: string }> = {
  'flat-poster': { label: 'Flat Poster', description: 'Bold flat shapes and hazard tape. Promos and product pushes.' },
  'pop-comic': { label: 'Pop Comic', description: 'Halftone dots, speech bubbles, POW stamps. Tips and humor.' },
  'chalk-doodle': { label: 'Chalk Doodle', description: 'Hand-drawn chalk on a dark board. How-tos and explainers.' },
  'golden-neon': { label: 'Golden Neon', description: 'Glowing gold on black. Sale nights and new arrivals.' },
  'line-diagram': { label: 'Line Diagram', description: 'Blueprint lines that draw themselves. Specs and comparisons.' },
  whiteboard: { label: 'Hand-drawn Explainer', description: 'A hand sketches and writes on a whiteboard. Lessons and how-tos.' },
}

export const isReelStyle = (s: unknown): s is ReelStyle => typeof s === 'string' && s in REEL_STYLES

export type SceneRole = 'hook' | 'product' | 'proof' | 'cta'

/** One scene per narration sentence. Times are seconds into the narration. */
export interface StoryboardScene {
  role: SceneRole
  /** What the narrator says during this scene (for staff reference). */
  spoken: string
  start: number
  /** 1–4 words, shown big. */
  headline: string
  sub?: string
  /** Short stamp word, e.g. "MATIBAY!" */
  stamp?: string
  /** Up to 3 short cards, e.g. ["By the bag", "Bulk"]. */
  items?: string[]
}

export interface Storyboard {
  version: 1
  scenes: StoryboardScene[]
  productName: string | null
  productImageUrl: string | null
}

/** What the templates read as window.REEL. */
export interface ReelData {
  style: ReelStyle
  durationSeconds: number
  /** Narration starts this many seconds into the video. */
  leadSeconds: number
  scenes: (StoryboardScene & { end: number })[]
  product: { name: string | null; imageUrl: string | null }
  cta: { site: string; phone: string | null }
  logoUrl: string
}

export const REEL_LEAD_SECONDS = 0.4
export const REEL_END_HOLD_SECONDS = 1.8
export const MAX_SCENES = 6

/**
 * Groups narration timepoints (caption chunks) into sentences: a chunk that
 * ends with . ! or ? closes a sentence. Merges the shortest neighbours until
 * there are at most MAX_SCENES.
 */
export function timepointsToSentences(timepoints: { text: string; start: number }[]): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = []
  let current: { text: string; start: number } | null = null
  for (const tp of timepoints) {
    if (!current) current = { text: tp.text.trim(), start: tp.start }
    else current.text = `${current.text} ${tp.text.trim()}`
    if (/[.!?…]["')\]]*$/.test(tp.text.trim())) {
      out.push(current)
      current = null
    }
  }
  if (current) out.push(current)
  while (out.length > MAX_SCENES) {
    let best = 0
    for (let i = 1; i < out.length - 1; i++) {
      if (out[i].text.length + out[i + 1].text.length < out[best].text.length + out[best + 1].text.length) best = i
    }
    out.splice(best, 2, { text: `${out[best].text} ${out[best + 1].text}`, start: out[best].start })
  }
  return out
}

/** Builds window.REEL for the templates from a saved storyboard. */
export function buildReelData(opts: {
  style: ReelStyle
  storyboard: Storyboard
  narrationSeconds: number
  site: string
  phone: string | null
  logoUrl: string
}): ReelData {
  const lead = REEL_LEAD_SECONDS
  const total = Math.round((lead + opts.narrationSeconds + REEL_END_HOLD_SECONDS) * 100) / 100
  const scenes = opts.storyboard.scenes.map((s, i, all) => ({
    ...s,
    // First scene starts at 0 so the video doesn't open on an empty frame.
    start: i === 0 ? 0 : Math.round((s.start + lead) * 100) / 100,
    end: i + 1 < all.length ? Math.round((all[i + 1].start + lead) * 100) / 100 : total,
  }))
  return {
    style: opts.style,
    durationSeconds: total,
    leadSeconds: lead,
    scenes,
    product: { name: opts.storyboard.productName, imageUrl: opts.storyboard.productImageUrl },
    cta: { site: opts.site, phone: opts.phone },
    logoUrl: opts.logoUrl,
  }
}

/** "+639458013640" / "09458013640" → "+63 945 801 3640"; anything else as typed. */
export function formatPhoneForReel(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  const digits = raw.replace(/\D/g, '')
  const local = digits.startsWith('63') && digits.length === 12 ? digits.slice(2)
    : digits.startsWith('09') && digits.length === 11 ? digits.slice(1)
    : null
  return local ? `+63 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}` : raw.trim()
}
