-- Migration 00103: Canva prompt on Feed posts made without an idea
--
-- Detailed Canva prompts are (re)generated from the Ideas page and the Feed.
-- Posts that came from an idea keep the prompt on content_ideas; posts made
-- straight from a product or photo have no idea, so they store it here.

ALTER TABLE content_suggestions
  ADD COLUMN IF NOT EXISTS creative_prompt text;
