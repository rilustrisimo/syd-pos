-- ============================================================================
-- ADMIN STEP 2b: Apply All PO Line UOM + Quantity Corrections
-- ============================================================================
-- Generated from the output of admin_02_view_pos_to_fix.sql
--
-- BEFORE RUNNING:
--   ✅ admin_01_backup.sql has been run (backups exist)
--   ✅ Migration 00033 applied (adds BOTTLE, POUCH UOM codes)
--
-- Summary of changes:
--   • Most lines: UOM label corrected only, quantities unchanged (factor = 1)
--   • EVEREADY Battery AAA : 12 BOX → 480 PC  (1 BOX = 40 PC)
--   • EVEREADY Battery AA  : 9 BOX  → 432 PC  (1 BOX = 48 PC)
--   • CORTECH Flexible Hose: 200 M  → 2 ROLL  (1 ROLL = 100 M)
-- ============================================================================

-- Safety: verify backup exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '_bak_purchase_order_lines') THEN
        RAISE EXCEPTION 'Backup not found — run admin_01_backup.sql first!';
    END IF;
    RAISE NOTICE 'Backup confirmed. Applying PO fixes...';
END $$;

-- ── IMPORTANT: Disable inventory trigger before editing PO lines ─────────────
-- The trigger on_po_line_inventory_update fires on every quantity_received
-- change and writes inventory_movements using auth.uid() — which is NULL
-- in the SQL editor. We disable it here because we will rebuild all inventory
-- from scratch in admin_04_rebuild_inventory.sql anyway.
ALTER TABLE purchase_order_lines DISABLE TRIGGER on_po_line_inventory_update;


-- ── GROUP 1: Change UOM to M (Meter) ────────────────────────────────────────
-- POWERFLEX THHN Wire #10 and #12 — recorded as ROLL, base unit is M
UPDATE purchase_order_lines
SET uom_id     = (SELECT id FROM units_of_measure WHERE code = 'M'),
    updated_at = NOW()
WHERE id IN (
    '00ab6e15-9070-482d-9ba2-3eca50095607',  -- POWERFLEX THHN Wire #10  (PO-20260303-0012) 150M
    '2327678a-69b0-4aee-9555-669281fc4e75'   -- POWERFLEX THHN Wire #12  (PO-20260224-0029) 150M
);


-- ── GROUP 2: Change UOM to CAN ───────────────────────────────────────────────
-- Paint products recorded as L (Liter), base unit is CAN
UPDATE purchase_order_lines
SET uom_id     = (SELECT id FROM units_of_measure WHERE code = 'CAN'),
    updated_at = NOW()
WHERE id IN (
    '64079bb3-51dd-45ad-9c91-ae66c97db177',  -- BOYSEN Enamel Black 1/4L          (PO-20260303-0002) 5
    '6dd5d135-8cfb-40f9-93d3-33f373e73669',  -- NATION Enamel Black 1L            (PO-20260303-0002) 5
    'd9977cdb-1a6d-4bd0-98e8-498e82102daf',  -- BOYSEN Enamel White #600 1L       (PO-20260303-0002) 5
    'e822cfa3-ae17-4c7e-83ef-e0cff207036c',  -- BOYSEN Perm Flat Latex White 1L   (PO-20260225-0010) 10
    'b9b49f61-895b-4300-907a-b10cd2e4e54e',  -- BOYSEN Semi-Gloss Latex White 1L  (PO-20260225-0010) 10
    '12fcf839-662a-484f-8bb4-3169c82cdf94',  -- ISLAND Red Oxide #700 1L          (PO-20260225-0011) 5
    'd634aa62-c1be-444c-909f-a2b016173305',  -- ISLAND Red Oxide #700 1/4L        (PO-20260225-0011) 5
    '2909d4d3-5ce5-477c-826e-0f4d2ccf7881',  -- ISLAND Red Primer #730 1L         (PO-20260225-0011) 5
    'f490dc2d-f1c0-438a-bff1-af8e31d7b0cb'   -- ISLAND Red Primer #730 1/4L       (PO-20260225-0011) 5
);


-- ── GROUP 3: Change UOM to ROLL ──────────────────────────────────────────────
-- Electrical tape recorded as PC, base unit is ROLL
UPDATE purchase_order_lines
SET uom_id     = (SELECT id FROM units_of_measure WHERE code = 'ROLL'),
    updated_at = NOW()
WHERE id IN (
    '4ac33bbf-9e3e-4f08-baa8-558b535db830'   -- ROYU Electrical Tape 16M (Big)    (PO-20260303-0002) 10
);


-- ── GROUP 4: Change UOM to POUCH ─────────────────────────────────────────────
-- Sealants/adhesives recorded as PC, base unit is POUCH
UPDATE purchase_order_lines
SET uom_id     = (SELECT id FROM units_of_measure WHERE code = 'POUCH'),
    updated_at = NOW()
WHERE id IN (
    '0d8f14c3-1f3c-4524-99a4-2ebfc678d1d6',  -- BOSTIK Vulca Seal 75ml  (PO-20260226-0001) 24
    '5d0c2025-648a-49c2-989a-c92d81e7a8f9',  -- BOSTIK Vulca Seal 75ml  (PO-20260224-0031) 15
    '1bc20f4d-9759-474b-b498-1ab18e6d2f7c',  -- BOSTIK Vulca Seal 75ml  (PO-20260223-0014) 5
    '755d03b6-f825-4ae7-96b6-adba1cf736bb',  -- BOSTIK No More Nails 30g (PO-20260223-0018) 10
    'd47556ed-3dd9-4a17-8b01-db3ff3f205e2'   -- BOSTIK No More Nails 30g (PO-20260223-0014) 10
);


-- ── GROUP 5: Change UOM to BOTTLE ────────────────────────────────────────────
-- Liquids in bottles recorded as PC, base unit is BOTTLE
UPDATE purchase_order_lines
SET uom_id     = (SELECT id FROM units_of_measure WHERE code = 'BOTTLE'),
    updated_at = NOW()
WHERE id IN (
    'b603ebeb-8a33-4283-8432-bb2fe8ff2775',  -- G.I. Paint Thinner Bottle 350cc   (PO-20260225-0006) 24
    'c2462838-c0b9-4ca2-b12d-fdf6e48b78a4',  -- MAYON Lacquer Thinner Bottle 350cc (PO-20260225-0006) 24
    'ef2fec62-fa95-401b-b3c8-bbed6056e0a8',  -- BOSTIK Rugby 45ml                 (PO-20260224-0021) 5
    'afed7234-58b5-4ca9-be2a-814c3818a47c'   -- G.I. Plastic Varnish (Yellow)     (PO-20260224-0021) 4
);


-- ── GROUP 6: Change UOM to LENGTH ────────────────────────────────────────────
-- Structural / pipe products recorded as PC, base unit is LENGTH
UPDATE purchase_order_lines
SET uom_id     = (SELECT id FROM units_of_measure WHERE code = 'LENGTH'),
    updated_at = NOW()
WHERE id IN (
    '8d9a6dc6-e0f8-4575-91a1-bb2c8c9f45b4',  -- C-Purlins 2x4 x 1.5mm            (PO-20260225-0013) 10
    '71879be6-27e2-4377-b73c-c80cbef23ac9',  -- C-Purlins 2x3 x 1.5mm            (PO-20260221-0001) 20
    '19902c35-6051-4b83-981f-ec6cc11bda0c',  -- PVC Sanitary Pipe 3" S500         (PO-20260221-0002) 20
    '590392fc-855f-4919-a34c-45b7a0a97d3f',  -- PVC Sanitary Pipe 2" S500         (PO-20260221-0002) 20
    'fb24e7f2-5964-4b5a-a7a7-1ca2233ac7ca',  -- PVC Pipe 1/2"                     (PO-20260221-0002) 30
    '498ac75b-89fc-42c8-9d3d-091bbe46a58e',  -- Metal Furring 1"x2"               (PO-20260221-0006) 50
    'e3c4882c-441d-413c-97eb-474069dab963',  -- Metal Track 2"x3"                 (PO-20260221-0006) 50
    '4c9362a5-abb6-40b0-ae06-ee506741edcf',  -- Metal Stud 2"x3"                  (PO-20260221-0006) 50
    'b5c628ac-3c14-4c00-a71c-bacefdab5381'   -- PVC Sanitary Pipe 4" S500         (PO-20260221-0002) 10
);


-- ── GROUP 7: Change UOM to SHEET ─────────────────────────────────────────────
-- Board products recorded as PC, base unit is SHEET
UPDATE purchase_order_lines
SET uom_id     = (SELECT id FROM units_of_measure WHERE code = 'SHEET'),
    updated_at = NOW()
WHERE id IN (
    '5eea7e5b-8e3b-4a58-b6b3-3177c8108049',  -- HardiFlex 3.5mm (3/16")           (PO-20260221-0006) 20
    'aa8136e7-455c-49f7-ad60-53180094f2f8'   -- HardiFlex 4.5mm (1/4")            (PO-20260221-0006) 20
);


-- ── GROUP 8: Change UOM to SET ───────────────────────────────────────────────
-- Hardware recorded as PC, base unit is SET
UPDATE purchase_order_lines
SET uom_id     = (SELECT id FROM units_of_measure WHERE code = 'SET'),
    updated_at = NOW()
WHERE id IN (
    '5269d201-70d7-4f72-88fc-b228a930769e',  -- ADVANCE Barrel Bolt 4"            (PO-20260224-0003) 12
    'eee903a8-0503-48cb-970b-fad0ad423d8a'   -- ADVANCE Barrel Bolt 2.5"          (PO-20260224-0003) 12
);


-- ── GROUP 9: Change UOM to PC (UOM rename only, qty unchanged) ───────────────
-- Items recorded as BOX or PACK, but base unit is PC, quantities stay the same
UPDATE purchase_order_lines
SET uom_id     = (SELECT id FROM units_of_measure WHERE code = 'PC'),
    updated_at = NOW()
WHERE id IN (
    'df3cb408-72a6-49ef-b0aa-72b67e39334e',  -- OPPO PVC Cable Clip 3/4 (PACK)   (PO-20260225-0006) 100
    'ee0ae10f-3fe0-400f-a1eb-85bd6b2acc00',  -- Black Screw Wood 1.5" (BOX)      (PO-20260225-0002) 500
    'f47e85d2-f979-4981-b3a5-72364917c265',  -- Black Screw Wood 1" (BOX)        (PO-20260225-0002) 500
    'f4e15401-1a9b-4b3a-88a6-c8630c83ed32',  -- Black Screw Wood 2" (BOX)        (PO-20260225-0002) 500
    '1ea49fe6-d0c9-4327-b5bf-029b25d3cd18',  -- Black Screw Metal 1" (BOX)       (PO-20260225-0002) 500
    'afda1285-1cfc-4303-ad62-6f2dc304ab8a',  -- Black Screw Metal 1.5" (BOX)     (PO-20260225-0002) 1000
    '3a43e7b1-5084-4c1d-aae2-c47d9c30ca52',  -- ERGNIA Iron Padlock 40mm (PACK)  (PO-20260225-0002) 24
    'd5fb71bd-c078-46d0-b179-e3b416b1e9f1',  -- Putty Knife #4 (PACK)            (PO-20260225-0001) 12
    'ca60cbe1-aebf-43b3-802c-9f3b8f850c74'   -- Putty Knife #6 (PACK)            (PO-20260225-0001) 12
);


-- ── GROUP 10: EVEREADY Battery AAA — BOX → PC, qty 12 → 480 ─────────────────
-- 1 BOX = 40 PCs, so 12 BOX = 480 PC
UPDATE purchase_order_lines
SET uom_id            = (SELECT id FROM units_of_measure WHERE code = 'PC'),
    quantity_ordered  = 480,
    quantity_received = 480,
    updated_at        = NOW()
WHERE id = '3ae8068a-f511-4f5d-8dba-8021f3fface5';  -- EVEREADY Battery AAA (PO-20260228-0002)


-- ── GROUP 11: EVEREADY Battery AA — BOX → PC, qty 9 → 432 ───────────────────
-- 1 BOX = 48 PCs, so 9 BOX = 432 PC
UPDATE purchase_order_lines
SET uom_id            = (SELECT id FROM units_of_measure WHERE code = 'PC'),
    quantity_ordered  = 432,
    quantity_received = 432,
    updated_at        = NOW()
WHERE id = '8306cfd4-3ab1-4887-baa9-4659f63ddabf';  -- EVEREADY Battery AA (PO-20260228-0002)


-- ── GROUP 12: CORTECH Flexible Hose 1/2 — M → ROLL, qty 200 → 2 ─────────────
-- 1 ROLL = 100 M, so 200 M = 2 ROLL
UPDATE purchase_order_lines
SET uom_id            = (SELECT id FROM units_of_measure WHERE code = 'ROLL'),
    quantity_ordered  = 2,
    quantity_received = 2,
    updated_at        = NOW()
WHERE id = 'f9808ce0-7a34-4f46-a203-7ee5150d2cf5';  -- CORTECH Flexible Hose 1/2 (PO-20260223-0010)


-- ── Re-enable the inventory trigger now that all edits are done ──────────────
ALTER TABLE purchase_order_lines ENABLE TRIGGER on_po_line_inventory_update;


-- ============================================================================
-- Verify: re-run the mismatch check — should return 0 rows when all fixed
-- ============================================================================
SELECT
    pol.id                                  AS po_line_id,
    po.po_number,
    p.code                                  AS product_code,
    po_uom.code                             AS po_uom,
    base_uom.code                           AS base_uom,
    pol.quantity_ordered,
    pol.quantity_received
FROM purchase_order_lines pol
JOIN purchase_orders po  ON po.id  = pol.po_id
JOIN products p          ON p.id   = pol.product_id
LEFT JOIN units_of_measure po_uom   ON po_uom.id   = pol.uom_id
LEFT JOIN units_of_measure base_uom ON base_uom.id = p.base_uom_id
WHERE po.is_deleted = false
  AND pol.uom_id != p.base_uom_id
ORDER BY po.po_date DESC;

-- Expected result: 0 rows (all PO lines now match base UOM)
-- If any rows remain, they need manual review.
