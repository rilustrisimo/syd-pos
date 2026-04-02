-- ── Tax Settings ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tax_settings (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id                   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  bir_tin                     TEXT,
  tax_regime                  TEXT NOT NULL DEFAULT 'comparison'
                                CHECK (tax_regime IN ('8_flat','graduated_osd','graduated_itemized','comparison')),
  lbt_rate                    NUMERIC(6,4) NOT NULL DEFAULT 0.0100,
  mayors_permit_amount        NUMERIC(10,2) NOT NULL DEFAULT 0,
  barangay_clearance_amount   NUMERIC(10,2) NOT NULL DEFAULT 0,
  bir_registration_amount     NUMERIC(10,2) NOT NULL DEFAULT 500,
  notify_days_before          INTEGER[]     NOT NULL DEFAULT '{30,14,7,3,1}',
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(branch_id)
);

-- ── Tax Payments ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tax_payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id        UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  payment_number   TEXT NOT NULL,
  tax_type         TEXT NOT NULL
                     CHECK (tax_type IN ('2551q','1701q','1701a','0605','lbt','mayors_permit','barangay_clearance')),
  period_year      INTEGER NOT NULL,
  period_quarter   INTEGER CHECK (period_quarter BETWEEN 1 AND 4),
  amount_due       NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_paid      NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_date     DATE NOT NULL,
  reference_number TEXT,
  notes            TEXT,
  is_deleted       BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at       TIMESTAMPTZ,
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Auto-number function ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_tax_payment_number()
RETURNS TRIGGER AS $$
DECLARE
  today_str TEXT := TO_CHAR(NOW() AT TIME ZONE 'Asia/Manila', 'YYYYMMDD');
  seq_num   INTEGER;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(payment_number FROM LENGTH('TAX-' || today_str || '-') + 1) AS INTEGER)
  ), 0) + 1
  INTO seq_num
  FROM tax_payments
  WHERE payment_number LIKE 'TAX-' || today_str || '-%';

  NEW.payment_number := 'TAX-' || today_str || '-' || LPAD(seq_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tax_payment_number
  BEFORE INSERT ON tax_payments
  FOR EACH ROW
  WHEN (NEW.payment_number IS NULL OR NEW.payment_number = '')
  EXECUTE FUNCTION generate_tax_payment_number();

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE tax_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_payments  ENABLE ROW LEVEL SECURITY;

-- tax_settings: all authenticated users can read; admin/manager/accountant can write
CREATE POLICY "tax_settings_read"   ON tax_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "tax_settings_write"  ON tax_settings FOR ALL    TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('admin','manager','accountant')
    )
  );

-- tax_payments: all authenticated users can read; admin/manager/accountant can write
CREATE POLICY "tax_payments_read"   ON tax_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "tax_payments_write"  ON tax_payments FOR ALL    TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('admin','manager','accountant')
    )
  );

-- ── Seed default settings for existing branches ───────────────────────────────

INSERT INTO tax_settings (branch_id)
SELECT id FROM branches WHERE is_active = true
ON CONFLICT (branch_id) DO NOTHING;
