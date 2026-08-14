-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00073: Close anon INSERT on online_orders / online_order_lines
--
-- Migration 00065 granted anon INSERT (WITH CHECK (true)) on these tables so
-- the shop could place orders directly. In practice syd-shop's checkout server
-- action always writes with the service role key (which bypasses RLS), and
-- now also re-validates price/availability against the products table before
-- writing. The anon INSERT policies were never used by the app but remained
-- open: anyone with the public anon key (embedded in the shop's JS bundle)
-- could call the Supabase REST API directly and insert arbitrary orders —
-- fabricated prices/totals, spam orders (each triggering a staff email +
-- POS bell alert), or forged customer links — completely bypassing the
-- checkout validation. Close the hole; staff (authenticated) access is
-- unaffected.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "anon_insert_online_orders" ON online_orders;
DROP POLICY IF EXISTS "anon_insert_online_order_lines" ON online_order_lines;

REVOKE INSERT ON online_orders      FROM anon;
REVOKE INSERT ON online_order_lines FROM anon;
