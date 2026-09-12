-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00086: Content media library (Phase A of the marketing tool)
--
-- Staff need one place to upload photos and videos meant for social media
-- posts. The actual file bytes live in Cloudflare R2 (not Supabase Storage —
-- every existing bucket here is a 5MB, images-only convention, and R2's
-- zero-egress-fee model suits video specifically much better). This table
-- just tracks metadata + the R2 object key; content_suggestions and
-- scheduled_posts (Phases B/C) are deliberately not created yet — added in
-- their own migrations once those features are actually being built, so we
-- don't carry unused schema ahead of the code that uses it.
--
-- Internal-only tool — no customer/public access, so only a staff-manage
-- policy is needed (no anon/public SELECT policy at all).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS content_media (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_type         text NOT NULL CHECK (media_type IN ('image', 'video')),
  storage_key        text NOT NULL,              -- object key in the R2 bucket
  original_filename  text NOT NULL,
  mime_type          text NOT NULL,
  size_bytes         bigint NOT NULL,
  duration_seconds   numeric(8,2),                -- video only
  transcript         text,                        -- video only, filled after Whisper
  transcript_status  text NOT NULL DEFAULT 'pending'
                        CHECK (transcript_status IN ('pending', 'processing', 'done', 'skipped', 'failed')),
  uploaded_by        uuid REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE content_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage content media"
ON content_media FOR ALL
TO authenticated
USING (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'manager'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'manager'))
);
