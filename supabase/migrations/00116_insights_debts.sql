-- 00116: Loans in Business Insights (admin only)
-- Active loans from the Liabilities module with payoff dates, the remaining
-- monthly repayments (principal + interest) for cash-flow planning, and the
-- interest actually paid per month (same pro-rata rule as the P&L report),
-- so Insights' net profit and cash flow include debt.

CREATE OR REPLACE FUNCTION public.insights_debts(p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  PERFORM insights_assert_admin();
  SELECT jsonb_build_object(
    'loans', (SELECT COALESCE(jsonb_agg(x ORDER BY x.final_due), '[]') FROM (
        SELECT l.id, l.loan_number::text AS loan_number, l.lender_name::text AS lender, l.principal_amount AS principal,
          l.interest_rate_monthly AS rate_monthly, l.rate_type::text AS rate_type, l.term_months, l.start_date,
          l.monthly_payment, l.outstanding_balance, l.status::text AS status,
          MIN(s.due_date) FILTER (WHERE s.status <> 'paid') AS next_due,
          MAX(s.due_date) AS final_due,
          COUNT(*) FILTER (WHERE s.status <> 'paid') AS remaining_installments,
          COALESCE(SUM(s.scheduled_amount - s.paid_amount) FILTER (WHERE s.status <> 'paid'), 0) AS remaining_due,
          COALESCE(SUM(s.interest_portion * (1 - LEAST(s.paid_amount / NULLIF(s.scheduled_amount, 0), 1)))
                   FILTER (WHERE s.status <> 'paid'), 0) AS remaining_interest,
          COUNT(*) FILTER (WHERE s.status <> 'paid' AND s.due_date < p_to) AS overdue_installments
        FROM liability_loans l
        LEFT JOIN liability_loan_schedule s ON s.loan_id = l.id
        WHERE l.is_deleted = false AND l.status = 'active'
        GROUP BY l.id) x),

    -- Remaining repayments by month (unpaid part of each installment; overdue ones counted in the current month).
    'schedule', (SELECT COALESCE(jsonb_agg(x ORDER BY x.month), '[]') FROM (
        SELECT date_trunc('month', GREATEST(s.due_date, p_to))::date AS month,
          SUM((s.scheduled_amount - s.paid_amount) * s.principal_portion / NULLIF(s.scheduled_amount, 0)) AS principal,
          SUM((s.scheduled_amount - s.paid_amount) * s.interest_portion / NULLIF(s.scheduled_amount, 0)) AS interest,
          SUM(s.scheduled_amount - s.paid_amount) AS total
        FROM liability_loan_schedule s JOIN liability_loans l ON l.id = s.loan_id
        WHERE l.is_deleted = false AND l.status = 'active' AND s.status <> 'paid'
        GROUP BY 1) x),

    -- Paid so far, split into interest (an expense) and principal (not an expense), by day.
    'paid', (SELECT COALESCE(jsonb_agg(x ORDER BY x.ph_date), '[]') FROM (
        SELECT p.payment_date AS ph_date,
          SUM(p.amount * COALESCE(s.interest_portion / NULLIF(s.scheduled_amount, 0), 0)) AS interest,
          SUM(p.amount * (1 - COALESCE(s.interest_portion / NULLIF(s.scheduled_amount, 0), 0))) AS principal,
          SUM(p.amount) AS total
        FROM liability_loan_payments p
        JOIN liability_loans l ON l.id = p.loan_id AND l.is_deleted = false
        LEFT JOIN liability_loan_schedule s ON s.id = p.schedule_id
        WHERE p.payment_date <= p_to
        GROUP BY 1) x)
  ) INTO r;
  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.insights_debts(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.insights_debts(date) TO authenticated;
