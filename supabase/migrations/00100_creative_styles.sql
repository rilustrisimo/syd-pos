-- Creative differentiation (Meta: creatives that look too alike are
-- delivered as one — "Creative limited" / "Creative fatigue"). Ideas and
-- suggestions carry their creative style (how it's made: listicle, Q&A,
-- transition, …; see src/lib/marketing/creative-styles.ts), reels carry
-- their on-screen text stickers, and imported ad results keep Ads
-- Manager's Delivery status so those warnings reach the planner.

ALTER TABLE content_ideas
  ADD COLUMN IF NOT EXISTS creative_style text,
  ADD COLUMN IF NOT EXISTS reel_stickers jsonb;

ALTER TABLE content_suggestions
  ADD COLUMN IF NOT EXISTS creative_style text,
  ADD COLUMN IF NOT EXISTS reel_stickers jsonb;

ALTER TABLE ad_metrics
  ADD COLUMN IF NOT EXISTS delivery_status text;
