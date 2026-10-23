-- Caption timing for reels: when each short caption chunk of the voice
-- script starts in the synthesized narration, as [{ "text", "start" }]
-- (start in seconds). Filled by synthesize-voice from Google TTS SSML mark
-- timepoints; the reel builder burns these in as subtitles. Null for
-- narration synthesized before this existed (the builder then spreads
-- captions across the audio by character count).

ALTER TABLE content_suggestions
  ADD COLUMN IF NOT EXISTS voice_timepoints jsonb;
