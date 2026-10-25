// Prompts + JSON schemas for the Gemini marketing planner: daily/weekly
// post plans, distinct ad concepts, and an insights analysis. Kept in one
// place (and free of server-only imports) so they can be exercised directly
// against the API when tuning.

import { AUDIENCE_BRIEFS, BUSINESS_CONTEXT, CONTENT_RULES } from '@/lib/marketing/brand'
import type { ContentAudience } from '@/hooks/useContentIdeas'

const ROLE = `You are SYD Construction Supplies' social media manager and Meta ads
specialist. You plan content for the Facebook Page and Instagram account,
grow followers, and feed Meta's ad delivery with genuinely different creative
concepts (on Meta, the creative itself decides who sees an ad, so concepts
must differ in WHO they speak to and WHAT problem or proof they show — not
just wording).`

const AUDIENCES = (Object.entries(AUDIENCE_BRIEFS) as [ContentAudience, string][])
  .map(([key, brief]) => `- ${key}: ${brief}`)
  .join('\n')

export const PLANNER_SYSTEM = `${ROLE}

${BUSINESS_CONTEXT}

Audiences (use these exact keys):
${AUDIENCES}

${CONTENT_RULES}

Base your choices on the performance data provided: repeat what works,
drop what doesn't, and say so in plain words. When there's little or no
data, say that the plan is a starting point.`

const FORMAT_ENUM = ['image', 'carousel', 'reel']
const AUDIENCE_ENUM = ['contractor', 'business_farm', 'family_build', 'general']

// ── Daily / weekly plan ─────────────────────────────────────────

export interface PlannedPost {
  date: string
  format: 'image' | 'carousel' | 'reel'
  audience: ContentAudience
  title: string
  angle: string
  best_time: string
  caption: string
  hashtags: string[]
  tags: string[]
  creative_prompt: string
  shot_list: string
  voice_script: string
  stock_keywords: string
  why: string
}

export const PLAN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    posts: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          date: { type: 'STRING', description: 'YYYY-MM-DD (Manila) this post is for.' },
          format: { type: 'STRING', enum: FORMAT_ENUM },
          audience: { type: 'STRING', enum: AUDIENCE_ENUM },
          title: { type: 'STRING', description: 'Short internal title.' },
          angle: { type: 'STRING', description: 'The hook / problem / proof this post is built on, one line.' },
          best_time: { type: 'STRING', description: 'Posting time copied from the BEST TIMES list for that weekday, e.g. "Tue 8:00 PM".' },
          caption: { type: 'STRING', description: 'Ready-to-post caption, taglish allowed, 2-5 short sentences, ends with a call to action. No hashtags inside.' },
          hashtags: { type: 'ARRAY', items: { type: 'STRING' }, description: '5-8 hashtags incl. local ones (e.g. #TalakagBukidnon), each with #.' },
          tags: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Tagging suggestions: location tag, product tags, collaborator/supplier accounts to tag if relevant.' },
          creative_prompt: { type: 'STRING', description: 'Image/carousel only: paste-ready Canva prompt (1080x1350; carousel = slide by slide; brand colors; logo top-left; on-screen text; CTA strip). Empty for reels.' },
          shot_list: { type: 'STRING', description: 'Reel only: 4-6 numbered shots. Empty otherwise.' },
          voice_script: { type: 'STRING', description: 'Reel only: plain-English voiceover, 50-80 words. Empty otherwise.' },
          stock_keywords: { type: 'STRING', description: 'Reel only: stock video search terms separated by semicolons. Empty otherwise.' },
          why: { type: 'STRING', description: 'One sentence: why this post, today, at this time — cite the data when there is some.' },
        },
        required: ['date', 'format', 'audience', 'title', 'angle', 'best_time', 'caption', 'hashtags', 'tags', 'creative_prompt', 'shot_list', 'voice_script', 'stock_keywords', 'why'],
        propertyOrdering: ['date', 'format', 'audience', 'title', 'angle', 'best_time', 'caption', 'hashtags', 'tags', 'creative_prompt', 'shot_list', 'voice_script', 'stock_keywords', 'why'],
      },
    },
  },
  required: ['posts'],
}

export function planPrompt(digest: string, dates: string[], note?: string): string {
  const week = dates.length > 1
  return [
    'PERFORMANCE DATA AND CONTEXT:',
    digest,
    '',
    week
      ? `Plan one organic post for each of these dates: ${dates.join(', ')}. Balance the week: about 2-3 reels, 2 carousels, 2-3 single images; rotate audiences (contractor, business_farm, family_build) with at most 1 general post; no two posts on the same topic or hook.`
      : `Plan today's single best organic post for ${dates[0]}. Pick the format and audience that the data (and this week's plan, if any) suggests is most needed now.`,
    'Each post must be ready to produce: a creative prompt for images/carousels, or a shot list + voice script for reels.',
    'Its best_time must be one of the listed BEST TIMES for that weekday.',
    note ? `Owner's note for this plan: ${note}` : '',
  ].filter(Boolean).join('\n')
}

// ── Ad concepts ─────────────────────────────────────────────────

export interface AdConcept {
  title: string
  audience: ContentAudience
  angle: string
  proof_type: string
  format: 'image' | 'carousel' | 'reel'
  description: string
  image_concept: string
  creative_prompt: string
  stock_keywords: string
  concept_code: string
}

export const CONCEPTS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    concepts: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          audience: { type: 'STRING', enum: AUDIENCE_ENUM },
          angle: { type: 'STRING', description: 'The single hook this concept is built on.' },
          proof_type: { type: 'STRING', description: 'How it convinces: demo, checklist, local trust, process walkthrough, customer story, before/after, comparison, behind the scenes.' },
          format: { type: 'STRING', enum: FORMAT_ENUM },
          description: { type: 'STRING', description: 'What the ad shows and says, and its call to action (request a quote on sydconstruct.com).' },
          image_concept: { type: 'STRING', description: 'The visual in one line; for reels a numbered shot list.' },
          creative_prompt: { type: 'STRING', description: 'Image/carousel: paste-ready Canva prompt (1080x1350, brand colors, logo top-left, on-screen taglish text, CTA strip). Reel: a plain-English voiceover script of 50-80 words.' },
          stock_keywords: { type: 'STRING', description: 'Reel: stock video search terms separated by semicolons. Empty otherwise.' },
          concept_code: { type: 'STRING', description: 'Unique lowercase slug: audience prefix (ctr / biz / fam / gen) + 2-3 word topic + format, e.g. "ctr-one-quote-reel".' },
        },
        required: ['title', 'audience', 'angle', 'proof_type', 'format', 'description', 'image_concept', 'creative_prompt', 'stock_keywords', 'concept_code'],
        propertyOrdering: ['title', 'audience', 'angle', 'proof_type', 'format', 'description', 'image_concept', 'creative_prompt', 'stock_keywords', 'concept_code'],
      },
    },
  },
  required: ['concepts'],
}

export function conceptsPrompt(
  digest: string,
  opts: { topic: string; productName?: string | null; audiences: ContentAudience[]; count: number }
): string {
  return [
    'PERFORMANCE DATA AND CONTEXT:',
    digest,
    '',
    `Create ${opts.count} DISTINCT Meta ad concepts${opts.topic ? ` about: ${opts.topic}` : ''}${opts.productName ? ` (product: ${opts.productName})` : ''}.`,
    `Spread them across these audiences as evenly as possible: ${opts.audiences.join(', ')}.`,
    'Diversity rules (this is what lets Meta find different people): every concept must differ from the others in audience OR proof type, no two share the same hook, and mix formats (include at least one reel and one non-reel when count >= 3).',
    'Lean toward the concepts and formats that performed well in the data; avoid repeating ones that did poorly.',
    'Every concept_code must be unique.',
  ].join('\n')
}

// ── Insights analysis ───────────────────────────────────────────

export interface InsightsAnalysis {
  summary: string
  working: string[]
  not_working: string[]
  next_tests: string[]
  posting_times: string
  budget_advice: string
}

export const ANALYSIS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING', description: '2-3 sentences, plain words.' },
    working: { type: 'ARRAY', items: { type: 'STRING' } },
    not_working: { type: 'ARRAY', items: { type: 'STRING' } },
    next_tests: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Concrete concepts or changes to try next (audience + angle + format).' },
    posting_times: { type: 'STRING', description: 'When to post, from the best-times data, with its confidence.' },
    budget_advice: { type: 'STRING', description: 'How to split a PHP 3,000-5,000/month budget between reach/follower ads and retargeting right now, and which ads to pause or scale.' },
  },
  required: ['summary', 'working', 'not_working', 'next_tests', 'posting_times', 'budget_advice'],
  propertyOrdering: ['summary', 'working', 'not_working', 'next_tests', 'posting_times', 'budget_advice'],
}

export function analysisPrompt(digest: string): string {
  return [
    'PERFORMANCE DATA AND CONTEXT:',
    digest,
    '',
    'Analyze this like a social media manager reporting to the owner. Be specific and brief; reference concept codes and post types from the data. If data is thin, say what to import or run next to learn more.',
  ].join('\n')
}
