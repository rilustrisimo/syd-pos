-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00069: Add government canvass markup %
--
-- Government canvasses need to be priced above normal retail selling price.
-- Adds a per-canvass markup percentage plus a per-line "base" (pre-markup)
-- price so the markup can be edited later and catalog-linked line prices
-- recomputed from their original selling price.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE canvases
  ADD COLUMN IF NOT EXISTS markup_percentage DECIMAL(5,2) NOT NULL DEFAULT 0;

ALTER TABLE canvas_lines
  ADD COLUMN IF NOT EXISTS base_unit_price DECIMAL(12,2);

COMMENT ON COLUMN canvases.markup_percentage IS
  'Percentage added on top of catalog selling price for government canvasses (e.g. 20.00 = +20%). Applied to catalog-linked lines only; custom/ad hoc lines are priced manually.';

COMMENT ON COLUMN canvas_lines.base_unit_price IS
  'Normal (pre-markup) selling price for catalog-linked lines, used to recompute unit_price when the canvas markup_percentage changes. NULL for ad hoc/custom lines.';
