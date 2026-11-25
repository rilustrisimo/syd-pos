// Prompt + schema for /api/content/generate-storyboard (kept here so it can be
// tested without the route).

import { SCENE_ROLES, POSES, MOODS, PROP_IDS, type PropId } from '@/lib/marketing/reel-styles'
import { CAST_IDS, castBrief } from '@/lib/marketing/cast'
import { NARRATION_LANGUAGE_RULES, type NarrationLanguage } from '@/lib/marketing/narration-language'

export const STORYBOARD_SYSTEM = `You are the storyboard artist for short animated social-media reels for
SYD Construction Supplies Trading, a hardware/construction supplies store in
Talakag, Bukidnon, Philippines. A narrator reads the script; you design what
appears on screen for each narration sentence: short text, a character
acting it out, and objects (props) tied to the action. The visuals must
follow THIS post's story — never generic filler.

On-screen text:
- headline: 1–4 words, the key idea of that sentence, punchy, never a full sentence.
- sub: optional, at most 6 words, only when it adds something new.
- stamp: optional 1–2 words with "!" — use stamps on AT MOST 2 scenes in the
  whole reel, never the same stamp twice, never the word "Matibay" unless the
  narrator says it.
- items: only for "proof" scenes that list things (2–3 entries, max 4 words each).
- No two headlines share their main word. Echo the narrator's own words.
- Never invent prices, discounts, delivery promises, schedules or qualities
  the narrator doesn't say. The call-to-action site and phone are added
  automatically — don't write them.

Roles (the scene's job): hook (first scene), problem (what went wrong),
solution (the fix / SYD materials), product (showing a product), proof
(reasons, options, steps), cta (last scene). A story reel follows
hook → problem → solution → cta. A wrong or failed fix (the cheap patch that
breaks again) is still a "problem" scene; "solution" starts when the right
fix with SYD materials appears.

Characters: pick the cast member who fits the story (keep the SAME character
through a story; Boss J (id "lyn") can appear in the solution as the helpful SYD staff).
Choose a pose and mood that act out the sentence (worried/think in the
problem, happy/thumbs_up in the solution, point in the cta). Use "none" when
a scene works better without a person.

Props: 0–3 objects from the list that are literally in the sentence or its
action (a leaking roof → roof, rain_cloud, water_drop; pig fence → pig,
fence, cyclone_wire; delivery → truck; mixing concrete → cement_bag, sand, gravel; termites / rotting posts → termite, rotten_post; wet ground → wet_soil; concrete or G.I. posts → concrete_post, gi_pipe; formwork → formwork; "matibay" result → shield). Use the product's own prop for the
product/solution scene. No unrelated props.`

export const STORYBOARD_SCHEMA = {
  type: 'OBJECT',
  properties: {
    scenes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          role: { type: 'STRING', enum: SCENE_ROLES },
          headline: { type: 'STRING' },
          sub: { type: 'STRING' },
          stamp: { type: 'STRING' },
          items: { type: 'ARRAY', items: { type: 'STRING' } },
          character: { type: 'STRING', enum: [...CAST_IDS, 'none'] },
          pose: { type: 'STRING', enum: [...POSES] },
          mood: { type: 'STRING', enum: [...MOODS, 'none'] },
          props: { type: 'ARRAY', items: { type: 'STRING', enum: [...PROP_IDS] } },
        },
        required: ['role', 'headline', 'character', 'pose', 'props'],
      },
    },
  },
  required: ['scenes'],
}

export interface GeminiScene {
  role?: string; headline?: string; sub?: string; stamp?: string; items?: string[]
  character?: string; pose?: string; mood?: string; props?: string[]
}

export function storyboardPrompt(opts: {
  sentences: { text: string }[]
  language: NarrationLanguage
  idea: { title?: string; angle?: string; description?: string } | null
  style: { label: string; recipe: string } | null
  productName: string | null
  productProp: PropId | null
}): string {
  const { sentences, language, idea, style, productName, productProp } = opts
  return [
    'CAST (character ids):', castBrief(), '',
    `PROPS you can use: ${PROP_IDS.join(', ')}.`,
    `POSES: ${POSES.join(', ')}. MOODS: ${MOODS.join(', ')}.`, '',
    `LANGUAGE for on-screen text: ${NARRATION_LANGUAGE_RULES[language]}`,
    idea?.title ? `POST IDEA: ${idea.title}${idea.angle ? ` — hook: ${idea.angle}` : ''}` : '',
    idea?.description ? `IDEA DETAILS (keep its story, character and tone): ${idea.description.slice(0, 900)}` : '',
    style ? `CREATIVE STYLE: ${style.label} — ${style.recipe}` : '',
    productName ? `PRODUCT: ${productName}${productProp ? ` (its prop: ${productProp})` : ''}` : 'No single product (general store post).',
    '',
    `There are ${sentences.length} scenes. Design exactly ${sentences.length} scenes, in order:`,
    ...sentences.map((s, i) => `${i + 1}. Narrator says: "${s.text}"`),
  ].filter(Boolean).join('\n')
}
