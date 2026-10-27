// Shared context for every Gemini marketing prompt (post drafts, ad
// concepts, daily plans, insight analysis), so they all describe SYD, its
// rules and its customer types the same way. Plain constants — safe to
// import from server routes.

import type { ContentAudience } from '@/hooks/useContentIdeas'

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
request a quote, or to message the page. Never write a phone number or
street address in captions — the store's real contact block is appended
automatically.`

export const AUDIENCE_BRIEFS: Record<ContentAudience, string> = {
  contractor:
    'Contractors and foremen: buy in bulk and repeatedly, care about getting one quick quote for a whole materials list, reliable supply, and delivery to the site.',
  business_farm:
    'Small businesses and farms in Bukidnon: store fronts, piggery and poultry houses, warehouses, fences. Care about durable materials, getting everything from one supplier, and delivery to rural sites.',
  family_build:
    'Families building or renovating a house, often funded by an OFW relative abroad and managed by family at home. Care about trust, clear quotes with no surprises, and knowing exactly what materials a project needs.',
  general: 'General local audience in and around Talakag, Bukidnon.',
}
