-- Marketing insights imported from CSV exports (Meta Business Suite post
-- insights, Ads Manager ad results, GA4 reports). CSV rather than API
-- connections: free, no Meta app review or tokens. Each table has a
-- natural unique key so re-uploading an overlapping export updates rows
-- instead of duplicating them. Feeds the best-time heatmap and the
-- Gemini content planner.

CREATE TABLE IF NOT EXISTS social_post_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL CHECK (platform IN ('facebook', 'instagram')),
  external_id text NOT NULL,
  published_at timestamptz NOT NULL,
  post_type text,
  text text,
  permalink text,
  reach integer,
  impressions integer,
  reactions integer,
  comments integer,
  shares integer,
  saves integer,
  link_clicks integer,
  video_views integer,
  follows integer,
  concept_code text,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, external_id)
);

CREATE TABLE IF NOT EXISTS ad_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_name text NOT NULL,
  adset_name text,
  campaign_name text,
  period_start date NOT NULL,
  period_end date NOT NULL,
  impressions integer,
  reach integer,
  link_clicks integer,
  results numeric,
  result_type text,
  spend numeric(12, 2),
  follows integer,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ad_name, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS ga_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension text NOT NULL,
  dimension_value text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dimension, dimension_value, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS social_post_metrics_published_idx ON social_post_metrics (published_at DESC);
CREATE INDEX IF NOT EXISTS ad_metrics_period_idx ON ad_metrics (period_end DESC);

ALTER TABLE social_post_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE ga_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage social post metrics" ON social_post_metrics
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'manager')));

CREATE POLICY "Staff can manage ad metrics" ON ad_metrics
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'manager')));

CREATE POLICY "Staff can manage GA metrics" ON ga_metrics
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'manager')));
