// Narration voices for reels (Google Cloud Text-to-Speech, free tier:
// 1M characters/month for both Chirp 3 HD and Neural2). Chirp 3 HD voices
// sound far more natural; Kore was picked by the owner as the default.
// English only — there are no Filipino Chirp 3 HD voices, and reel
// voiceovers are written in plain English anyway.

export interface NarrationVoice {
  id: string
  label: string
  /** Chirp 3 HD returns no SSML mark timepoints, so it's synthesized per sentence. */
  kind: 'chirp3hd' | 'neural2'
}

export const NARRATION_VOICES: NarrationVoice[] = [
  { id: 'en-US-Chirp3-HD-Kore', label: 'Kore — female, firm (default)', kind: 'chirp3hd' },
  { id: 'en-US-Chirp3-HD-Aoede', label: 'Aoede — female, warm', kind: 'chirp3hd' },
  { id: 'en-US-Chirp3-HD-Charon', label: 'Charon — male, calm', kind: 'chirp3hd' },
  { id: 'en-US-Chirp3-HD-Puck', label: 'Puck — male, upbeat', kind: 'chirp3hd' },
  { id: 'en-US-Neural2-C', label: 'Classic (older voice)', kind: 'neural2' },
]

export const DEFAULT_NARRATION_VOICE = NARRATION_VOICES[0].id

export function getNarrationVoice(id: string | null | undefined): NarrationVoice {
  return NARRATION_VOICES.find((v) => v.id === id) ?? NARRATION_VOICES[0]
}
