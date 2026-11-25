-- Migration 00112: English or Taglish per idea and post
--
-- Chosen when ideas are generated (Ideas page). Captions, scripts,
-- voiceovers and animated-reel text follow it, and Taglish posts default
-- to the Filipino narration voice (fil-PH), which pronounces Tagalog
-- correctly.

ALTER TABLE content_ideas
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'taglish'
  CHECK (language IN ('english', 'taglish'));

ALTER TABLE content_suggestions
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'taglish'
  CHECK (language IN ('english', 'taglish'));
