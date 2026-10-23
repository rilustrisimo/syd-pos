-- Content ideas carry a post format (single image, carousel or reel), a
-- ready-to-paste prompt for whatever tool produces the creative (Canva for
-- images/carousels), and stock media search terms (mainly for reels, built
-- natively from library clips). All optional on import, so older 3-column
-- idea CSVs keep working. The format is copied onto the suggestion so the
-- Feed knows which tools to offer (e.g. the reel builder).

ALTER TABLE content_ideas
  ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'image'
    CHECK (format IN ('image', 'carousel', 'reel')),
  ADD COLUMN IF NOT EXISTS creative_prompt text,
  ADD COLUMN IF NOT EXISTS stock_keywords text;

ALTER TABLE content_suggestions
  ADD COLUMN IF NOT EXISTS format text
    CHECK (format IN ('image', 'carousel', 'reel'));
