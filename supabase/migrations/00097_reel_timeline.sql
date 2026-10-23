-- Reel builder v2: the edited reel timeline (clip order, per-clip length,
-- trim start and keep-sound flag, plus edited/nudged captions), saved so
-- staff can reopen a reel and keep editing. Shape is defined by
-- ReelTimeline in src/lib/marketing/reel-timeline.ts. Null until the
-- builder is first used for a suggestion.

ALTER TABLE content_suggestions
  ADD COLUMN IF NOT EXISTS reel_timeline jsonb;
