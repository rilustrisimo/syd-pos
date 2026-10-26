-- Special requests from the online shop: a customer asks for something
-- that isn't in the catalog (description, quantity, sample photos) as part
-- of their quote request. Stored as an order line with no product
-- (online_order_lines.product_id is already nullable), flagged so staff can
-- review it and replace it with a real product before converting the
-- order to a sale.

ALTER TABLE online_order_lines
  ADD COLUMN IF NOT EXISTS is_special_request boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS request_description text,
  ADD COLUMN IF NOT EXISTS request_photos text[];

-- Private bucket for the customers' sample photos. Uploads happen
-- server-side in syd-shop with the service role (bypasses RLS); staff read
-- them from syd-pos through signed URLs, which needs this SELECT policy
-- (same pattern as payment-proofs, migration 00074).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('special-request-photos', 'special-request-photos', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'authenticated_read_special_request_photos'
  ) THEN
    CREATE POLICY "authenticated_read_special_request_photos"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'special-request-photos');
  END IF;
END $$;
