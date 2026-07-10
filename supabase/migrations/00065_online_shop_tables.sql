-- ─── Online Shop Tables ───────────────────────────────────────────────────────
-- New tables for sydconstruct.com e-commerce storefront.
-- Existing POS tables (products, branches, branch_inventory, etc.) are read-only
-- from the shop — no schema changes to those tables.

-- ─── 1. Shop Settings (single row) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shop_settings (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name                  TEXT NOT NULL DEFAULT 'SYD Construction Supplies',
  store_phone                 TEXT,
  store_address               TEXT,
  store_latitude              NUMERIC(10,7) NOT NULL DEFAULT 0,
  store_longitude             NUMERIC(10,7) NOT NULL DEFAULT 0,
  gcash_number                TEXT,
  gcash_name                  TEXT,
  bank_name                   TEXT,
  bank_account_no             TEXT,
  bank_account_name           TEXT,
  qr_code_url                 TEXT,
  store_hours                 TEXT,
  staff_notification_emails   TEXT,   -- comma-separated
  delivery_fee_flat           NUMERIC(8,2) NOT NULL DEFAULT 50,
  delivery_fee_per_km         NUMERIC(8,2) NOT NULL DEFAULT 30,
  cod_radius_km               NUMERIC(4,1) NOT NULL DEFAULT 5,
  branch_id                   uuid REFERENCES branches(id),  -- which branch's inventory to show
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 2. Per-product shop visibility override ──────────────────────────────────
CREATE TABLE IF NOT EXISTS shop_product_overrides (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  hidden_online BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id)
);

-- ─── 3. Order number sequence ─────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS online_order_number_seq START 1;

-- ─── 4. Online Orders ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS online_orders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number          TEXT UNIQUE NOT NULL DEFAULT '',
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','confirmed','preparing','out_for_delivery','delivered','picked_up','cancelled')),
  fulfillment           TEXT NOT NULL
                          CHECK (fulfillment IN ('delivery','pickup')),
  customer_name         TEXT NOT NULL,
  customer_phone        TEXT NOT NULL,
  address               TEXT,
  barangay              TEXT,
  municipality          TEXT,
  province              TEXT,
  latitude              NUMERIC(10,7),
  longitude             NUMERIC(10,7),
  distance_km           NUMERIC(6,2),
  payment_method        TEXT NOT NULL
                          CHECK (payment_method IN ('cod','gcash','bank_transfer','qr')),
  payment_status        TEXT NOT NULL DEFAULT 'unpaid'
                          CHECK (payment_status IN ('unpaid','submitted','verified','refunded')),
  payment_proof_url     TEXT,
  payment_reference_no  TEXT,
  subtotal              NUMERIC(12,2) NOT NULL,
  delivery_fee          NUMERIC(8,2)  NOT NULL DEFAULT 0,
  total_amount          NUMERIC(12,2) NOT NULL,
  notes                 TEXT,
  customer_id           uuid REFERENCES customers(id),
  transaction_id        uuid REFERENCES transactions(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger: auto-set order_number before insert
CREATE OR REPLACE FUNCTION set_online_order_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.order_number := 'SYD-' || LPAD(nextval('online_order_number_seq')::text, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_online_order_number
  BEFORE INSERT ON online_orders
  FOR EACH ROW
  WHEN (NEW.order_number = '')
  EXECUTE FUNCTION set_online_order_number();

-- updated_at trigger for online_orders
CREATE OR REPLACE FUNCTION touch_online_order_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_online_order_updated_at
  BEFORE UPDATE ON online_orders
  FOR EACH ROW
  EXECUTE FUNCTION touch_online_order_updated_at();

-- ─── 5. Online Order Lines ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS online_order_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES online_orders(id) ON DELETE CASCADE,
  product_id    uuid REFERENCES products(id),   -- nullable (product may be deleted later)
  product_code  TEXT NOT NULL,                  -- snapshot at order time
  product_name  TEXT NOT NULL,                  -- snapshot at order time
  unit_label    TEXT NOT NULL,                  -- e.g. "per bag" (snapshot)
  unit_price    NUMERIC(12,2) NOT NULL,         -- snapshot at order time
  quantity      NUMERIC(10,2) NOT NULL,
  line_total    NUMERIC(12,2) NOT NULL
);

-- ─── 6. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_online_orders_status      ON online_orders(status);
CREATE INDEX IF NOT EXISTS idx_online_orders_customer_id ON online_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_online_orders_created_at  ON online_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_online_order_lines_order  ON online_order_lines(order_id);

-- ─── 7. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE shop_settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_product_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_order_lines     ENABLE ROW LEVEL SECURITY;

-- shop_settings: anyone can read (store name, payment details, delivery config)
-- store_latitude / store_longitude are excluded at the query level in syd-shop,
-- not at RLS level — RLS just allows the row to be read by anon.
CREATE POLICY "public_read_shop_settings"
  ON shop_settings FOR SELECT
  USING (true);

CREATE POLICY "auth_all_shop_settings"
  ON shop_settings FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- shop_product_overrides: anyone can read (shop needs to know which products are hidden)
CREATE POLICY "public_read_shop_product_overrides"
  ON shop_product_overrides FOR SELECT
  USING (true);

CREATE POLICY "auth_all_shop_product_overrides"
  ON shop_product_overrides FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- online_orders: anon can INSERT only; staff (authenticated) can read + update
CREATE POLICY "anon_insert_online_orders"
  ON online_orders FOR INSERT
  WITH CHECK (true);

CREATE POLICY "auth_all_online_orders"
  ON online_orders FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- online_order_lines: anon can INSERT; staff can read
CREATE POLICY "anon_insert_online_order_lines"
  ON online_order_lines FOR INSERT
  WITH CHECK (true);

CREATE POLICY "auth_all_online_order_lines"
  ON online_order_lines FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- ─── 8. RLS on existing tables read by the shop (anon SELECT) ─────────────────
-- Only add if the policy doesn't already exist. These tables may already have
-- authenticated-only policies — we add a separate anon read policy alongside them.

-- products: anon can read active products
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'products' AND policyname = 'anon_read_active_products'
  ) THEN
    CREATE POLICY "anon_read_active_products"
      ON products FOR SELECT
      USING (is_active = true);
  END IF;
END $$;

-- product_images: anon can read
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'product_images' AND policyname = 'anon_read_product_images'
  ) THEN
    CREATE POLICY "anon_read_product_images"
      ON product_images FOR SELECT
      USING (true);
  END IF;
END $$;

-- product_categories: anon can read active
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'product_categories' AND policyname = 'anon_read_active_categories'
  ) THEN
    CREATE POLICY "anon_read_active_categories"
      ON product_categories FOR SELECT
      USING (is_active = true);
  END IF;
END $$;

-- product_subcategories: anon can read active
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'product_subcategories' AND policyname = 'anon_read_active_subcategories'
  ) THEN
    CREATE POLICY "anon_read_active_subcategories"
      ON product_subcategories FOR SELECT
      USING (is_active = true);
  END IF;
END $$;

-- branch_inventory: anon can read (for stock levels)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'branch_inventory' AND policyname = 'anon_read_branch_inventory'
  ) THEN
    CREATE POLICY "anon_read_branch_inventory"
      ON branch_inventory FOR SELECT
      USING (true);
  END IF;
END $$;

-- units_of_measure: anon can read (for unit labels on product cards)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'units_of_measure' AND policyname = 'anon_read_units_of_measure'
  ) THEN
    CREATE POLICY "anon_read_units_of_measure"
      ON units_of_measure FOR SELECT
      USING (true);
  END IF;
END $$;

-- ─── 9. Storage bucket for payment proofs ─────────────────────────────────────
-- Run via Supabase Dashboard > Storage > New bucket, or via the management API.
-- Name: payment-proofs | Public: false | File size limit: 5MB
-- Policy: service role can insert (uploads happen server-side on Railway only).
-- The INSERT below is informational — Supabase Storage buckets are created via
-- the Dashboard or management API, not via SQL migration.
-- TODO: Create 'payment-proofs' bucket manually in Supabase Dashboard after running this migration.

-- ─── Grants ───────────────────────────────────────────────────────────────────
GRANT SELECT ON shop_settings          TO anon;
GRANT SELECT ON shop_product_overrides TO anon;
GRANT INSERT ON online_orders          TO anon;
GRANT INSERT ON online_order_lines     TO anon;
GRANT USAGE, SELECT ON SEQUENCE online_order_number_seq TO anon;
