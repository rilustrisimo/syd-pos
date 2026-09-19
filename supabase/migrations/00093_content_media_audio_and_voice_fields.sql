-- Phase D-3 of the marketing content pipeline: AI voice narration.
-- Widens content_media.media_type to allow 'audio' (for synthesized
-- narration clips, stored the same way as generated creatives) and
-- adds the voice script + link to its synthesized audio on
-- content_suggestions.
--
-- The CHECK constraint is widened by looking up its actual name
-- dynamically rather than assuming Postgres's default naming — there's
-- no existing "widen a CHECK" migration in this repo to copy verbatim,
-- so this is the defensively-correct approach instead of a guess.
DO $$
DECLARE
  existing_constraint text;
BEGIN
  SELECT con.conname INTO existing_constraint
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'content_media'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%media_type%';

  IF existing_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE content_media DROP CONSTRAINT %I', existing_constraint);
  END IF;
END $$;

ALTER TABLE content_media
  ADD CONSTRAINT content_media_media_type_check
  CHECK (media_type IN ('image', 'video', 'audio'));

ALTER TABLE content_suggestions
  ADD COLUMN IF NOT EXISTS voice_script text,
  ADD COLUMN IF NOT EXISTS voice_media_id uuid REFERENCES content_media(id);
