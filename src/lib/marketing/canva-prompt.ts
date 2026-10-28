// Detailed Canva prompts for image/carousel posts. Gemini designs the post
// as a structured spec (background, image to create, every text element
// with its size/weight/color/placement, icons, accents), and the code turns
// it into the paste-ready prompt. The brand kit (colors, fonts, logo,
// margins, CTA strip) is fixed here rather than written by Gemini, and
// colors are picked from a named palette, so Canva gets exact hex codes
// and nothing off-brand can be invented. Plain constants — safe to import
// from server routes and the client.

import { BUSINESS_CONTEXT, CONTENT_RULES, AUDIENCE_BRIEFS } from '@/lib/marketing/brand'
import { CREATIVE_STYLES, type CreativeStyle } from '@/lib/marketing/creative-styles'
import type { ContentAudience, ContentFormat } from '@/hooks/useContentIdeas'

export const CANVA_CANVAS = { width: 1080, height: 1350 }

export const BRAND_PALETTE = {
  slate: { name: 'SYD dark slate', hex: '#0F172A' },
  yellow: { name: 'SYD yellow', hex: '#FFC107' },
  white: { name: 'White', hex: '#FFFFFF' },
  light_gray: { name: 'Light gray', hex: '#F1F5F9' },
  steel: { name: 'Steel gray', hex: '#64748B' },
} as const
export type BrandColor = keyof typeof BRAND_PALETTE
const COLOR_ENUM = Object.keys(BRAND_PALETTE) as BrandColor[]

const color = (c: BrandColor | string) => {
  const p = BRAND_PALETTE[c as BrandColor] ?? BRAND_PALETTE.white
  return `${p.name} ${p.hex}`
}

// Text roles with their font and allowed size range (px on a 1080-wide
// canvas). Gemini picks a size; it's clamped into the range.
const TEXT_ROLES = {
  headline: { font: 'Montserrat ExtraBold', min: 80, max: 120 },
  subheadline: { font: 'Montserrat Bold', min: 44, max: 60 },
  body: { font: 'Open Sans SemiBold', min: 32, max: 40 },
  label: { font: 'Montserrat Bold', min: 26, max: 34 },
  number: { font: 'Montserrat ExtraBold', min: 90, max: 160 },
  badge: { font: 'Montserrat ExtraBold', min: 28, max: 36 },
} as const
type TextRole = keyof typeof TEXT_ROLES

const BRAND_KIT = [
  `- Canvas: ${CANVA_CANVAS.width} x ${CANVA_CANVAS.height} px (4:5 portrait, Instagram/Facebook feed). Keep all text and the logo inside a 64 px safe margin.`,
  `- Colors (use ONLY these): ${Object.values(BRAND_PALETTE).map((p) => `${p.name} ${p.hex}`).join(', ')}. Yellow is for accents, highlights and the CTA strip — never more than about a third of the design.`,
  '- Fonts (both free in Canva): Montserrat (ExtraBold/Bold) for headlines, numbers and labels; Open Sans (SemiBold) for body text. No other fonts, no script or decorative fonts.',
  '- Logo: the SYD Construction Supplies logo from my Canva uploads/Brand Kit, top-left inside the safe margin, about 200 px wide, on a white rounded rectangle (12 px corners) when the background behind it is dark or busy. Do not redraw, recolor or generate a logo.',
  `- Footer CTA strip on every slide: full-width bar along the bottom, 150 px tall, ${color('yellow')} background, centered text "Request a quote at sydconstruct.com" in Montserrat Bold 40 px, ${color('slate')}.`,
  '- Style: clean, bold, high contrast, construction-industry feel (flat shapes, subtle diagonal stripes or a thin hazard-stripe accent are fine). Generous spacing, strong left alignment unless a slide says otherwise.',
].join('\n')

const ALWAYS_AVOID = [
  'any price, peso amount, discount, "sale" or promo percentage',
  'promises about delivery speed or dates ("agad", "same day", "by Saturday")',
  'invented customer names, quotes or reviews',
  'phone numbers, street addresses or opening hours',
  'text, letters or logos inside AI-generated images (they come out garbled) — all text is added as Canva text boxes',
  'other companies\' logos or watermarks',
  'extra fonts, gradients or colors outside the brand kit',
  'cartoon or clip-art people; distorted hands or faces',
]

// ── Layout patterns ─────────────────────────────────────────────
// Curated from construction / hardware and bold-type social designs on
// Behance, Dribbble, Pinterest and Canva/Vista/Envato templates (Oct 2026):
// type-led posts on a brand-color background, black-and-yellow carousels
// with highlight boxes, modular split layouts, real photos over polished
// stock. Gemini's free tier can't search the web, so the research lives
// here: each generation commits to one pattern, and a regenerate rotates
// to a different one so posts don't all look alike.

export type LayoutPattern =
  | 'type_led'
  | 'split_panel'
  | 'hero_cutout'
  | 'photo_overlay'
  | 'highlight_boxes'
  | 'numbered_cards'
  | 'grid_2x2'
  | 'before_after_split'
  | 'blueprint'
  | 'checklist_card'
  | 'connected_swipe'

export const LAYOUT_PATTERNS: Record<LayoutPattern, {
  label: string
  recipe: string
  /** Search words for the inspiration links. */
  search: string
  styles: CreativeStyle[]
  carouselOnly?: boolean
}> = {
  type_led: {
    label: 'Big type on brand color',
    recipe: 'Solid dark slate (or yellow) background; an oversized 2-4 line headline fills the top two-thirds and IS the visual; one key word in yellow; a small product cutout or icon bottom-right. Reads in one second at thumbnail size.',
    search: 'bold typography instagram post',
    styles: ['listicle', 'qa', 'pov', 'how_to', 'product_demo'],
  },
  split_panel: {
    label: 'Split panel',
    recipe: 'Canvas split vertically about 55/45: a full-height real photo on one side, a solid slate panel on the other holding the headline, 1-2 short lines and an icon row. A thin yellow vertical rule where they meet.',
    search: 'split layout product instagram post',
    styles: ['product_demo', 'types_of', 'customer_story', 'behind_the_scenes'],
  },
  hero_cutout: {
    label: 'Product hero with callouts',
    recipe: 'Light gray background with a diagonal yellow hazard-stripe band behind a large background-removed product cutout in the center; headline above; 2-3 benefit callouts in small slate pills connected to the product by thin lines.',
    search: 'product callout social media design',
    styles: ['product_demo', 'types_of', 'listicle'],
  },
  photo_overlay: {
    label: 'Real photo with dark overlay',
    recipe: 'Full-bleed real or realistic photo (store, yard, delivery, site); a slate overlay at about 60% over the bottom half only; white headline and one line bottom-left above the CTA strip. Raw, real-looking — not polished stock.',
    search: 'construction company instagram post photo',
    styles: ['behind_the_scenes', 'customer_story', 'pov', 'transition'],
  },
  highlight_boxes: {
    label: 'Editorial highlight boxes',
    recipe: 'White or slate background, brutalist/editorial: a huge condensed headline set left with 1-3 words sitting on yellow highlight boxes, lots of empty space, a small thin-line icon; optional tiny "SYD tip" label top-right.',
    search: 'black yellow brutalist instagram carousel',
    styles: ['qa', 'pov', 'listicle', 'how_to'],
  },
  numbered_cards: {
    label: 'Numbered cards',
    recipe: 'Each slide is a rounded light gray card (24 px corners) on a slate background; a giant yellow number ("01", "02"…) top-left of the card, the point as a headline, one short body line, an icon bottom-left of the card. Cover slide states the list.',
    search: 'numbered tips carousel instagram',
    styles: ['listicle', 'how_to', 'types_of'],
    carouselOnly: true,
  },
  grid_2x2: {
    label: '2x2 grid',
    recipe: 'A 2x2 grid of photos (8 px white gutters) covering the middle of the canvas, each with a small yellow label tag naming the use/type; headline in a slate band above the grid.',
    search: 'grid collage instagram post construction',
    styles: ['types_of', 'behind_the_scenes', 'listicle'],
  },
  before_after_split: {
    label: 'Before / after split',
    recipe: 'Two photos stacked top/bottom (or one per slide) separated by a diagonal yellow divider; "BEFORE" and "AFTER" tags in slate pills; short headline on the divider or above.',
    search: 'before after renovation instagram post',
    styles: ['before_after', 'transition', 'customer_story'],
  },
  blueprint: {
    label: 'Blueprint',
    recipe: 'Dark slate background with a faint light grid (blueprint/graph paper) texture; technical-drawing feel: thin white outline illustration or cutout of the material, dimension-style labels and arrows in yellow, headline top-left.',
    search: 'blueprint style social media design construction',
    styles: ['how_to', 'qa', 'types_of', 'product_demo'],
  },
  checklist_card: {
    label: 'Checklist card',
    recipe: 'Light gray background with a white "materials checklist" card (soft shadow, rounded) taking the center; 3-5 rows each with a yellow check-circle icon and a short item; headline above the card. Shows "everything in one quote".',
    search: 'checklist instagram post design',
    styles: ['listicle', 'how_to', 'qa', 'customer_story'],
  },
  connected_swipe: {
    label: 'Connected swipe',
    recipe: 'Carousel designed as one long panorama: a thick yellow line/arrow and shapes run across slide edges so each swipe continues the last; alternating slate and light gray backgrounds; one idea per slide.',
    search: 'seamless carousel instagram design',
    styles: ['transition', 'how_to', 'before_after', 'listicle'],
    carouselOnly: true,
  },
}

export const LAYOUT_PATTERN_KEYS = Object.keys(LAYOUT_PATTERNS) as LayoutPattern[]

export function isLayoutPattern(v: unknown): v is LayoutPattern {
  return typeof v === 'string' && v in LAYOUT_PATTERNS
}

/** The pattern a saved prompt was built with (from its "Layout pattern:" line). */
export function layoutPatternOf(prompt: string | null | undefined): LayoutPattern | null {
  const label = prompt?.match(/^Layout pattern: (.+)$/m)?.[1]?.trim()
  return LAYOUT_PATTERN_KEYS.find((k) => LAYOUT_PATTERNS[k].label === label) ?? null
}

/** A pattern that suits the style/format, different from the previous one. */
export function pickLayoutPattern(format: ContentFormat, style: CreativeStyle | null, previous: LayoutPattern | null): LayoutPattern {
  const usable = LAYOUT_PATTERN_KEYS.filter((k) => k !== previous && (format === 'carousel' || !LAYOUT_PATTERNS[k].carouselOnly))
  const suited = style ? usable.filter((k) => LAYOUT_PATTERNS[k].styles.includes(style)) : []
  const pool = suited.length ? suited : usable
  return pool[Math.floor(Math.random() * pool.length)]
}

/** Search links for seeing real designs like this one (opened by staff). */
export function inspirationLinks(pattern: LayoutPattern | null, subject: string): { site: string; url: string }[] {
  const q = `${subject} ${pattern ? LAYOUT_PATTERNS[pattern].search : 'construction instagram post'}`.replace(/\s+/g, ' ').trim()
  const e = encodeURIComponent(q)
  return [
    { site: 'Behance', url: `https://www.behance.net/search/projects?search=${e}` },
    { site: 'Dribbble', url: `https://dribbble.com/search/${encodeURIComponent(q.replace(/ /g, '-'))}` },
    { site: 'Pinterest', url: `https://www.pinterest.com/search/pins/?q=${e}` },
    { site: 'Freepik', url: `https://www.freepik.com/search?format=search&query=${e}` },
    { site: 'Canva templates', url: `https://www.canva.com/templates/?query=${e}` },
  ]
}

// ── Gemini spec ─────────────────────────────────────────────────

export interface CanvaTextElement {
  role: TextRole
  text: string
  size_px: number
  color: BrandColor
  highlight: BrandColor | 'none'
  placement: string
  max_lines: number
}

export interface CanvaSlide {
  purpose: string
  background: string
  background_color: BrandColor
  image_kind: 'product_photo' | 'ai_image' | 'stock_photo' | 'none'
  image_description: string
  image_placement: string
  texts: CanvaTextElement[]
  icons: { icon: string; color: BrandColor; size_px: number; placement: string }[]
  accents: string
}

export interface CanvaSpec {
  concept: string
  layout_idea: string
  slides: CanvaSlide[]
  avoid: string[]
}

const TEXT_ROLE_ENUM = Object.keys(TEXT_ROLES)

export const CANVA_SPEC_SCHEMA = {
  type: 'OBJECT',
  properties: {
    concept: { type: 'STRING', description: 'The design idea in one sentence: what the viewer sees first and why it stops the scroll.' },
    layout_idea: { type: 'STRING', description: 'The overall composition shared by all slides (grid, where the image sits, where text sits), one or two sentences.' },
    slides: {
      type: 'ARRAY',
      description: 'Single image = exactly 1 slide. Carousel = 3-6 slides following the creative style.',
      items: {
        type: 'OBJECT',
        properties: {
          purpose: { type: 'STRING', description: 'What this slide does, e.g. "Hook", "Point 2", "Answer", "CTA".' },
          background: { type: 'STRING', description: 'Background treatment in concrete terms: solid color, color block split (with percentages), photo full-bleed with a dark overlay at N% opacity, subtle texture (concrete, plywood grain) etc.' },
          background_color: { type: 'STRING', enum: COLOR_ENUM },
          image_kind: { type: 'STRING', enum: ['product_photo', 'ai_image', 'stock_photo', 'none'], description: 'product_photo = SYD\'s real photo of the featured product; ai_image = generate with Canva AI; stock_photo = search Canva photos.' },
          image_description: { type: 'STRING', description: 'For ai_image: a full image-generation prompt (subject, setting in rural Bukidnon/Philippines, camera angle, lighting, realistic photo style, "no text"). For stock_photo: Canva search words. For product_photo: how to crop/cut out and show it. Empty for none.' },
          image_placement: { type: 'STRING', description: 'Where the image sits and how big: e.g. "right half, x 540-1080, y 200-1200, background removed, slight drop shadow". Empty for none.' },
          texts: {
            type: 'ARRAY',
            description: 'Every text element on the slide, top to bottom. Headline max 7 words. Under 25 words per slide in total (the CTA strip is added automatically — do not include it).',
            items: {
              type: 'OBJECT',
              properties: {
                role: { type: 'STRING', enum: TEXT_ROLE_ENUM },
                text: { type: 'STRING', description: 'The exact words, taglish allowed. No prices, phone numbers or addresses.' },
                size_px: { type: 'INTEGER', description: 'Font size in px: headline 80-120, subheadline 44-60, body 32-40, label 26-34, number 90-160, badge 28-36.' },
                color: { type: 'STRING', enum: COLOR_ENUM },
                highlight: { type: 'STRING', enum: [...COLOR_ENUM, 'none'], description: 'Highlight box/marker behind the text, or none.' },
                placement: { type: 'STRING', description: 'Exact position: zone plus approximate coordinates, alignment, e.g. "top-left under the logo, x 64, y 220, left aligned, width 620 px".' },
                max_lines: { type: 'INTEGER' },
              },
              required: ['role', 'text', 'size_px', 'color', 'highlight', 'placement', 'max_lines'],
              propertyOrdering: ['role', 'text', 'size_px', 'color', 'highlight', 'placement', 'max_lines'],
            },
          },
          icons: {
            type: 'ARRAY',
            description: '0-4 simple icons. Name each as a Canva Elements search, e.g. "delivery truck line icon", "check circle icon", "hard hat icon".',
            items: {
              type: 'OBJECT',
              properties: {
                icon: { type: 'STRING' },
                color: { type: 'STRING', enum: COLOR_ENUM },
                size_px: { type: 'INTEGER' },
                placement: { type: 'STRING' },
              },
              required: ['icon', 'color', 'size_px', 'placement'],
              propertyOrdering: ['icon', 'color', 'size_px', 'placement'],
            },
          },
          accents: { type: 'STRING', description: 'Shapes and details: dividers, corner hazard stripes, rounded panels, number circles, arrows, swipe hint ("Swipe →") on carousel slides except the last. Empty if none.' },
        },
        required: ['purpose', 'background', 'background_color', 'image_kind', 'image_description', 'image_placement', 'texts', 'icons', 'accents'],
        propertyOrdering: ['purpose', 'background', 'background_color', 'image_kind', 'image_description', 'image_placement', 'texts', 'icons', 'accents'],
      },
    },
    avoid: { type: 'ARRAY', items: { type: 'STRING' }, description: '2-4 design mistakes specific to this post to avoid.' },
  },
  required: ['concept', 'layout_idea', 'slides', 'avoid'],
  propertyOrdering: ['concept', 'layout_idea', 'slides', 'avoid'],
}

export const CANVA_DESIGNER_SYSTEM = `You are the senior graphic designer for SYD Construction Supplies.
You turn a post idea into an exact Canva design spec that a staff member
(or Canva AI) can build without guessing: every element has its words,
size, color and position. Designs are bold and simple, readable on a phone
in one second, and look like a trustworthy local hardware store — not a
generic template.

${BUSINESS_CONTEXT}

${CONTENT_RULES}

Brand kit (fixed — the logo and CTA strip are added for you):
${BRAND_KIT}

Coordinates: x 0-1080 left to right, y 0-1350 top to bottom. The logo
takes about x 64-264, y 64-150; the CTA strip takes y 1200-1350 — keep
other elements clear of both. Stack text without overlaps: an element's
y must be at least the previous element's y + max_lines x size_px x 1.2 +
24 px. Headlines are 7 words or fewer.`

export interface CanvaPostContext {
  title: string
  format: ContentFormat
  audience: ContentAudience | null
  creative_style: CreativeStyle | null
  angle?: string | null
  description?: string | null
  image_concept?: string | null
  caption?: string | null
  product?: { name: string; category: string | null; hasPhoto: boolean } | null
  previous_prompt?: string | null
  pattern: LayoutPattern
}

export function canvaSpecPrompt(ctx: CanvaPostContext): string {
  const style = ctx.creative_style ? CREATIVE_STYLES[ctx.creative_style] : null
  return [
    'POST TO DESIGN:',
    `Title: ${ctx.title}`,
    `Format: ${ctx.format === 'carousel' ? 'carousel (3-6 slides)' : 'single image (exactly 1 slide)'}`,
    ctx.audience ? `Audience: ${AUDIENCE_BRIEFS[ctx.audience]}` : '',
    style ? `Creative style: ${style.label} — ${style.recipe} As an image/carousel: ${style.still}` : '',
    ctx.angle ? `Angle / hook: ${ctx.angle}` : '',
    ctx.description ? `What it shows and says: ${ctx.description}` : '',
    ctx.image_concept ? `Visual idea: ${ctx.image_concept}` : '',
    ctx.caption ? `Post caption (the design must match it, not repeat it): ${ctx.caption}` : '',
    ctx.product
      ? `Featured product: ${ctx.product.name}${ctx.product.category ? ` (${ctx.product.category})` : ''}. ${ctx.product.hasPhoto ? 'SYD has a real photo of it — use image_kind product_photo for the hero image.' : 'No real photo on file — use ai_image or stock_photo that shows this exact product type realistically.'}`
      : '',
    `\nLAYOUT PATTERN (required — build every slide on it, adapted to the brand kit): ${LAYOUT_PATTERNS[ctx.pattern].label} — ${LAYOUT_PATTERNS[ctx.pattern].recipe}`,
    ctx.previous_prompt ? `\nThis is a REGENERATION. The previous design is below — use different background treatments, images and headline wording while keeping the same message:\n${ctx.previous_prompt.slice(0, 1500)}` : '',
    '',
    'Design it. Use real Canva-buildable elements only. Size text so it fits its max_lines at that size on a 1080 px canvas.',
  ].filter(Boolean).join('\n')
}

// ── Spec → paste-ready prompt ───────────────────────────────────

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(Math.round(n) || min, min), max)

function textLine(t: CanvaTextElement, i: number): string {
  const role = TEXT_ROLES[t.role] ?? TEXT_ROLES.body
  const size = clamp(t.size_px, role.min, role.max)
  const highlight = t.highlight && t.highlight !== 'none' ? `, on a ${color(t.highlight)} highlight box` : ''
  return `  ${i + 1}. ${t.role.toUpperCase()}: "${t.text.trim()}" — ${role.font}, ${size} px, ${color(t.color)}${highlight}; ${t.placement}; max ${clamp(t.max_lines, 1, 4)} line${t.max_lines === 1 ? '' : 's'}.`
}

const IMAGE_KIND_LABEL: Record<CanvaSlide['image_kind'], string> = {
  product_photo: 'Product photo (use SYD\'s real photo — upload it to Canva; remove background if it helps)',
  ai_image: 'AI image (generate in Canva AI / Magic Media, realistic photo style, NO text in the image)',
  stock_photo: 'Stock photo (search in Canva Photos)',
  none: 'No photo',
}

export function formatCanvaPrompt(spec: CanvaSpec, ctx: Pick<CanvaPostContext, 'format' | 'title' | 'pattern'>): string {
  const slides = ctx.format === 'carousel' ? spec.slides.slice(0, 6) : spec.slides.slice(0, 1)
  const out: string[] = [
    `CANVA DESIGN — ${ctx.format === 'carousel' ? `Carousel, ${slides.length} slides` : 'Single image post'}, ${CANVA_CANVAS.width} x ${CANVA_CANVAS.height} px`,
    `Post: ${ctx.title}`,
    `Concept: ${spec.concept}`,
    `Layout pattern: ${LAYOUT_PATTERNS[ctx.pattern].label}`,
    `Layout: ${spec.layout_idea}`,
    '',
    'BRAND KIT (follow exactly):',
    BRAND_KIT,
  ]
  slides.forEach((s, i) => {
    out.push('', ctx.format === 'carousel' ? `SLIDE ${i + 1} of ${slides.length} — ${s.purpose}` : `DESIGN — ${s.purpose}`)
    out.push(`Background: ${s.background} (base color ${color(s.background_color)}).`)
    if (s.image_kind !== 'none' && s.image_description.trim()) {
      out.push(`Image — ${IMAGE_KIND_LABEL[s.image_kind]}: ${s.image_description.trim()}`)
      if (s.image_placement.trim()) out.push(`Image placement: ${s.image_placement.trim()}`)
    }
    out.push('Logo: SYD logo top-left (brand kit).')
    if (s.texts.length) {
      out.push('Text, top to bottom:')
      s.texts.forEach((t, j) => out.push(textLine(t, j)))
    }
    if (s.icons.length) {
      out.push('Icons (Canva Elements):')
      for (const ic of s.icons.slice(0, 4)) out.push(`  - "${ic.icon}", ${color(ic.color)}, ${clamp(ic.size_px, 32, 200)} px, ${ic.placement}`)
    }
    if (s.accents.trim()) out.push(`Accents: ${s.accents.trim()}`)
    out.push('Footer: yellow CTA strip — "Request a quote at sydconstruct.com" (brand kit).')
  })
  out.push('', 'AVOID:')
  for (const a of [...spec.avoid, ...ALWAYS_AVOID]) out.push(`- ${a}`)
  return out.join('\n')
}
