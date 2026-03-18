-- ============================================================
-- Migration 00042: Liability Payables (Accounts Payable / Trade Credit)
-- ============================================================

-- Status enum for payables
CREATE TYPE liability_payable_status AS ENUM ('unpaid', 'partial', 'paid', 'overdue');

-- Main payables table (AP / Trade Payables)
CREATE TABLE liability_payables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payable_number VARCHAR(50) UNIQUE NOT NULL,         -- PAY-YYYYMMDD-XXXX
  branch_id UUID NOT NULL REFERENCES branches(id),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  description TEXT,
  invoice_reference VARCHAR(100),                     -- supplier's invoice number
  total_amount DECIMAL(12,2) NOT NULL CHECK (total_amount > 0),
  paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  credit_days INTEGER NOT NULL DEFAULT 30,            -- Net X days
  due_date DATE NOT NULL,                             -- computed: invoice_date + credit_days (set by app)
  status liability_payable_status NOT NULL DEFAULT 'unpaid',
  notes TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_liability_payables_branch ON liability_payables(branch_id);
CREATE INDEX idx_liability_payables_supplier ON liability_payables(supplier_id);
CREATE INDEX idx_liability_payables_status ON liability_payables(status);
CREATE INDEX idx_liability_payables_due_date ON liability_payables(due_date);
CREATE INDEX idx_liability_payables_not_deleted ON liability_payables(is_deleted, due_date);

-- Junction table: one payable can link to multiple POs
CREATE TABLE liability_payable_po_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payable_id UUID NOT NULL REFERENCES liability_payables(id) ON DELETE CASCADE,
  po_id UUID NOT NULL REFERENCES purchase_orders(id),
  amount DECIMAL(12,2),                               -- optional: portion of this PO
  notes VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(payable_id, po_id)
);

CREATE INDEX idx_payable_po_links_payable ON liability_payable_po_links(payable_id);
CREATE INDEX idx_payable_po_links_po ON liability_payable_po_links(po_id);

-- Payments against a payable (supports partial payments)
CREATE TABLE liability_payable_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payable_id UUID NOT NULL REFERENCES liability_payables(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method payment_method NOT NULL,             -- reuses existing enum
  reference_number VARCHAR(100),
  notes VARCHAR(500),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payable_payments_payable ON liability_payable_payments(payable_id);

-- ── Trigger: sync paid_amount and status after payment insert/delete ──────────

CREATE OR REPLACE FUNCTION sync_payable_payment_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_payable_id UUID;
  v_paid_amount DECIMAL(12,2);
  v_total_amount DECIMAL(12,2);
  v_due_date DATE;
  v_new_status liability_payable_status;
BEGIN
  -- Determine which payable to update
  IF TG_OP = 'DELETE' THEN
    v_payable_id := OLD.payable_id;
  ELSE
    v_payable_id := NEW.payable_id;
  END IF;

  -- Recalculate totals
  SELECT
    COALESCE(SUM(p.amount), 0),
    lp.total_amount,
    lp.due_date
  INTO v_paid_amount, v_total_amount, v_due_date
  FROM liability_payables lp
  LEFT JOIN liability_payable_payments p ON p.payable_id = lp.id
  WHERE lp.id = v_payable_id
  GROUP BY lp.total_amount, lp.due_date;

  -- Determine new status
  IF v_paid_amount >= v_total_amount THEN
    v_new_status := 'paid';
  ELSIF v_paid_amount > 0 THEN
    v_new_status := 'partial';
  ELSIF v_due_date < CURRENT_DATE THEN
    v_new_status := 'overdue';
  ELSE
    v_new_status := 'unpaid';
  END IF;

  UPDATE liability_payables
  SET
    paid_amount = v_paid_amount,
    status = v_new_status,
    updated_at = NOW()
  WHERE id = v_payable_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_payable_payment_change
AFTER INSERT OR DELETE ON liability_payable_payments
FOR EACH ROW EXECUTE FUNCTION sync_payable_payment_totals();

-- ── Function: auto-generate payable number (PAY-YYYYMMDD-XXXX) ───────────────

CREATE OR REPLACE FUNCTION generate_payable_number()
RETURNS TEXT AS $$
DECLARE
  v_today TEXT := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');
  v_seq INT;
  v_number TEXT;
BEGIN
  SELECT COUNT(*) + 1 INTO v_seq
  FROM liability_payables
  WHERE payable_number LIKE 'PAY-' || v_today || '-%';

  v_number := 'PAY-' || v_today || '-' || LPAD(v_seq::TEXT, 4, '0');
  RETURN v_number;
END;
$$ LANGUAGE plpgsql;

-- ── RLS Policies ─────────────────────────────────────────────────────────────

ALTER TABLE liability_payables ENABLE ROW LEVEL SECURITY;
ALTER TABLE liability_payable_po_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE liability_payable_payments ENABLE ROW LEVEL SECURITY;

-- Admins, managers, accountants can read
CREATE POLICY "liability_payables_read" ON liability_payables
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'manager', 'accountant')
    )
  );

-- Admins and managers can insert/update
CREATE POLICY "liability_payables_write" ON liability_payables
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'manager', 'accountant')
    )
  );

CREATE POLICY "payable_po_links_all" ON liability_payable_po_links
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'manager', 'accountant')
    )
  );

CREATE POLICY "payable_payments_all" ON liability_payable_payments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'manager', 'accountant')
    )
  );
