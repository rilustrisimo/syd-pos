// Common, real problems for builders, farms and homes around Talakag,
// Bukidnon — the raw material for story posts ("problem → fix"). Each fix
// points at products the store carries (product_keywords are matched
// against the catalog by the planner). Add new problems here as staff hear
// them from customers.

import type { ContentAudience } from '@/hooks/useContentIdeas'

export type Season = 'rainy' | 'dry' | 'all'

export interface Problem {
  id: string
  problem: string
  audience: ContentAudience
  season: Season
  wrong_fix: string
  right_fix: string
  product_keywords: string[]
}

export const PROBLEM_BANK: Problem[] = [
  { id: 'roof-leak', problem: 'Tumutulo ang bubong tuwing malakas ang ulan', audience: 'family_build', season: 'rainy',
    wrong_fix: 'tinatapalan lang ng plastic o lumang yero', right_fix: 'palitan ang butas na G.I. sheet, tamang overlap at sealant sa turnilyo', product_keywords: ['G.I. sheet', 'roofing', 'sealant', 'roofing screw'] },
  { id: 'rusty-roof', problem: 'Kinakalawang at nabubutas na ang yero', audience: 'family_build', season: 'rainy',
    wrong_fix: 'pinipinturahan lang nang walang primer', right_fix: 'bagong pre-painted G.I. sheet, o primer na pang-rust bago pintura', product_keywords: ['G.I. sheet', 'pre-painted', 'primer', 'paint'] },
  { id: 'pig-pen-fence', problem: 'Nakakatakas ang baboy, sira na ang kulungan', audience: 'business_farm', season: 'all',
    wrong_fix: 'tali-tali ng kawayan at lumang alambre', right_fix: 'G.I. tubes na poste at cyclone wire na bakod', product_keywords: ['cyclone wire', 'G.I. tube', 'G.I. pipe', 'tie wire'] },
  { id: 'poultry-house-heat', problem: 'Sobrang init sa poultry house, stressed ang manok', audience: 'business_farm', season: 'dry',
    wrong_fix: 'dagdag electric fan lang', right_fix: 'mas mataas na bubong, tamang yero at bentilasyon gamit ang cyclone wire na dingding', product_keywords: ['G.I. sheet', 'cyclone wire', 'lumber'] },
  { id: 'poultry-predators', problem: 'Nakakapasok ang aso o daga sa manukan', audience: 'business_farm', season: 'all',
    wrong_fix: 'net na pang-isda', right_fix: 'chicken wire o cyclone wire na nakabaon sa hollow block na pundasyon', product_keywords: ['chicken wire', 'cyclone wire', 'hollow block'] },
  { id: 'cracked-slab', problem: 'May lamat ang bagong buhos na slab', audience: 'contractor', season: 'all',
    wrong_fix: 'sobrang tubig sa halo para madaling ibuhos', right_fix: 'tamang halo ng semento, buhangin at graba, at kuring (basain) ng ilang araw', product_keywords: ['cement', 'sand', 'gravel', 'rebar'] },
  { id: 'weak-column', problem: 'Nag-aalala sa tibay ng poste at biga', audience: 'contractor', season: 'all',
    wrong_fix: 'tipid sa bakal, maninipis na rebar', right_fix: 'tamang laki ng deformed bar at tie wire ayon sa plano', product_keywords: ['deformed bar', 'rebar', 'tie wire'] },
  { id: 'flooded-yard', problem: 'Bumabaha sa bakuran tuwing umuulan', audience: 'family_build', season: 'rainy',
    wrong_fix: 'tambak ng lupa na naaanod din', right_fix: 'hollow block na bakod at kanal, PVC drainage pipe', product_keywords: ['hollow block', 'PVC pipe', 'cement'] },
  { id: 'termite-wood', problem: 'Inaanay ang kahoy na kisame at hamba', audience: 'family_build', season: 'all',
    wrong_fix: 'palit ng kahoy na parehong klase', right_fix: 'steel framing o metal furring at fiber cement board', product_keywords: ['metal furring', 'fiber cement board', 'steel'] },
  { id: 'peeling-paint', problem: 'Nagbabakbak ang pintura sa labas ng bahay', audience: 'family_build', season: 'rainy',
    wrong_fix: 'pinatungan lang ng bagong pintura', right_fix: 'kayurin, primer, tapos weatherproof na pintura', product_keywords: ['paint', 'primer', 'elastomeric'] },
  { id: 'leaking-pipe', problem: 'May tagas ang tubo, mataas ang bayarin sa tubig', audience: 'family_build', season: 'all',
    wrong_fix: 'binalot lang ng goma o tape', right_fix: 'palitan ang sirang PVC/PPR pipe at fittings, gamitan ng tamang solvent', product_keywords: ['PVC pipe', 'PPR pipe', 'fittings', 'solvent cement'] },
  { id: 'sagging-gate', problem: 'Lumulubog at kumakalampag ang gate', audience: 'family_build', season: 'all',
    wrong_fix: 'tinatalian lang ng alambre', right_fix: 'bagong bisagra, matibay na G.I. pipe na poste na nakabaon sa semento', product_keywords: ['G.I. pipe', 'hinge', 'cement'] },
  { id: 'material-delay', problem: 'Naantala ang project dahil kulang-kulang ang materyales', audience: 'contractor', season: 'all',
    wrong_fix: 'paisa-isang bili sa iba-ibang tindahan', right_fix: 'isang quote para sa buong materials list, deliver diretso sa site', product_keywords: ['cement', 'hollow block', 'rebar', 'G.I. sheet'] },
  { id: 'farm-delivery', problem: 'Malayo ang farm, mahirap mag-hakot ng materyales', audience: 'business_farm', season: 'all',
    wrong_fix: 'paisa-isang biyahe gamit ang habal-habal', right_fix: 'isang order, deliver diretso sa farm gate', product_keywords: ['cyclone wire', 'G.I. tube', 'hollow block', 'cement'] },
  { id: 'budget-overrun', problem: 'Lumalaki ang gastos sa pagpapagawa ng bahay', audience: 'family_build', season: 'all',
    wrong_fix: 'bili nang walang listahan, sobra-sobra o kulang', right_fix: 'kumpletong materials list at quote bago magsimula', product_keywords: ['cement', 'hollow block', 'G.I. sheet'] },
  { id: 'wet-cement', problem: 'Tumitigas at nasisira ang semento sa imbakan', audience: 'contractor', season: 'rainy',
    wrong_fix: 'iniiwan sa sahig na basa', right_fix: 'iimbak sa tuyo, nakapatong sa pallet, bili lang ng kailangan', product_keywords: ['cement'] },
  { id: 'rusty-nails', problem: 'Kumakalas ang bubong dahil kinalawang ang pako', audience: 'family_build', season: 'rainy',
    wrong_fix: 'ordinaryong pako sa yero', right_fix: 'roofing screw o umbrella nails na may washer', product_keywords: ['roofing screw', 'umbrella nail', 'nails'] },
  { id: 'dark-kitchen', problem: 'Madilim at mainit sa kusina', audience: 'family_build', season: 'dry',
    wrong_fix: 'dagdag ilaw kahit tanghali', right_fix: 'translucent roofing panel at bentilasyon', product_keywords: ['polycarbonate', 'translucent', 'roofing'] },
]

/** Rainy season in Bukidnon is roughly June to November. */
export function seasonFor(month: number): Season {
  return month >= 6 && month <= 11 ? 'rainy' : 'dry'
}

/** The problems that fit this month, as a block for Gemini prompts. */
export function problemsForPrompt(month = new Date().getMonth() + 1): string {
  const season = seasonFor(month)
  return PROBLEM_BANK
    .filter((p) => p.season === 'all' || p.season === season)
    .map((p) => `- [${p.id}] (${p.audience}) ${p.problem}. Wrong fix: ${p.wrong_fix}. Right fix: ${p.right_fix}. Products: ${p.product_keywords.join(', ')}.`)
    .join('\n')
}
