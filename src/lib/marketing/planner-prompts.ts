// Prompts + JSON schemas for the Gemini marketing planner: daily/weekly
// post plans, distinct ad concepts, and an insights analysis. Kept in one
// place (and free of server-only imports) so they can be exercised directly
// against the API when tuning.

import { AUDIENCE_BRIEFS, BUSINESS_CONTEXT, CONTENT_RULES } from '@/lib/marketing/brand'
import { CREATIVE_STYLE_KEYS, creativeStylesBrief, type CreativeStyle } from '@/lib/marketing/creative-styles'
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

Creative styles (HOW a post is made — use these exact keys). Meta treats
creatives that look alike as one and limits their reach ("Creative limited"
/ "Creative fatigue"), so rotate styles for everyday posts as well as ads,
and make each Canva prompt or reel shot list follow its style's recipe:
${creativeStylesBrief()}

Base your choices on the performance data provided: repeat what works,
drop what doesn't, and say so in plain words. When there's little or no
data, say that the plan is a starting point.`

const FORMAT_ENUM = ['image', 'carousel', 'reel']
const STYLE_ENUM = CREATIVE_STYLE_KEYS as string[]
const AUDIENCE_ENUM = ['contractor', 'business_farm', 'family_build', 'general']

// ── Daily / weekly plan ─────────────────────────────────────────

export interface PlannedPost {
  date: string
  format: 'image' | 'carousel' | 'reel'
  audience: ContentAudience
  creative_style: CreativeStyle
  title: string
  angle: string
  best_time: string
  caption: string
  hashtags: string[]
  tags: string[]
  creative_prompt: string
  shot_list: string
  stickers: string[]
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
          creative_style: { type: 'STRING', enum: STYLE_ENUM, description: 'How the post is made; its recipe shapes the creative prompt / shot list.' },
          title: { type: 'STRING', description: 'Short internal title.' },
          angle: { type: 'STRING', description: 'The hook / problem / proof this post is built on, one line.' },
          best_time: { type: 'STRING', description: 'Posting time copied from the BEST TIMES list for that weekday, e.g. "Tue 8:00 PM".' },
          caption: { type: 'STRING', description: 'Ready-to-post caption, taglish allowed, 2-5 short sentences, ends with a call to action. No hashtags inside.' },
          hashtags: { type: 'ARRAY', items: { type: 'STRING' }, description: '5-8 hashtags incl. local ones (e.g. #TalakagBukidnon), each with #.' },
          tags: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Tagging suggestions: location tag, product tags, collaborator/supplier accounts to tag if relevant.' },
          creative_prompt: { type: 'STRING', description: 'Image/carousel only: paste-ready Canva prompt (1080x1350; carousel = slide by slide; brand colors; logo top-left; on-screen text; CTA strip). Empty for reels.' },
          shot_list: { type: 'STRING', description: 'Reel only: numbered shots following the creative style recipe (transition = 8-12 quick shots, others 4-6). Empty otherwise.' },
          stickers: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Reel only: short on-screen text sticker per shot (max 6 words each, taglish ok), same count and order as the shot list; empty strings for shots without text. Empty array for non-reels.' },
          voice_script: { type: 'STRING', description: 'Reel only: plain-English voiceover, 50-80 words. Empty otherwise.' },
          stock_keywords: { type: 'STRING', description: 'Reel only: stock video search terms separated by semicolons. Empty otherwise.' },
          why: { type: 'STRING', description: 'One sentence: why this post, today, at this time — cite the data when there is some.' },
        },
        required: ['date', 'format', 'audience', 'creative_style', 'title', 'angle', 'best_time', 'caption', 'hashtags', 'tags', 'creative_prompt', 'shot_list', 'stickers', 'voice_script', 'stock_keywords', 'why'],
        propertyOrdering: ['date', 'format', 'audience', 'creative_style', 'title', 'angle', 'best_time', 'caption', 'hashtags', 'tags', 'creative_prompt', 'shot_list', 'stickers', 'voice_script', 'stock_keywords', 'why'],
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
      ? `Plan one organic post for each of these dates: ${dates.join(', ')}. Balance the week: about 2-3 reels, 2 carousels, 2-3 single images; rotate audiences (contractor, business_farm, family_build) with at most 1 general post; no two posts on the same topic or hook. Creative styles: use at least 4 different styles across the week, no style more than twice, and never the same style on two consecutive days.`
      : `Plan today's single best organic post for ${dates[0]}. Pick the format and audience that the data (and this week's plan, if any) suggests is most needed now, and a creative style different from the last 2 posts listed in the data.`,
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
  creative_style: CreativeStyle
  stickers: string[]
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
          proof_type: { type: 'STRING', description: 'The argument that convinces (separate from the creative style): convenience (one quote for everything), delivery to site/farm, completeness (full materials list), local trust (real store in Talakag), clarity (no hidden costs, COD), durability, speed.' },
          format: { type: 'STRING', enum: FORMAT_ENUM },
          creative_style: { type: 'STRING', enum: STYLE_ENUM, description: 'How the ad is made; its recipe shapes the visual.' },
          stickers: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Reel only: short on-screen text per shot (max 6 words), in shot order. Empty array otherwise.' },
          description: { type: 'STRING', description: 'What the ad shows and says, and its call to action (request a quote on sydconstruct.com).' },
          image_concept: { type: 'STRING', description: 'The visual in one line; for reels a numbered shot list.' },
          creative_prompt: { type: 'STRING', description: 'Image/carousel: paste-ready Canva prompt (1080x1350, brand colors, logo top-left, on-screen taglish text, CTA strip). Reel: a plain-English voiceover script of 50-80 words.' },
          stock_keywords: { type: 'STRING', description: 'Reel: stock video search terms separated by semicolons. Empty otherwise.' },
          concept_code: { type: 'STRING', description: 'Unique lowercase slug: audience prefix (ctr / biz / fam / gen) + 2-3 word topic + format, e.g. "ctr-one-quote-reel".' },
        },
        required: ['title', 'audience', 'angle', 'proof_type', 'format', 'creative_style', 'stickers', 'description', 'image_concept', 'creative_prompt', 'stock_keywords', 'concept_code'],
        propertyOrdering: ['title', 'audience', 'angle', 'proof_type', 'format', 'creative_style', 'stickers', 'description', 'image_concept', 'creative_prompt', 'stock_keywords', 'concept_code'],
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
    'Diversity rules (this is what lets Meta find different people): every concept must differ from the others in audience OR proof type, no two share the same hook, mix formats (include at least one reel and one non-reel when count >= 3), and give every concept a DIFFERENT creative_style so they look visibly different, not just read differently.',
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
    'Ads can have different goals (calls, follows, link clicks/website visits): judge each against its own goal, never compare cost per result across goals. Phone calls are a strong result for a local hardware store. Use reach, impressions, frequency and CPM to judge whether an ad is still reaching new people (frequency above ~3 means refresh the creative) and whether it is cheap to show.',
    'If an ad drives calls but not the website, say whether to keep it and whether to add a website-traffic or retargeting ad next to it.',
    'Check creative differentiation: if Meta flagged any creative as limited or fatigued, or recent posts reuse the same creative style, say which styles and formats to switch to next. Mention which creative styles performed best when the data shows it.',
  ].join('\n')
}
