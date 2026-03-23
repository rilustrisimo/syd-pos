-- Daily job to refresh overdue statuses and create in-app notifications
-- for loan installments and payables that are past due.
--
-- Runs daily at 00:00 UTC (08:00 Philippine Standard Time).

-- ── 1. Refresh loan installment overdue status ─────────────────────────────

CREATE OR REPLACE FUNCTION refresh_overdue_loan_installments()
RETURNS void AS $$
DECLARE
  v_row RECORD;
BEGIN
  -- Mark past-due unpaid/partial installments as overdue
  UPDATE liability_loan_schedule
  SET status = 'overdue', updated_at = NOW()
  WHERE status IN ('upcoming', 'partial')
    AND due_date < CURRENT_DATE
    AND paid_amount < scheduled_amount;

  -- Mark upcoming installments as upcoming (undo overdue if somehow re-dated)
  -- (this handles edge cases where due_date was updated)
  UPDATE liability_loan_schedule
  SET status = 'upcoming', updated_at = NOW()
  WHERE status = 'overdue'
    AND due_date >= CURRENT_DATE;

  -- Create in-app notifications for overdue installments (once per day, avoid duplicates)
  FOR v_row IN
    SELECT
      s.id AS schedule_id,
      s.loan_id,
      s.installment_number,
      s.scheduled_amount,
      s.paid_amount,
      s.due_date,
      l.loan_number,
      l.lender_name,
      l.branch_id,
      CURRENT_DATE - s.due_date AS days_overdue
    FROM liability_loan_schedule s
    JOIN liability_loans l ON l.id = s.loan_id
    WHERE s.status = 'overdue'
      AND l.is_deleted = false
      -- Not already notified today
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.entity_type = 'liability_loan_schedule'
          AND n.entity_id = s.id
          AND n.type = 'loan_installment_overdue'
          AND n.created_at::date = CURRENT_DATE
      )
  LOOP
    INSERT INTO notifications (
      type, title, message,
      entity_type, entity_id,
      target_roles, branch_id, metadata
    ) VALUES (
      'loan_installment_overdue',
      'Overdue Loan Installment — ' || v_row.loan_number,
      'Installment #' || v_row.installment_number ||
        ' of ' || v_row.lender_name ||
        ' (₱' || TO_CHAR(v_row.scheduled_amount - v_row.paid_amount, 'FM999,999,990.00') ||
        ' remaining) was due ' || v_row.days_overdue || ' day(s) ago.',
      'liability_loan_schedule', v_row.schedule_id,
      ARRAY['admin','manager','accountant'],
      v_row.branch_id,
      jsonb_build_object(
        'loan_id', v_row.loan_id,
        'loan_number', v_row.loan_number,
        'installment_number', v_row.installment_number,
        'amount_due', v_row.scheduled_amount - v_row.paid_amount,
        'days_overdue', v_row.days_overdue,
        'due_date', v_row.due_date
      )
    );
  END LOOP;

  -- Create in-app notifications for installments due TODAY
  FOR v_row IN
    SELECT
      s.id AS schedule_id,
      s.loan_id,
      s.installment_number,
      s.scheduled_amount,
      s.paid_amount,
      s.due_date,
      l.loan_number,
      l.lender_name,
      l.branch_id
    FROM liability_loan_schedule s
    JOIN liability_loans l ON l.id = s.loan_id
    WHERE s.status IN ('upcoming', 'partial')
      AND s.due_date = CURRENT_DATE
      AND l.is_deleted = false
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.entity_type = 'liability_loan_schedule'
          AND n.entity_id = s.id
          AND n.type = 'loan_installment_due_today'
          AND n.created_at::date = CURRENT_DATE
      )
  LOOP
    INSERT INTO notifications (
      type, title, message,
      entity_type, entity_id,
      target_roles, branch_id, metadata
    ) VALUES (
      'loan_installment_due_today',
      'Loan Payment Due Today — ' || v_row.loan_number,
      'Installment #' || v_row.installment_number ||
        ' of ' || v_row.lender_name ||
        ' amounting to ₱' || TO_CHAR(v_row.scheduled_amount - v_row.paid_amount, 'FM999,999,990.00') ||
        ' is due today.',
      'liability_loan_schedule', v_row.schedule_id,
      ARRAY['admin','manager','accountant'],
      v_row.branch_id,
      jsonb_build_object(
        'loan_id', v_row.loan_id,
        'loan_number', v_row.loan_number,
        'installment_number', v_row.installment_number,
        'amount_due', v_row.scheduled_amount - v_row.paid_amount,
        'days_overdue', 0,
        'due_date', v_row.due_date
      )
    );
  END LOOP;

  -- Upcoming in 3 days
  FOR v_row IN
    SELECT
      s.id AS schedule_id,
      s.loan_id,
      s.installment_number,
      s.scheduled_amount,
      s.paid_amount,
      s.due_date,
      l.loan_number,
      l.lender_name,
      l.branch_id,
      s.due_date - CURRENT_DATE AS days_until_due
    FROM liability_loan_schedule s
    JOIN liability_loans l ON l.id = s.loan_id
    WHERE s.status IN ('upcoming', 'partial')
      AND s.due_date IN (CURRENT_DATE + 3, CURRENT_DATE + 7)
      AND l.is_deleted = false
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.entity_type = 'liability_loan_schedule'
          AND n.entity_id = s.id
          AND n.type = 'loan_installment_upcoming'
          AND (n.metadata->>'days_until_due')::int = (s.due_date - CURRENT_DATE)
          AND n.created_at::date = CURRENT_DATE
      )
  LOOP
    INSERT INTO notifications (
      type, title, message,
      entity_type, entity_id,
      target_roles, branch_id, metadata
    ) VALUES (
      'loan_installment_upcoming',
      'Loan Payment Due in ' || v_row.days_until_due || ' Days — ' || v_row.loan_number,
      'Installment #' || v_row.installment_number ||
        ' of ' || v_row.lender_name ||
        ' (₱' || TO_CHAR(v_row.scheduled_amount - v_row.paid_amount, 'FM999,999,990.00') ||
        ') is due in ' || v_row.days_until_due || ' day(s) on ' || TO_CHAR(v_row.due_date, 'Mon DD, YYYY') || '.',
      'liability_loan_schedule', v_row.schedule_id,
      ARRAY['admin','manager','accountant'],
      v_row.branch_id,
      jsonb_build_object(
        'loan_id', v_row.loan_id,
        'loan_number', v_row.loan_number,
        'installment_number', v_row.installment_number,
        'amount_due', v_row.scheduled_amount - v_row.paid_amount,
        'days_until_due', v_row.days_until_due,
        'due_date', v_row.due_date
      )
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ── 2. Refresh payable overdue status ──────────────────────────────────────

CREATE OR REPLACE FUNCTION refresh_overdue_payables()
RETURNS void AS $$
DECLARE
  v_row RECORD;
BEGIN
  -- Mark past-due unpaid/partial payables as overdue
  UPDATE liability_payables
  SET status = 'overdue', updated_at = NOW()
  WHERE status IN ('unpaid', 'partial')
    AND due_date < CURRENT_DATE
    AND (total_amount - paid_amount) > 0;

  -- Create in-app notifications for overdue payables
  FOR v_row IN
    SELECT
      p.id AS payable_id,
      p.payable_number,
      p.total_amount,
      (p.total_amount - p.paid_amount) AS balance,
      p.due_date,
      p.branch_id,
      s.name AS supplier_name,
      CURRENT_DATE - p.due_date AS days_overdue
    FROM liability_payables p
    JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.status = 'overdue'
      AND p.is_deleted = false
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.entity_type = 'liability_payable'
          AND n.entity_id = p.id
          AND n.type = 'payable_overdue'
          AND n.created_at::date = CURRENT_DATE
      )
  LOOP
    INSERT INTO notifications (
      type, title, message,
      entity_type, entity_id,
      target_roles, branch_id, metadata
    ) VALUES (
      'payable_overdue',
      'Overdue Payable — ' || v_row.payable_number,
      'Payment of ₱' || TO_CHAR(v_row.balance, 'FM999,999,990.00') ||
        ' to ' || v_row.supplier_name ||
        ' was due ' || v_row.days_overdue || ' day(s) ago.',
      'liability_payable', v_row.payable_id,
      ARRAY['admin','manager','accountant'],
      v_row.branch_id,
      jsonb_build_object(
        'payable_number', v_row.payable_number,
        'supplier_name', v_row.supplier_name,
        'amount_due', v_row.balance,
        'days_overdue', v_row.days_overdue,
        'due_date', v_row.due_date
      )
    );
  END LOOP;

  -- Due today
  FOR v_row IN
    SELECT
      p.id AS payable_id,
      p.payable_number,
      (p.total_amount - p.paid_amount) AS balance,
      p.due_date,
      p.branch_id,
      s.name AS supplier_name
    FROM liability_payables p
    JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.status IN ('unpaid', 'partial')
      AND p.due_date = CURRENT_DATE
      AND p.is_deleted = false
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.entity_type = 'liability_payable'
          AND n.entity_id = p.id
          AND n.type = 'payable_due_today'
          AND n.created_at::date = CURRENT_DATE
      )
  LOOP
    INSERT INTO notifications (
      type, title, message,
      entity_type, entity_id,
      target_roles, branch_id, metadata
    ) VALUES (
      'payable_due_today',
      'Payable Due Today — ' || v_row.payable_number,
      'Payment of ₱' || TO_CHAR(v_row.balance, 'FM999,999,990.00') ||
        ' to ' || v_row.supplier_name || ' is due today.',
      'liability_payable', v_row.payable_id,
      ARRAY['admin','manager','accountant'],
      v_row.branch_id,
      jsonb_build_object(
        'payable_number', v_row.payable_number,
        'supplier_name', v_row.supplier_name,
        'amount_due', v_row.balance,
        'days_until_due', 0,
        'due_date', v_row.due_date
      )
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ── 3. Master daily refresh function ───────────────────────────────────────

CREATE OR REPLACE FUNCTION refresh_daily_liability_statuses()
RETURNS void AS $$
BEGIN
  PERFORM refresh_overdue_loan_installments();
  PERFORM refresh_overdue_payables();
END;
$$ LANGUAGE plpgsql;

-- ── 4. Schedule daily run at 00:00 UTC (08:00 PH time) ────────────────────

SELECT cron.schedule(
  'daily-liability-status-refresh',
  '0 0 * * *',
  'SELECT refresh_daily_liability_statuses()'
);

-- ── 5. Run immediately to catch any already-overdue items ──────────────────

SELECT refresh_daily_liability_statuses();
