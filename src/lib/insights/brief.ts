// The AI business brief (weekly or monthly), written by Gemini (free tier)
// from the compact Insights report.

export interface InsightsBrief {
  headline: string
  summary: string
  wins: string[]
  concerns: string[]
  actions: { action: string; why: string; priority: 'high' | 'medium' | 'low' }[]
  buy_list: { product: string; quantity: string; reason: string }[]
  customers_to_call: { name: string; reason: string }[]
  outlook: string
}

export const BRIEF_SCHEMA = {
  type: 'OBJECT',
  properties: {
    headline: { type: 'STRING', description: 'One sentence: the single most important thing about this period.' },
    summary: { type: 'STRING', description: '3–4 sentences: how the business did, with the key numbers and comparisons.' },
    wins: { type: 'ARRAY', items: { type: 'STRING' }, description: '2–4 things that went well, each with a number.' },
    concerns: { type: 'ARRAY', items: { type: 'STRING' }, description: '2–4 problems or risks, each with a number.' },
    actions: {
      type: 'ARRAY',
      description: '3–5 concrete actions for the coming week/month, most valuable first.',
      items: {
        type: 'OBJECT',
        properties: {
          action: { type: 'STRING', description: 'What to do, specific (who/what/how much).' },
          why: { type: 'STRING', description: 'The data behind it and the expected effect.' },
          priority: { type: 'STRING', enum: ['high', 'medium', 'low'] },
        },
        required: ['action', 'why', 'priority'],
      },
    },
    buy_list: {
      type: 'ARRAY',
      description: 'Up to 8 products to order now, from "Needs ordering now" and the forecast.',
      items: { type: 'OBJECT', properties: { product: { type: 'STRING' }, quantity: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['product', 'quantity', 'reason'] },
    },
    customers_to_call: {
      type: 'ARRAY',
      description: 'Up to 5 customers to contact (slipping regulars or old utang), with why.',
      items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['name', 'reason'] },
    },
    outlook: { type: 'STRING', description: '2–3 sentences on the coming weeks/months: forecast, season, weather, paydays/holidays, and what to prepare.' },
  },
  required: ['headline', 'summary', 'wins', 'concerns', 'actions', 'buy_list', 'customers_to_call', 'outlook'],
}

/** The Insights module always writes in plain English. */
export function briefSystem() {
  return `You are the business analyst and advisor of a hardware & construction-materials store in Talakag, Bukidnon, Philippines. The reader is the owner: practical, busy, decides on stock, prices, credit (utang) and cash.
Rules:
- Use ONLY the numbers in the report. Never invent figures, products or customers. If something is uncertain (e.g. little history), say so briefly.
- Be specific: name products, customers, amounts (₱), quantities and dates. Round sensibly.
- Prioritise by peso impact. Prefer actions the owner can do this week.
- Keep each item to 1–2 short sentences.
- Write in clear, simple English only (no Tagalog/Taglish).`
}

export function briefPrompt(kind: 'weekly' | 'monthly', report: string) {
  return `Write the ${kind === 'weekly' ? 'WEEKLY' : 'MONTHLY'} business brief from this report.\n\n${report}`
}
