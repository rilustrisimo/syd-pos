-- "Request a Quote" mode for syd-shop: a toggleable setting (not a
-- hardcoded removal) so pricing display can be switched back on without
-- a new coding task if the experiment doesn't work out. Defaults to the
-- current (prices shown) behavior.

ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS hide_prices boolean NOT NULL DEFAULT false;
