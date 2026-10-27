// Language the reel voiceover script is written in. The Chirp 3 HD voices
// (Kore etc.) read Taglish well; Bisaya was tried and dropped because the
// voices mispronounce too many Cebuano words.
export type NarrationLanguage = 'taglish' | 'english'

export const NARRATION_LANGUAGES: { value: NarrationLanguage; label: string }[] = [
  { value: 'taglish', label: 'Taglish (default)' },
  { value: 'english', label: 'English' },
]

export const DEFAULT_NARRATION_LANGUAGE: NarrationLanguage = 'taglish'

export function parseNarrationLanguage(value: unknown): NarrationLanguage {
  return value === 'english' ? 'english' : 'taglish'
}

export const NARRATION_LANGUAGE_RULES: Record<NarrationLanguage, string> = {
  taglish: 'Write it in natural, casual Taglish (Tagalog mixed with English) the way Filipinos talk, keeping product names, sizes, units and the website sydconstruct.com in English. Simple everyday words, no deep or formal Tagalog, no Bisaya.',
  english: 'Write it in plain, simple English only (no Tagalog or Bisaya words).',
}
