-- Checkout no longer collects a payment method up front — customers
-- pick items and submit, then staff finalize delivery fee/discount and
-- send a payment link (syd-pos Online Orders' "Copy Payment Link")
-- where the customer actually chooses how they'll pay. So
-- payment_method is genuinely unknown at order-creation time now.
--
-- The existing CHECK (payment_method IN (...)) does not need rewriting:
-- a NULL value already satisfies a Postgres CHECK constraint once
-- NOT NULL is lifted.

ALTER TABLE online_orders ALTER COLUMN payment_method DROP NOT NULL;
