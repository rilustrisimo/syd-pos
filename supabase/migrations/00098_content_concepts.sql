-- Content ideas become "concepts" for Meta's creative-led delivery: who
-- the post speaks to (audience), its problem/proof hook (angle), and a
-- short code used as the Meta ad name and the link's utm_content, so ad
-- results (Ads Manager) and site results (GA4) line up per concept.
-- Daily-plan items from the AI planner also carry the date they're for,
-- the suggested posting time, hashtags and tag suggestions.

ALTER TABLE content_ideas
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'general'
    CHECK (audience IN ('contractor', 'business_farm', 'family_build', 'general')),
  ADD COLUMN IF NOT EXISTS angle text,
  ADD COLUMN IF NOT EXISTS concept_code text,
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'daily'
    CHECK (purpose IN ('daily', 'ad')),
  ADD COLUMN IF NOT EXISTS planned_for date,
  ADD COLUMN IF NOT EXISTS best_time text,
  ADD COLUMN IF NOT EXISTS hashtags text,
  ADD COLUMN IF NOT EXISTS tags text;

ALTER TABLE content_suggestions
  ADD COLUMN IF NOT EXISTS audience text
    CHECK (audience IN ('contractor', 'business_farm', 'family_build', 'general')),
  ADD COLUMN IF NOT EXISTS concept_code text;
