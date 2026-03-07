-- ============================================================================
-- Diagnose COGS outliers: Makita Carbon Brushes + Galvarock Rivets
-- Run Step A first to see PO history, then run Step B to apply corrections.
-- ============================================================================


-- ── STEP A: PO history + current product state for these products ─────────────
SELECT
    p.code                          AS product_code,
    p.name                          AS product_name,
    p.base_unit_cost                AS current_base_unit_cost,
    p.latest_cogs                   AS current_latest_cogs,
    p.conversion_factor             AS conv_factor,
    p.current_selling_price,
    p.markup_percentage             AS current_markup_pct,
    base_uom.code                   AS base_uom,
    sell_uom.code                   AS sell_uom,
    -- PO line details
    po.po_number,
    po.po_date,
    pol.quantity_ordered,
    pol.quantity_received,
    pol.unit_cost                   AS po_unit_cost,
    po_uom.code                     AS po_uom,
    -- What latest_cogs SHOULD be based on this PO line
    CASE
        WHEN p.base_uom_id != p.selling_uom_id AND p.conversion_factor > 0
        THEN ROUND((pol.unit_cost / p.conversion_factor)::NUMERIC, 4)
        ELSE pol.unit_cost
    END                             AS implied_latest_cogs
FROM products p
JOIN purchase_order_lines pol   ON pol.product_id = p.id
JOIN purchase_orders po         ON po.id = pol.po_id
LEFT JOIN units_of_measure base_uom ON base_uom.id = p.base_uom_id
LEFT JOIN units_of_measure sell_uom ON sell_uom.id = p.selling_uom_id
LEFT JOIN units_of_measure po_uom   ON po_uom.id   = pol.uom_id
WHERE p.code IN (
    'MAK-CB-50', 'MAK-CB-51', 'MAK-CB-52', 'MAK-CB-53',
    'RIVET-1/8X1/2', 'RIVET-1/8X3/4'
)
  AND po.is_deleted = false
ORDER BY p.code, po.po_date DESC;


-- ── STEP B: Fix latest_cogs + base_unit_cost (all confirmed outliers) ─────────
--
-- SKIP: BATT-AA-EVDY, BATT-AAA-EVDY
--   False alarm. conv_factor=48/40 but base=sell=PC because they buy
--   per pack. The PO unit_cost (₱840/₱790) is per PACK, not per battery.
--   current latest_cogs (₱17.50 / ₱19.75) is CORRECT.
--
-- SKIP: COCO-2X2X10, COCO-2X3X10
--   current_latest_cogs includes distributed delivery charges, making
--   it slightly higher than the raw PO unit price. More accurate, leave as-is.


-- ── 1. MAKITA Carbon Brushes ─────────────────────────────────────────────────
--   Root cause: PO entered at ₱55/BOX — should have been ₱550/BOX (10 sets/box).
--   base_unit_cost (₱550) is already correct. Fix: latest_cogs = 550 / 10 = ₱55/SET.

UPDATE products
SET
    latest_cogs = base_unit_cost / conversion_factor,
    updated_at  = NOW()
WHERE code IN ('MAK-CB-50', 'MAK-CB-51', 'MAK-CB-52', 'MAK-CB-53')
  AND conversion_factor > 0;


-- ── 2. Trowels — SWAPPED costs (same PO-20260225-0005) ───────────────────────
--   TOR-TRW-PL:   DB has ₱52, PO shows ₱32  ← costs were swapped between the two
--   JOS-TRW-7-WD: DB has ₱32, PO shows ₱52  ← same PO, same swap

UPDATE products
SET
    latest_cogs    = new_vals.cogs,
    base_unit_cost = new_vals.cogs,
    updated_at     = NOW()
FROM (VALUES
    ('TOR-TRW-PL',    32.00),   -- plastic handle: ₱32/PC
    ('JOS-TRW-7-WD',  52.00)    -- wood handle:    ₱52/PC
) AS new_vals(code, cogs)
WHERE products.code = new_vals.code;


-- ── 3. ARMAK Electrical Tape 16M ─────────────────────────────────────────────
--   Root cause: PO-20260225-0005 (Feb 16) not captured in latest_cogs.
--   PO shows ₱63/ROLL, current stuck at ₱27.50.

UPDATE products
SET
    latest_cogs    = 63.00,
    base_unit_cost = 63.00,
    updated_at     = NOW()
WHERE code = 'ARM-TAPE-16M';


-- ── 4. GALVAROCK Rivets ───────────────────────────────────────────────────────
--   Root cause: Feb 26 PO prices (₱132, ₱198) not captured; stuck at Jan values.
--   ⚠️  After fix, selling prices will be BELOW cost — raise in product edit screen:
--       RIVET-1/8X1/2: cost ₱132 vs price ₱110  → raise to ≥ ₱160
--       RIVET-1/8X3/4: cost ₱198 vs price ₱155  → raise to ≥ ₱230

UPDATE products
SET
    latest_cogs    = new_vals.cogs,
    base_unit_cost = new_vals.cogs,
    updated_at     = NOW()
FROM (VALUES
    ('RIVET-1/8X1/2', 132.00),
    ('RIVET-1/8X3/4', 198.00)
) AS new_vals(code, cogs)
WHERE products.code = new_vals.code;


-- ── 5. Hollow Blocks 4" ───────────────────────────────────────────────────────
--   Most recent PO (Feb 28) shows price dropped to ₱7.50/PC.
--   Current latest_cogs still at ₱9.50 (previous price).

UPDATE products
SET
    latest_cogs    = 7.50,
    base_unit_cost = 7.50,
    updated_at     = NOW()
WHERE code = 'HB-4';


-- ── 6. Tie Wire #16 ──────────────────────────────────────────────────────────
--   Most recent PO (Jan 17) shows ₱42/KG after admin_02f UOM fix.
--   Current latest_cogs = ₱52.50 (from before the fix).
--   Verify: if ₱42/KG is the actual current purchase price, update below.

UPDATE products
SET
    latest_cogs    = 42.00,
    base_unit_cost = 42.00,
    updated_at     = NOW()
WHERE code = 'TIE-WIRE';


-- ── 7. BOSTIK Vulca Seal 75ml ─────────────────────────────────────────────────
--   Feb 26 PO shows ₱62.57, current stuck at ₱57.00.

UPDATE products
SET
    latest_cogs    = 62.5666,
    base_unit_cost = 62.5666,
    updated_at     = NOW()
WHERE code = 'VULCA-SEAL-75ML';
