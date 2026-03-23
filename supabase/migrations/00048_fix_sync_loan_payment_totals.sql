-- Fix: "column liability_loan_schedule.installment_number must appear in GROUP BY"
--
-- Root cause:
--   The outstanding_balance subquery used ORDER BY + LIMIT 1 inside a scalar subquery
--   without the ORDER BY column being aggregated — PostgreSQL rejects this.
--
-- Fix:
--   Use a correlated subquery with MIN() to find the first unpaid installment,
--   then return its balance_before as the current outstanding balance.
--   If all installments are paid, outstanding_balance = 0.

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
  -- outstanding_balance = balance_before of the earliest unpaid installment
  -- (represents the remaining principal owed from that point forward)
  UPDATE liability_loans
  SET
    outstanding_balance = COALESCE(
      (
        SELECT s.balance_before
        FROM liability_loan_schedule s
        WHERE s.loan_id = v_loan_id
          AND s.status != 'paid'
        ORDER BY s.installment_number ASC
        LIMIT 1
      ),
      0
    ),
    status = CASE
      WHEN v_remaining_count = 0 THEN 'completed'::loan_status
      ELSE 'active'::loan_status
    END,
    updated_at = NOW()
  WHERE id = v_loan_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
