-- Phase C of the marketing content management build: a calendar of
-- scheduled posts. Staff still post to Facebook/Instagram manually and
-- mark the entry posted here — no auto-publish yet (that's Phase D).

CREATE TABLE IF NOT EXISTS scheduled_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id uuid NOT NULL REFERENCES content_suggestions(id) ON DELETE CASCADE,
  platform text NOT NULL DEFAULT 'facebook' CHECK (platform IN ('facebook', 'instagram', 'both')),
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'posted', 'failed')),
  posted_at timestamptz,
  notes text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_scheduled_at ON scheduled_posts(scheduled_at);

ALTER TABLE scheduled_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage scheduled posts" ON scheduled_posts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'manager')));
