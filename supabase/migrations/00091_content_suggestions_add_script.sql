-- Phase D-2 of the marketing content pipeline: the script becomes the
-- master content unit — captions and creatives derive from it going
-- forward, instead of the caption being generated independently.
-- Nullable since existing rows predate this and have no script.

ALTER TABLE content_suggestions ADD COLUMN IF NOT EXISTS script text;
