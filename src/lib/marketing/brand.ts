// Shared context for every Gemini marketing prompt (post drafts, ad
// concepts, daily plans, insight analysis), so they all describe SYD, its
// rules and its customer types the same way. Plain constants — safe to
// import from server routes.

import type { ContentAudience } from '@/hooks/useContentIdeas'

// The number shown on creatives (Canva CTA strip, reel end card) — the
// only phone number a creative may carry, so it's fixed here, never AI-written.
export const STORE_CALL_NUMBER = '+63 945 801 3640'
export const CALL_CTA = `or call us directly: ${STORE_CALL_NUMBER}`
// How the AI may refer to the number in text it writes (ideas, captions,
// voiceovers) — pointing to it, never typing it, so it can't come out wrong.
export const CALL_MENTION = 'call or text us (number below)'

export const BUSINESS_CONTEXT = `SYD Construction Supplies Trading is a hardware / construction supplies
store in Talakag, Bukidnon, Philippines. Customers order on sydconstruct.com
by adding items and quantities and submitting a quote request — prices are
NOT shown online; SYD's team messages back the final price and delivery
fee. Cash on delivery within 5km of the store. Top products by profit:
sand and gravel (per cubic meter), hollow blocks, UNION and HOLCIM cement,
rebar (RSB / kabelya), coco lumber, G.I. tubes, GI corrugated sheets,
HardiFlex, phenolic board, tie wire, skim coat.`

export const CONTENT_RULES = `Rules: never state or invent prices, stock levels, discounts, delivery
times, or technical/engineering claims. Captions may be taglish (natural
English + Filipino). Reel voiceover scripts are casual Taglish (no Bisaya —
the text-to-speech voice mispronounces it). Brand colors: dark slate #0F172A,
yellow #FFC107, white. Every post points people to sydconstruct.com to
request a quote, or to call or text the store — calling is the quickest
way to reach SYD, so mention it in every call to action that asks people
to get in touch. Never write the phone number or a street address
yourself — say "${CALL_MENTION}" in captions and "the number's on screen"
in voiceovers; the store's real number is added to every caption and
creative automatically.`

export const AUDIENCE_BRIEFS: Record<ContentAudience, string> = {
  contractor:
    'Contractors and foremen: buy in bulk and repeatedly, care about getting one quick quote for a whole materials list, reliable supply, and delivery to the site.',
  business_farm:
    'Small businesses and farms in Bukidnon: store fronts, piggery and poultry houses, warehouses, fences. Care about durable materials, getting everything from one supplier, and delivery to rural sites.',
  family_build:
    'Families building or renovating a house, often funded by an OFW relative abroad and managed by family at home. Care about trust, clear quotes with no surprises, and knowing exactly what materials a project needs.',
  general: 'General local audience in and around Talakag, Bukidnon.',
}
