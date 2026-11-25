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
  // More farm cases (Mang Ramon).
  { id: 'muddy-pig-pen', problem: 'Maputik at mabaho ang sahig ng babuyan, nagkakasakit ang baboy', audience: 'business_farm', season: 'rainy',
    wrong_fix: 'dinadagdagan lang ng lupa o ipa', right_fix: 'sementadong sahig na may tamang slope at kanal, washed sand at graba sa halo', product_keywords: ['cement', 'sand', 'gravel', 'PVC pipe'] },
  { id: 'farm-road-washout', problem: 'Naaanod ang daan papunta sa farm tuwing malakas ang ulan', audience: 'business_farm', season: 'rainy',
    wrong_fix: 'tinatambakan lang ng bato na naaanod din', right_fix: 'culvert gamit ang malaking PVC pipe at hollow block na gilid, graba sa daan', product_keywords: ['PVC pipe', 'hollow block', 'gravel', 'cement'] },
  { id: 'goat-house-rot', problem: 'Nabubulok ang sahig ng kulungan ng kambing', audience: 'business_farm', season: 'rainy',
    wrong_fix: 'kawayan na direkta sa lupa', right_fix: 'nakaangat na sahig: coco lumber na frame sa G.I. pipe na poste, may bubong na yero', product_keywords: ['coco lumber', 'G.I. pipe', 'G.I. sheet', 'nails'] },
  { id: 'feed-storage-wet', problem: 'Nababasa at inaamag ang feeds at bigas sa bodega', audience: 'business_farm', season: 'rainy',
    wrong_fix: 'trapal lang na pantakip', right_fix: 'bodegang may maayos na yero, sealant sa butas at nakaangat na pallet', product_keywords: ['G.I. sheet', 'sealant', 'lumber', 'plywood'] },
  { id: 'broken-water-line', problem: 'Laging sira ang tubo ng tubig papunta sa kulungan', audience: 'business_farm', season: 'all',
    wrong_fix: 'hose na nabubutas sa araw', right_fix: 'PVC o PPR pipe na nakabaon, may gripo sa bawat kulungan', product_keywords: ['PVC pipe', 'PPR pipe', 'faucet', 'fittings'] },
  // Fast movers: lumber, boards, walls, tiles, electrical, plumbing, finishing.
  { id: 'coco-lumber-rot', problem: 'Nabubulok at inaanay ang coco lumber sa labas', audience: 'family_build', season: 'rainy',
    wrong_fix: 'diretsong ibinaon sa lupa ang poste na walang proteksyon', right_fix: 'coco lumber pang-loob lang o may preservative at pintura; sa labas G.I. pipe o semento na poste', product_keywords: ['coco lumber', 'lumber', 'paint', 'G.I. pipe'] },
  { id: 'coco-lumber-grade', problem: 'Bumabaluktot at nabibiyak ang biniling coco lumber', audience: 'contractor', season: 'all',
    wrong_fix: 'pinakamurang basa pa na kahoy ang binili', right_fix: 'tuyong coco lumber, tamang laki (2x2, 2x3, 2x4) para sa trabaho, nakasalansan nang tuwid', product_keywords: ['coco lumber', 'lumber', 'good lumber'] },
  { id: 'warped-plywood', problem: 'Lumulobo at nababakbak ang plywood sa kisame o cabinet', audience: 'family_build', season: 'rainy',
    wrong_fix: 'ordinaryong plywood sa basang lugar', right_fix: 'marine plywood o fiber cement board (HardiFlex) sa banyo, kusina at labas', product_keywords: ['marine plywood', 'plywood', 'HardiFlex', 'fiber cement'] },
  { id: 'ceiling-stain', problem: 'May mantsa at lumulundo ang kisame', audience: 'family_build', season: 'rainy',
    wrong_fix: 'pinintahan lang ang mantsa', right_fix: 'hanapin ang tagas sa bubong, palitan ng fiber cement o gypsum board sa metal furring', product_keywords: ['HardiFlex', 'gypsum board', 'metal furring', 'sealant'] },
  { id: 'wall-crack', problem: 'May bitak ang pader ng bahay', audience: 'family_build', season: 'all',
    wrong_fix: 'tinapalan lang ng semento na walang halong buhangin', right_fix: 'tamang mortar mix, skim coat sa ibabaw bago pintura', product_keywords: ['cement', 'sand', 'skim coat', 'paint'] },
  { id: 'damp-wall', problem: 'Laging basa at may amag ang pader sa tag-ulan', audience: 'family_build', season: 'rainy',
    wrong_fix: 'pintura lang nang pintura', right_fix: 'waterproofing sa labas, elastomeric paint at maayos na kanal', product_keywords: ['elastomeric', 'waterproofing', 'paint', 'PVC pipe'] },
  { id: 'loose-tiles', problem: 'Kumakalas at umaangat ang tiles sa sahig', audience: 'family_build', season: 'all',
    wrong_fix: 'sementong purong idinikit sa tiles', right_fix: 'tile adhesive at grout, patag na sahig bago maglatag', product_keywords: ['tile', 'tile adhesive', 'grout'] },
  { id: 'slippery-tiles', problem: 'Madulas ang tiles sa banyo, may nadulas na', audience: 'family_build', season: 'all',
    wrong_fix: 'makintab na floor tile sa banyo', right_fix: 'non-slip o matte na floor tiles para sa banyo at labas', product_keywords: ['floor tile', 'tile'] },
  { id: 'tripping-breaker', problem: 'Laging nagti-trip ang breaker, umiinit ang wire', audience: 'family_build', season: 'all',
    wrong_fix: 'pinagdugtong-dugtong na manipis na wire at extension', right_fix: 'tamang laki ng THHN wire, bagong outlet at breaker, ipagawa sa electrician', product_keywords: ['THHN', 'electrical wire', 'breaker', 'outlet'] },
  { id: 'high-power-bill', problem: 'Mataas ang kuryente kahit kaunti ang ilaw', audience: 'family_build', season: 'all',
    wrong_fix: 'lumang bumbilya na mainit at malakas kumain', right_fix: 'palitan ng LED bulbs, maliit ang konsumo at matagal', product_keywords: ['LED bulb', 'bulb', 'light'] },
  { id: 'dripping-faucet', problem: 'Tumutulo ang gripo buong gabi', audience: 'family_build', season: 'all',
    wrong_fix: 'hinigpitan nang hinigpitan hanggang masira', right_fix: 'bagong gripo o washer, teflon tape sa thread', product_keywords: ['faucet', 'teflon', 'fittings'] },
  { id: 'gutter-leak', problem: 'Tumutulo ang alulod at dugtungan ng yero', audience: 'family_build', season: 'rainy',
    wrong_fix: 'idinikit lang ng plastic at goma', right_fix: 'sealant na pang-bubong (Vulcaseal) at tamang overlap ng G.I. sheet', product_keywords: ['sealant', 'Vulcaseal', 'G.I. sheet', 'gutter'] },
  { id: 'sagging-roof-frame', problem: 'Lumulundo ang bubong, mahina ang tukod', audience: 'contractor', season: 'rainy',
    wrong_fix: 'kahoy na maliit at magkakalayo ang tukod', right_fix: 'C-purlins at tamang spacing, angle bar sa trusses', product_keywords: ['purlin', 'C-purlin', 'angle bar', 'G.I. sheet'] },
  { id: 'swollen-door', problem: 'Sumasabit at hindi maisara ang pinto tuwing umuulan', audience: 'family_build', season: 'rainy',
    wrong_fix: 'kinakayas lang ang gilid ng pinto', right_fix: 'pintura o sealer sa lahat ng gilid, o bagong flush door na pang-basa', product_keywords: ['door', 'flush door', 'paint', 'sealer'] },
  { id: 'dirty-sand', problem: 'Mahina ang buhos dahil marumi ang buhangin', audience: 'contractor', season: 'all',
    wrong_fix: 'buhangin na may putik at lupa', right_fix: 'washed sand at tamang laki ng graba (3/4) para sa concrete', product_keywords: ['washed sand', 'sand', 'gravel', 'cement'] },
  { id: 'paint-streaks', problem: 'May guhit at hindi pantay ang pintura', audience: 'family_build', season: 'all',
    wrong_fix: 'lumang brush at isang patong lang', right_fix: 'paint roller, primer muna, dalawang manipis na patong', product_keywords: ['paint roller', 'paint', 'primer', 'brush'] },
]

/** Rainy season in Bukidnon is roughly June to November. */
export function seasonFor(month: number): Season {
  return month >= 6 && month <= 11 ? 'rainy' : 'dry'
}

const tokens = (text: string) => (text.toLowerCase().match(/[a-z0-9.]{3,}/g) ?? []).filter((t) => !STOP.has(t))
const STOP = new Set(['the', 'and', 'for', 'with', 'about', 'usage', 'use', 'uses', 'post', 'posts', 'this', 'week', 'focus', 'new', 'para', 'ang', 'mga', 'sa'])

/** How well a problem matches free text (owner's note / topic): shared words. */
export function problemScore(p: Problem, text: string): number {
  const hay = `${p.id.replace(/-/g, ' ')} ${p.problem} ${p.right_fix} ${p.product_keywords.join(' ')}`.toLowerCase()
  return tokens(text).reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0)
}

/** Problems that fit this month (rainy/dry). */
export function inSeason(month = new Date().getMonth() + 1): Problem[] {
  const season = seasonFor(month)
  return PROBLEM_BANK.filter((p) => p.season === 'all' || p.season === season)
}

const line = (p: Problem) => `- [${p.id}] (${p.audience}) ${p.problem}. Wrong fix: ${p.wrong_fix}. Right fix: ${p.right_fix}. Products: ${p.product_keywords.join(', ')}.`

/**
 * The problem bank as a prompt block. Shuffled each time (so the first entry
 * isn't always picked), with problems used recently left out, and ones
 * matching the owner's note first.
 */
export function problemsForPrompt(opts: { month?: number; recent?: string[]; note?: string } = {}): string {
  const recent = new Set(opts.recent ?? [])
  const pool = inSeason(opts.month).filter((p) => !recent.has(p.id))
  const shuffled = pool.map((p) => ({ p, r: Math.random() + (opts.note ? problemScore(p, opts.note) * 10 : 0) })).sort((a, b) => b.r - a.r).map((x) => x.p)
  return shuffled.map(line).join('\n')
}
