-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00087: Content suggestions (Phase B of the marketing tool)
--
-- AI-drafted post ideas awaiting staff review. Two separate media
-- references, both pointing at the Phase A content_media library:
--   - source_media_id: the photo/video used as inspiration/basis for the draft
--   - creative_media_id: the finished graphic, made manually in Canva and
--     uploaded back into the library — Canva's Autofill API is deliberately
--     not wired up yet (Phase D), so "creative" for now is staff pasting a
--     manually-exported design back in, not something this table generates.
--
-- Same internal-only RLS pattern as content_media — staff-manage only, no
-- public/anon policy.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS content_suggestions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_product_id  uuid REFERENCES products(id),
  source_media_id    uuid REFERENCES content_media(id),
  creative_media_id  uuid REFERENCES content_media(id),
  platform           text NOT NULL DEFAULT 'facebook'
                        CHECK (platform IN ('facebook', 'instagram', 'both')),
  notes              text,                    -- staff's brief/context when generating
  caption_draft      text NOT NULL,           -- Claude's original draft, never overwritten
  caption_final      text,                    -- staff-edited version; falls back to caption_draft when null
  status             text NOT NULL DEFAULT 'suggested'
                        CHECK (status IN ('suggested', 'approved', 'rejected')),
  reviewed_by        uuid REFERENCES users(id),
  reviewed_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE content_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage content suggestions"
ON content_suggestions FOR ALL
TO authenticated
USING (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'manager'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'manager'))
);
