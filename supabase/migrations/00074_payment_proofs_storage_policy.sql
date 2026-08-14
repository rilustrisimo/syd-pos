-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00074: Storage read policy for the private payment-proofs bucket
--
-- payment-proofs was created as a private bucket (uploads happen server-side
-- via the service role, which bypasses RLS). But staff viewing a proof in the
-- POS order detail page need to read it from the browser, which uses the
-- authenticated (staff-login) session — that requires an explicit SELECT
-- policy on storage.objects for this bucket. Without it, both direct object
-- fetches and createSignedUrl() calls fail for logged-in staff.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'authenticated_read_payment_proofs'
  ) THEN
    CREATE POLICY "authenticated_read_payment_proofs"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'payment-proofs');
  END IF;
END $$;
