-- ============================================================================
-- DIAGNOSTIC: Sales Report Date Filtering Issue (March 8, 2026)
-- Safe read-only queries to run in Supabase SQL Editor
-- ============================================================================

-- Query 1: Check what's in the database for today (transaction_date column)
SELECT 
    'TODAY TRANSACTIONS RAW' as check_type,
    transaction_number,
    transaction_date,
    transaction_date::date as date_only,
    EXTRACT(TIMEZONE FROM transaction_date) / 3600 as timezone_offset_hours,
    total_amount,
    is_deleted
FROM transactions
WHERE transaction_date >= '2026-03-08T00:00:00'::timestamptz
  AND transaction_date < '2026-03-09T00:00:00'::timestamptz
  AND transaction_type = 'sale'
ORDER BY transaction_date DESC
LIMIT 20;

-- Query 2: Check transactions using Philippine timezone date filter
SELECT 
    'TODAY PH TIMEZONE' as check_type,
    COUNT(*) as total_transactions,
    SUM(total_amount) as total_revenue,
    SUM(CASE WHEN is_deleted = false THEN total_amount ELSE 0 END) as active_revenue,
    MIN(transaction_date) as earliest_sale,
    MAX(transaction_date) as latest_sale
FROM transactions
WHERE transaction_date AT TIME ZONE 'Asia/Manila' >= '2026-03-08'::date
  AND transaction_date AT TIME ZONE 'Asia/Manila' < '2026-03-09'::date
  AND transaction_type = 'sale';

-- Query 3: Check the actual timestamps and how they convert
SELECT 
    'TIMESTAMP ANALYSIS' as check_type,
    transaction_number,
    transaction_date as utc_timestamp,
    transaction_date AT TIME ZONE 'UTC' as utc_explicit,
    transaction_date AT TIME ZONE 'Asia/Manila' as manila_time,
    (transaction_date AT TIME ZONE 'Asia/Manila')::date as manila_date,
    total_amount,
    is_deleted
FROM transactions
WHERE transaction_number LIKE 'TXN-20260308%'
  AND transaction_type = 'sale'
ORDER BY transaction_date DESC
LIMIT 10;

-- Query 4: Compare different date filtering methods
WITH date_filters AS (
    SELECT 
        COUNT(*) FILTER (WHERE transaction_date::date = '2026-03-08') as method1_count,
        COUNT(*) FILTER (WHERE (transaction_date AT TIME ZONE 'Asia/Manila')::date = '2026-03-08') as method2_count,
        COUNT(*) FILTER (WHERE transaction_date >= '2026-03-08T00:00:00+08:00' 
                          AND transaction_date < '2026-03-09T00:00:00+08:00') as method3_count,
        COUNT(*) FILTER (WHERE DATE(transaction_date AT TIME ZONE 'Asia/Manila') = '2026-03-08') as method4_count
    FROM transactions
    WHERE transaction_type = 'sale'
      AND is_deleted = false
)
SELECT 
    'FILTER COMPARISON' as check_type,
    method1_count as "::date cast",
    method2_count as "AT TIME ZONE Manila",
    method3_count as "timestamp range +08",
    method4_count as "DATE() function"
FROM date_filters;

-- Query 5: Check transactions created today vs backdated
SELECT 
    'CREATED VS TRANSACTION DATE' as check_type,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE created_at::date = '2026-03-08') as created_today,
    COUNT(*) FILTER (WHERE (transaction_date AT TIME ZONE 'Asia/Manila')::date = '2026-03-08') as transacted_today,
    SUM(total_amount) FILTER (WHERE (transaction_date AT TIME ZONE 'Asia/Manila')::date = '2026-03-08') as revenue_today
FROM transactions
WHERE transaction_type = 'sale'
  AND is_deleted = false;

-- Query 6: Show timezone configuration
SELECT 
    'TIMEZONE CONFIG' as check_type,
    current_setting('TIMEZONE') as db_timezone,
    NOW() as server_now,
    NOW() AT TIME ZONE 'Asia/Manila' as manila_now,
    CURRENT_DATE as server_date,
    (NOW() AT TIME ZONE 'Asia/Manila')::date as manila_date;
