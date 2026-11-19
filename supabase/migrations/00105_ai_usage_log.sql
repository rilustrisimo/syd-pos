-- Migration 00105: AI usage log
--
-- One row per Gemini / Google TTS attempt, written by src/lib/ai-usage-log.ts.
-- Shows which feature uses the free-tier quota, and when a Gemini model hit
-- its limit (status 'rate_limited') and the call fell back to a lighter one
-- (fallback_level > 0 on the 'ok' row).

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  feature text NOT NULL,
  provider text NOT NULL,           -- 'gemini' | 'google-tts'
  model text NOT NULL,              -- Gemini model id, or TTS voice id
  status text NOT NULL,             -- 'ok' | 'rate_limited' | 'unavailable' | 'error'
  http_status integer,
  fallback_level integer NOT NULL DEFAULT 0,
  input_tokens integer,
  output_tokens integer,
  characters integer,               -- TTS characters sent
  error text
);

CREATE INDEX IF NOT EXISTS ai_usage_log_created_at_idx ON ai_usage_log (created_at DESC);

ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;

-- Every AI route is limited to admin/manager, so only they write rows.
CREATE POLICY "Staff can log AI usage"
ON ai_usage_log FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'manager'))
);

CREATE POLICY "Staff can read AI usage"
ON ai_usage_log FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'manager'))
);
