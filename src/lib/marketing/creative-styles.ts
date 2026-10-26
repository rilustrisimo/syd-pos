// Creative styles — HOW a post or ad is made, the third dimension next to
// audience (who) and angle/proof (what). Meta's creative-differentiation
// guidance: if creatives look too alike, delivery treats them as one
// ("Creative limited" / "Creative fatigue"), so styles are rotated for
// daily posts as well as ads. The first six come from Meta's own list of
// reel prompts; the last four are ours (Meta's page hides the rest).
// Plain constants — safe for server routes and the client.

export type CreativeStyle =
  | 'listicle'
  | 'types_of'
  | 'transition'
  | 'qa'
  | 'product_demo'
  | 'pov'
  | 'before_after'
  | 'behind_the_scenes'
  | 'customer_story'
  | 'how_to'

export interface CreativeStyleSpec {
  label: string
  recipe: string
  /** How to build it as a reel (shot list guidance). */
  reel: string
  /** How to build it as an image/carousel (Canva prompt guidance). */
  still: string
  source: 'meta' | 'syd'
}

export const CREATIVE_STYLES: Record<CreativeStyle, CreativeStyleSpec> = {
  listicle: {
    label: 'Listicle',
    recipe: 'A numbered list ("3 things to check before…"), each point shown as a bold on-screen text sticker.',
    reel: '3-5 shots, one per list point; each shot gets a numbered text sticker ("1. …").',
    still: 'Carousel with one numbered point per slide, or one image with a short numbered list.',
    source: 'meta',
  },
  types_of: {
    label: '"Types of"',
    recipe: 'One product shown in different situations or uses ("4 jobs for one bag of cement").',
    reel: '4-6 shots, each a different use or situation; sticker names the use.',
    still: 'Carousel: one use per slide with the same product, or a 2x2 grid image.',
    source: 'meta',
  },
  transition: {
    label: 'Transition',
    recipe: 'Fast jump or swipe cuts between clips (about 1 second each) — energetic, no talking head.',
    reel: '8-12 very short shots (about 1s each) cut to the voiceover; stickers optional.',
    still: 'Carousel that "swipes" through a sequence (raw materials → delivery → finished build).',
    source: 'meta',
  },
  qa: {
    label: 'Q&A',
    recipe: 'A real customer question answered ("Pwede ba i-deliver sa farm?").',
    reel: 'First shot shows the question as a big sticker; the rest answer it.',
    still: 'Slide 1 the question in big text; next slides the answer.',
    source: 'meta',
  },
  product_demo: {
    label: 'Product demo',
    recipe: 'The product shown in use, close up and hands-on.',
    reel: '4-6 shots of the product being handled/used; stickers name the key benefit.',
    still: 'Close-up product photo with 2-3 short benefit callouts.',
    source: 'meta',
  },
  pov: {
    label: 'POV',
    recipe: 'A relatable first-person moment ("POV: you need materials for your piggery by Saturday").',
    reel: 'Opens on a "POV: …" sticker, then shows the situation being solved.',
    still: 'Single image with a big "POV: …" headline over a relatable scene.',
    source: 'meta',
  },
  before_after: {
    label: 'Before / after',
    recipe: 'A space or project before and after (bare lot → walls up, rough wall → skim coat).',
    reel: 'Shot 1 "Before" sticker, last shot "After"; middle shows the work/materials.',
    still: 'Split image or 2-slide carousel labelled Before / After.',
    source: 'syd',
  },
  behind_the_scenes: {
    label: 'Behind the scenes',
    recipe: 'The real store: the yard, stock, staff loading the truck, a delivery leaving.',
    reel: '5-7 candid shots from the store and yard; stickers optional.',
    still: 'Candid photo of the yard or truck with a short caption overlay.',
    source: 'syd',
  },
  customer_story: {
    label: 'Customer story',
    recipe: 'A real delivery or finished project, told from the customer side.',
    reel: 'Arrival of the delivery → the project → the result; sticker with the project type.',
    still: 'Photo of the delivered materials or finished build with a short quote-style headline.',
    source: 'syd',
  },
  how_to: {
    label: 'How-to',
    recipe: 'Steps or a quick tip (how ordering works, how much sand for a slab).',
    reel: 'One shot per step with a "Step 1/2/3" sticker.',
    still: 'Carousel with one step per slide.',
    source: 'syd',
  },
}

export const CREATIVE_STYLE_KEYS = Object.keys(CREATIVE_STYLES) as CreativeStyle[]

export function isCreativeStyle(value: unknown): value is CreativeStyle {
  return typeof value === 'string' && value in CREATIVE_STYLES
}

/** Accepts the keys or labels people type in a CSV ("Q&A", "before/after"). */
export function parseCreativeStyle(value: string | undefined): CreativeStyle | null {
  const v = value?.trim().toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_+|_+$/g, '') ?? ''
  if (!v) return null
  if (isCreativeStyle(v)) return v
  if (v === 'q_a' || v === 'qna') return 'qa'
  if (v.startsWith('before')) return 'before_after'
  if (v.startsWith('behind') || v === 'bts') return 'behind_the_scenes'
  if (v.startsWith('demo')) return 'product_demo'
  if (v.startsWith('list')) return 'listicle'
  if (v.startsWith('types')) return 'types_of'
  if (v.startsWith('customer') || v.startsWith('testimonial')) return 'customer_story'
  if (v.startsWith('how') || v.startsWith('tutorial')) return 'how_to'
  return null
}

/** Text block describing all styles, for Gemini prompts. */
export function creativeStylesBrief(): string {
  return CREATIVE_STYLE_KEYS.map((k) => {
    const s = CREATIVE_STYLES[k]
    return `- ${k} (${s.label}): ${s.recipe} Reel: ${s.reel} Image/carousel: ${s.still}`
  }).join('\n')
}
