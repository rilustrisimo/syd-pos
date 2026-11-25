// Animated reel styles: the HTML templates in public/reel-templates/ turn a
// storyboard + narration into an animated 1080x1920 video. The same file
// plays as the live preview in the app and is rendered to MP4 by the
// GitHub Actions worker (reel-renderer/render.mjs). Plain constants and
// helpers — safe for server routes and the client.

import { isCastId, type CastId } from '@/lib/marketing/cast'

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

export type SceneRole = 'hook' | 'problem' | 'solution' | 'product' | 'proof' | 'cta'
export const SCENE_ROLES: SceneRole[] = ['hook', 'problem', 'solution', 'product', 'proof', 'cta']

// Characters and props drawn by public/reel-templates/_cast.js and _props.js
// (keep the ids in sync). The cast itself is in lib/marketing/cast.ts.
export const POSES = ['stand', 'walk', 'point', 'think', 'worried', 'happy', 'carry', 'shrug', 'thumbs_up', 'phone'] as const
export type Pose = (typeof POSES)[number]
export const MOODS = ['worried', 'happy', 'surprised', 'thinking'] as const
export type Mood = (typeof MOODS)[number]
export const PROP_IDS = [
  'gi_sheet', 'gi_pipe', 'cyclone_wire', 'tie_wire', 'hollow_block', 'cement_bag', 'sand', 'gravel', 'rebar', 'plywood',
  'board', 'lumber', 'wall', 'tiles', 'angle_bar', 'purlin', 'door',
  'paint_can', 'paint_roller', 'sealant', 'pvc_pipe', 'faucet', 'electrical_wire', 'bulb',
  'nails', 'hammer', 'shovel', 'wheelbarrow', 'truck', 'house', 'roof', 'fence',
  'pig', 'chicken', 'rain_cloud', 'sun', 'water_drop', 'crack', 'rust', 'phone',
] as const
export type PropId = (typeof PROP_IDS)[number]

export interface SceneCharacter {
  cast: CastId
  pose: Pose
  mood?: Mood
}

/** Product name → the prop that draws it (product scene without a photo). */
const PRODUCT_PROP_RULES: [RegExp, PropId][] = [
  // Most specific first (e.g. "angle bar" before the generic "bar" of rebar).
  [/cyclone|chicken wire|wire mesh/i, 'cyclone_wire'],
  [/tie wire|alambre|g\.?i\.? ?wire/i, 'tie_wire'],
  [/thhn|electrical wire|royal cord|\bpdx\b|\bwire #?\d/i, 'electrical_wire'],
  [/angle ?bar/i, 'angle_bar'],
  [/purlin|c-?channel/i, 'purlin'],
  [/g\.?i\.? ?(tube|pipe)|steel pipe|tubular/i, 'gi_pipe'],
  [/g\.?i\.? ?sheet|roofing|yero|corrugated|pre-?painted/i, 'gi_sheet'],
  [/hollow ?block|chb/i, 'hollow_block'],
  [/tile/i, 'tiles'],
  [/skim ?coat|putty/i, 'wall'],
  [/cement|semento/i, 'cement_bag'],
  [/gravel|graba|aggregate|crushed|escombro/i, 'gravel'],
  [/\bsand\b|buhangin/i, 'sand'],
  [/deformed|rebar|bar\b/i, 'rebar'],
  [/plywood|marine/i, 'plywood'],
  [/hardiflex|fiber ?cement|ficem|gypsum|\bboard\b/i, 'board'],
  [/lumber|kahoy|coco|\b2 ?x ?\d/i, 'lumber'],
  [/\bdoor\b|pinto/i, 'door'],
  [/roller|brush/i, 'paint_roller'],
  [/paint|primer|enamel|elastomeric|latex/i, 'paint_can'],
  [/sealant|silicone|vulcaseal|caulk|epoxy/i, 'sealant'],
  [/faucet|gripo|shower|\btap\b/i, 'faucet'],
  [/bulb|\bled\b|lamp|light/i, 'bulb'],
  [/pvc|ppr|pipe|fitting/i, 'pvc_pipe'],
  [/nail|screw|bolt/i, 'nails'],
  [/hammer/i, 'hammer'],
  [/shovel|pala/i, 'shovel'],
  [/wheelbarrow|kartilya/i, 'wheelbarrow'],
]
export function propForProduct(name: string | null | undefined): PropId | null {
  if (!name) return null
  return PRODUCT_PROP_RULES.find(([re]) => re.test(name))?.[1] ?? null
}

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
  /** A cast member acting out this scene. */
  character?: SceneCharacter
  /** Up to 3 objects tied to what's said (drawn in the style). */
  props?: PropId[]
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
  product: { name: string | null; imageUrl: string | null; prop: PropId | null }
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
    product: { name: opts.storyboard.productName, imageUrl: opts.storyboard.productImageUrl, prop: propForProduct(opts.storyboard.productName) },
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

/**
 * Cleans a storyboard from Gemini or the browser: known roles, cast, poses,
 * moods and props only; text trimmed to the template limits.
 */
export function sanitizeStoryboard(raw: unknown): Storyboard | null {
  const r = raw as { scenes?: unknown[]; productName?: unknown; productImageUrl?: unknown } | null
  if (!r || !Array.isArray(r.scenes) || r.scenes.length === 0 || r.scenes.length > MAX_SCENES) return null
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const scenes: StoryboardScene[] = []
  for (const item of r.scenes) {
    const s = item as Record<string, unknown>
    const start = Number(s?.start)
    if (!Number.isFinite(start) || start < 0) return null
    const items = Array.isArray(s.items) ? s.items.map((x) => text(x, 40)).filter(Boolean).slice(0, 3) : []
    const ch = s.character as Record<string, unknown> | undefined
    const character: SceneCharacter | undefined = ch && isCastId(ch.cast)
      ? {
          cast: ch.cast,
          pose: (POSES as readonly string[]).includes(String(ch.pose)) ? (ch.pose as Pose) : 'stand',
          ...((MOODS as readonly string[]).includes(String(ch.mood)) ? { mood: ch.mood as Mood } : {}),
        }
      : undefined
    const props = Array.isArray(s.props)
      ? [...new Set(s.props.filter((p): p is PropId => (PROP_IDS as readonly string[]).includes(String(p))))].slice(0, 3)
      : []
    scenes.push({
      role: (SCENE_ROLES as string[]).includes(String(s.role)) ? (s.role as SceneRole) : 'proof',
      spoken: text(s.spoken, 300),
      start,
      headline: text(s.headline, 60) || ' ',
      ...(text(s.sub, 60) ? { sub: text(s.sub, 60) } : {}),
      ...(text(s.stamp, 20) ? { stamp: text(s.stamp, 20) } : {}),
      ...(items.length ? { items } : {}),
      ...(character ? { character } : {}),
      ...(props.length ? { props } : {}),
    })
  }
  scenes.sort((a, b) => a.start - b.start)
  return {
    version: 1,
    scenes,
    productName: text(r.productName, 80) || null,
    productImageUrl: typeof r.productImageUrl === 'string' && /^https:\/\//.test(r.productImageUrl) ? r.productImageUrl : null,
  }
}
