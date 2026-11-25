// Narration voices for reels (Google Cloud Text-to-Speech, free tier:
// 1M characters/month for both Chirp 3 HD and Neural2). Chirp 3 HD voices
// sound far more natural; Kore was picked by the owner as the default.
// Chirp 3 HD voices are en-US: natural, but they read Tagalog with English
// phonics. Taglish posts default to Google's native Filipino voices
// (fil-PH Neural2), which the owner preferred by ear; acronyms get spelled
// out via SSML (lib/marketing/pronunciation.ts).

export interface NarrationVoice {
  id: string
  label: string
  /** Chirp 3 HD returns no SSML mark timepoints, so it's synthesized per sentence. */
  kind: 'chirp3hd' | 'neural2'
  /** BCP-47 code sent to Google TTS with the voice name. */
  languageCode: 'en-US' | 'fil-PH'
}

export const NARRATION_VOICES: NarrationVoice[] = [
  { id: 'en-US-Chirp3-HD-Kore', label: 'Kore — female, firm (English default)', kind: 'chirp3hd', languageCode: 'en-US' },
  { id: 'en-US-Chirp3-HD-Aoede', label: 'Aoede — female, warm', kind: 'chirp3hd', languageCode: 'en-US' },
  { id: 'en-US-Chirp3-HD-Charon', label: 'Charon — male, calm', kind: 'chirp3hd', languageCode: 'en-US' },
  { id: 'en-US-Chirp3-HD-Puck', label: 'Puck — male, upbeat', kind: 'chirp3hd', languageCode: 'en-US' },
  { id: 'fil-ph-Neural2-A', label: 'Filipino — female (Taglish default)', kind: 'neural2', languageCode: 'fil-PH' },
  { id: 'fil-ph-Neural2-D', label: 'Filipino — male', kind: 'neural2', languageCode: 'fil-PH' },
  { id: 'en-US-Neural2-C', label: 'Classic (older voice)', kind: 'neural2', languageCode: 'en-US' },
]

export const DEFAULT_NARRATION_VOICE = NARRATION_VOICES[0].id

/** Taglish → the Filipino voice (pronounces Tagalog correctly); English → Kore. */
export function defaultVoiceFor(language: 'english' | 'taglish' | null | undefined): string {
  return language === 'english' ? 'en-US-Chirp3-HD-Kore' : 'fil-ph-Neural2-A'
}

export function getNarrationVoice(id: string | null | undefined): NarrationVoice {
  return NARRATION_VOICES.find((v) => v.id === id) ?? NARRATION_VOICES[0]
}
