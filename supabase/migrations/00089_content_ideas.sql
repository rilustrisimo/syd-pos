-- Phase D-0 of the marketing content pipeline: a durable bank of post
-- ideas (the reference briefs scripts/creatives get generated from),
-- replacing the ad-hoc "type notes into the form" flow. Plays the role
-- a Notion board would in an external automation tool, built natively
-- instead of standing up a second system.

CREATE TABLE IF NOT EXISTS content_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  image_concept text,
  source_product_id uuid REFERENCES products(id),
  status text NOT NULL DEFAULT 'idea' CHECK (status IN ('idea', 'created', 'posted')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE content_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage content ideas" ON content_ideas
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'manager')));

ALTER TABLE content_suggestions
  ADD COLUMN IF NOT EXISTS source_idea_id uuid REFERENCES content_ideas(id);
