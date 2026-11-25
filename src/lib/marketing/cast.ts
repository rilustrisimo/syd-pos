// The recurring cast for story posts and animated reels. Same people every
// time so followers start to recognize them. Drawn as stick-style figures
// in every reel style (public/reel-templates/_cast.js uses the same ids).
// Names are easy to change here — the AI prompts read them from this list.

export type CastId = 'ramon' | 'joy' | 'ben' | 'lyn'

export interface CastMember {
  id: CastId
  name: string
  role: string
  /** What they wear in the drawings (keep in sync with _cast.js accessories). */
  look: string
  /** The kind of stories they're in. */
  stories: string
}

export const CAST: CastMember[] = [
  { id: 'ramon', name: 'Mang Ramon', role: 'farmer (piggery and poultry in Talakag)', look: 'straw hat', stories: 'pig pens, poultry houses, farm fences, farm roofing, rainy-season farm problems' },
  { id: 'joy', name: 'Engr. Joy', role: 'contractor / site engineer', look: 'hard hat', stories: 'slabs, columns, bulk orders, mixing ratios, project timelines, delivery to site' },
  { id: 'ben', name: 'Kuya Ben', role: 'homeowner building or repairing his family house', look: 'cap', stories: 'roof leaks, small repairs, first house, budget, DIY fixes' },
  { id: 'lyn', name: 'Ate Lyn', role: 'SYD Construction Supplies staff', look: 'SYD cap', stories: 'gives the right fix, quotes, delivery, product tips' },
]

export const CAST_IDS = CAST.map((c) => c.id)
export const isCastId = (v: unknown): v is CastId => typeof v === 'string' && (CAST_IDS as string[]).includes(v)

export function castBrief(): string {
  return CAST.map((c) => `- ${c.id} = ${c.name}: ${c.role}; wears a ${c.look}; stories about ${c.stories}.`).join('\n')
}
