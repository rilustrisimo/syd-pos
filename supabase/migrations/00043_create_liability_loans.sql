-- ============================================================
-- Migration 00043: Liability Loans (Business Loans / Notes Payable)
-- ============================================================

CREATE TYPE loan_status AS ENUM ('active', 'completed', 'defaulted');
CREATE TYPE installment_status AS ENUM ('upcoming', 'paid', 'partial', 'overdue');

-- Main loans table
CREATE TABLE liability_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_number VARCHAR(50) UNIQUE NOT NULL,              -- LOAN-YYYYMMDD-XXXX
  branch_id UUID NOT NULL REFERENCES branches(id),
  lender_name VARCHAR(200) NOT NULL,
  principal_amount DECIMAL(12,2) NOT NULL CHECK (principal_amount > 0),
  interest_rate_monthly DECIMAL(8,4) NOT NULL CHECK (interest_rate_monthly > 0),  -- e.g. 0.42 = 0.42%
  term_months INTEGER NOT NULL CHECK (term_months > 0),
  start_date DATE NOT NULL,
  monthly_payment DECIMAL(12,2) NOT NULL,               -- computed by app (PMT formula)
  total_interest DECIMAL(12,2) NOT NULL,
  total_payable DECIMAL(12,2) NOT NULL,
  outstanding_balance DECIMAL(12,2) NOT NULL,
  status loan_status NOT NULL DEFAULT 'active',
  notes TEXT,
  loan_reference VARCHAR(100),                          -- bank account / loan contract ID
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_liability_loans_branch ON liability_loans(branch_id);
CREATE INDEX idx_liability_loans_status ON liability_loans(status);
CREATE INDEX idx_liability_loans_not_deleted ON liability_loans(is_deleted, status);

-- Amortization schedule (one row per installment, generated at loan creation)
CREATE TABLE liability_loan_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES liability_loans(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL,
  due_date DATE NOT NULL,
  principal_portion DECIMAL(12,4) NOT NULL,
  interest_portion DECIMAL(12,4) NOT NULL,
  scheduled_amount DECIMAL(12,2) NOT NULL,              -- principal + interest (the regular monthly payment)
  balance_before DECIMAL(12,2) NOT NULL,
  balance_after DECIMAL(12,2) NOT NULL,
  paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  paid_date DATE,
  payment_reference VARCHAR(100),
  status installment_status NOT NULL DEFAULT 'upcoming',
  notes VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(loan_id, installment_number)
);

CREATE INDEX idx_loan_schedule_loan ON liability_loan_schedule(loan_id);
CREATE INDEX idx_loan_schedule_status ON liability_loan_schedule(status);
CREATE INDEX idx_loan_schedule_due_date ON liability_loan_schedule(due_date);
CREATE INDEX idx_loan_schedule_upcoming ON liability_loan_schedule(due_date, status);

-- Audit trail for loan payments
CREATE TABLE liability_loan_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES liability_loans(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES liability_loan_schedule(id),
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method payment_method NOT NULL,
  reference_number VARCHAR(100),
  notes VARCHAR(500),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_loan_payments_loan ON liability_loan_payments(loan_id);
CREATE INDEX idx_loan_payments_schedule ON liability_loan_payments(schedule_id);

-- ── Trigger: sync installment status + loan outstanding_balance ───────────────

CREATE OR REPLACE FUNCTION sync_loan_payment_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_schedule_id UUID;
  v_loan_id UUID;
  v_paid_amount DECIMAL(12,2);
  v_scheduled_amount DECIMAL(12,2);
  v_due_date DATE;
  v_new_status installment_status;
  v_remaining_count INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_schedule_id := OLD.schedule_id;
    v_loan_id := OLD.loan_id;
  ELSE
    v_schedule_id := NEW.schedule_id;
    v_loan_id := NEW.loan_id;
  END IF;

  -- Skip if no schedule row linked
  IF v_schedule_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get schedule info
  SELECT scheduled_amount, due_date
  INTO v_scheduled_amount, v_due_date
  FROM liability_loan_schedule
  WHERE id = v_schedule_id;

  -- Recalculate paid amount for this installment
  SELECT COALESCE(SUM(amount), 0)
  INTO v_paid_amount
  FROM liability_loan_payments
  WHERE schedule_id = v_schedule_id;

  -- Determine new installment status
  IF v_paid_amount >= v_scheduled_amount THEN
    v_new_status := 'paid';
  ELSIF v_paid_amount > 0 THEN
    v_new_status := 'partial';
  ELSIF v_due_date < CURRENT_DATE THEN
    v_new_status := 'overdue';
  ELSE
    v_new_status := 'upcoming';
  END IF;

  -- Update the installment row
  UPDATE liability_loan_schedule
  SET
    paid_amount = v_paid_amount,
    status = v_new_status,
    paid_date = CASE WHEN v_paid_amount >= v_scheduled_amount THEN CURRENT_DATE ELSE NULL END,
    updated_at = NOW()
  WHERE id = v_schedule_id;

  -- Recount unpaid installments to check if loan is completed
  SELECT COUNT(*)
  INTO v_remaining_count
  FROM liability_loan_schedule
  WHERE loan_id = v_loan_id AND status != 'paid';

  -- Update loan's outstanding_balance and status
  UPDATE liability_loans
  SET
    outstanding_balance = (
      SELECT COALESCE(SUM(balance_after), 0)
      FROM liability_loan_schedule
      WHERE loan_id = v_loan_id
        AND status != 'paid'
      ORDER BY installment_number
      LIMIT 1
    ),
    status = CASE
      WHEN v_remaining_count = 0 THEN 'completed'::loan_status
      ELSE 'active'::loan_status
    END,
    updated_at = NOW()
  WHERE id = v_loan_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_loan_payment_change
AFTER INSERT OR DELETE ON liability_loan_payments
FOR EACH ROW EXECUTE FUNCTION sync_loan_payment_totals();

-- ── Function: auto-generate loan number (LOAN-YYYYMMDD-XXXX) ─────────────────

CREATE OR REPLACE FUNCTION generate_loan_number()
RETURNS TEXT AS $$
DECLARE
  v_today TEXT := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');
  v_seq INT;
BEGIN
  SELECT COUNT(*) + 1 INTO v_seq
  FROM liability_loans
  WHERE loan_number LIKE 'LOAN-' || v_today || '-%';

  RETURN 'LOAN-' || v_today || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ── RLS Policies ─────────────────────────────────────────────────────────────

ALTER TABLE liability_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE liability_loan_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE liability_loan_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "liability_loans_all" ON liability_loans
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'manager', 'accountant')
    )
  );

CREATE POLICY "loan_schedule_all" ON liability_loan_schedule
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'manager', 'accountant')
    )
  );

CREATE POLICY "loan_payments_all" ON liability_loan_payments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'manager', 'accountant')
    )
  );
