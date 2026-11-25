-- Migration 00113: more animated reel styles
--
-- reel_render_jobs.style had a CHECK listing the first six styles. The app
-- validates the style (isReelStyle in src/lib/marketing/reel-styles.ts), so
-- drop the CHECK; new styles then need no migration.

DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint con
    WHERE con.conrelid = 'reel_render_jobs'::regclass AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%style%'
  LOOP
    EXECUTE format('ALTER TABLE reel_render_jobs DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
