-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00085: Enable realtime replication for online_orders
--
-- The nav badge, pending-orders banner, toast, and chime all depend on
-- src/components/notifications/order-notification-listener.tsx's
-- `.channel('online-orders-realtime').on('postgres_changes', ...)`
-- subscription — but a postgres_changes subscription only receives
-- events for tables that are actually part of the supabase_realtime
-- publication. That was never set up for this table, so the
-- subscription connected successfully but silently received nothing:
-- exactly the "works after refresh, nothing live" symptom reported.
--
-- Safe to run even if it's somehow already added (idempotent via the
-- exception-swallowing DO block, since ADD TABLE has no IF NOT EXISTS).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE online_orders;
EXCEPTION
  WHEN duplicate_object THEN
    NULL; -- already a member of the publication
END $$;
