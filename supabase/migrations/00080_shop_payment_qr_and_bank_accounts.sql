-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00080: Multiple payment QR codes + bank accounts for the shop
--
-- shop_settings previously only supported ONE generic QR image
-- (qr_code_url) and ONE bank account (bank_name/bank_account_no/
-- bank_account_name) - too limited for a checkout that needs to offer
-- several QR options (GCash, BDO, BPI, GoTyme) and list several bank
-- accounts for direct transfer. These are naturally multi-row lists, so
-- they get their own tables rather than more flat columns on the
-- singleton shop_settings row.
--
-- The old shop_settings columns are left in place (unused going forward,
-- but not dropped) since nothing currently reads/writes them from either
-- app per investigation - safe to leave as dead columns rather than risk
-- a destructive drop.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shop_qr_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label       text NOT NULL,        -- e.g. "GCash", "BDO", "BPI", "GoTyme"
  image_url   text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shop_bank_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name       text NOT NULL,       -- e.g. "BDO", "BPI", "GCash", "GoTyme", "Security Bank"
  account_name    text NOT NULL,
  account_number  text NOT NULL,
  sort_order      integer NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shop_qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_bank_accounts ENABLE ROW LEVEL SECURITY;

-- Public (anon) read of active rows only — the storefront's checkout
-- needs this; inactive/retired entries stay hidden from customers.
CREATE POLICY "Public can view active QR codes"
ON shop_qr_codes FOR SELECT
TO anon, authenticated
USING (is_active = true);

CREATE POLICY "Public can view active bank accounts"
ON shop_bank_accounts FOR SELECT
TO anon, authenticated
USING (is_active = true);

-- Staff (admin/manager) manage these — payment settings are more
-- sensitive than product photos, so narrower than the inventory_staff
-- role also granted on product-images.
CREATE POLICY "Staff can manage QR codes"
ON shop_qr_codes FOR ALL
TO authenticated
USING (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'manager'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'manager'))
);

CREATE POLICY "Staff can manage bank accounts"
ON shop_bank_accounts FOR ALL
TO authenticated
USING (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'manager'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'manager'))
);

-- Storage bucket for QR code images, mirroring product-images' setup.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'shop-qr-codes',
  'shop-qr-codes',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can view QR code images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'shop-qr-codes');

CREATE POLICY "Staff can upload QR code images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'shop-qr-codes' AND
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'manager'))
);

CREATE POLICY "Staff can update QR code images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'shop-qr-codes' AND
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'manager'))
);

CREATE POLICY "Staff can delete QR code images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'shop-qr-codes' AND
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'manager'))
);
