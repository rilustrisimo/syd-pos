-- Migration 00111: Animated reel render jobs
--
-- Staff pick a style for a reel post; the app inserts a job here and starts
-- the GitHub Actions workflow (.github/workflows/render-reel.yml), which
-- renders public/reel-templates/<style>.html with reel-renderer/render.mjs,
-- uploads the MP4 to R2, creates the content_media row, attaches it to the
-- post and marks the job done. The app polls this table for status.
--
-- Staff (admin/manager) can create and read jobs; only the worker (service
-- role, which bypasses RLS) updates them.

CREATE TABLE IF NOT EXISTS reel_render_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id     uuid NOT NULL REFERENCES content_suggestions(id) ON DELETE CASCADE,
  style             text NOT NULL CHECK (style IN ('flat-poster', 'pop-comic', 'chalk-doodle', 'golden-neon', 'line-diagram', 'whiteboard')),
  storyboard        jsonb NOT NULL,
  -- Exactly what the template reads as window.REEL (scene times included).
  reel_data         jsonb NOT NULL,
  voice_media_id    uuid REFERENCES content_media(id) ON DELETE SET NULL,
  voice_storage_key text NOT NULL,
  status            text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'rendering', 'done', 'failed')),
  output_media_id   uuid REFERENCES content_media(id) ON DELETE SET NULL,
  error             text,
  github_run_url    text,
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  started_at        timestamptz,
  finished_at       timestamptz
);

CREATE INDEX IF NOT EXISTS reel_render_jobs_suggestion_idx ON reel_render_jobs (suggestion_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reel_render_jobs_created_idx ON reel_render_jobs (created_at DESC);

ALTER TABLE reel_render_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read reel render jobs" ON reel_render_jobs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'manager')));

CREATE POLICY "Staff can queue reel render jobs" ON reel_render_jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND status = 'queued'
    AND EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'manager'))
  );

-- The app marks a job failed when it can't start the GitHub workflow.
CREATE POLICY "Staff can fail their queued jobs" ON reel_render_jobs
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() AND status = 'queued')
  WITH CHECK (created_by = auth.uid() AND status = 'failed');

-- Content suggestions keep the storyboard staff edited, so reopening the
-- dialog shows it again (one storyboard per post).
ALTER TABLE content_suggestions ADD COLUMN IF NOT EXISTS reel_storyboard jsonb;
