-- ============================================================
-- Migration 00045: Notification Cron Setup
--
-- IMPORTANT: Run this AFTER the Edge Function is deployed.
-- pg_cron calls the Edge Function daily at 8:00 AM Philippine Time (UTC 00:00).
--
-- Prerequisites:
--   1. Enable pg_cron in Supabase Dashboard → Database → Extensions
--   2. Enable pg_net in Supabase Dashboard → Database → Extensions
--   3. Deploy supabase/functions/send-payment-reminders
--   4. Set the following Supabase secrets:
--      RESEND_API_KEY=re_xxxx
--      APP_FROM_EMAIL=noreply@yourdomain.com
-- ============================================================

-- Enable required extensions (safe to run even if already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove existing job if re-running migration
SELECT cron.unschedule('daily-liability-reminders')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily-liability-reminders'
);

-- Schedule daily run at midnight UTC = 8:00 AM Philippine Time (UTC+8)
SELECT cron.schedule(
  'daily-liability-reminders',
  '0 0 * * *',
  $$
  SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/send-payment-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- NOTE: If using Supabase Vault is not available on your plan, replace the
-- vault.decrypted_secrets references with hard-coded strings:
--   url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-payment-reminders',
--   headers := jsonb_build_object(
--     'Content-Type',  'application/json',
--     'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
--   ),
