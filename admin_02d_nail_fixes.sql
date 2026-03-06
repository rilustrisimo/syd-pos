-- ============================================================================
-- ADMIN STEP 2d: Fix Nail PO Lines — BOX → KG
-- ============================================================================
-- All 12 nail products were recorded with UOM = BOX but base unit is KG.
-- conversion_factor = 1 for all, so quantities stay the same.
-- ============================================================================

ALTER TABLE purchase_order_lines DISABLE TRIGGER on_po_line_inventory_update;


-- Change UOM to KG for all nail products
UPDATE purchase_order_lines
SET uom_id     = (SELECT id FROM units_of_measure WHERE code = 'KG'),
    updated_at = NOW()
WHERE id IN (
    '2bf55e1f-0cbe-4dc8-bdc8-10707951c732',  -- Hardiflex Nail #1 1/4        (PO-20260225-0013) 20 KG
    'ff78272b-ac12-4d84-b511-7b10f899c19f',  -- Finishing Nail #1             (PO-20260224-0005) 20 KG
    '0ddac944-9983-4c0a-b41a-909ce8fe7d71',  -- Finishing Nail #2             (PO-20260224-0005) 20 KG
    '0813ecaa-ddd7-4db0-bc5a-7b46b93dd7ca',  -- Common Nails #1               (PO-20260221-0004) 20 KG
    '98ada111-79ae-4cd5-a05b-9f29d90d9242',  -- Common Nails #1.5             (PO-20260221-0004) 20 KG
    'e98da2bf-74b2-40c0-9254-4ce79e3dc53f',  -- Common Nails #4               (PO-20260221-0004) 100 KG
    '842bb9bb-f399-423d-b1fd-c1e447638d89',  -- Common Nails #2               (PO-20260221-0004) 40 KG
    '81d837a5-c3f3-4bc1-a3dc-a81791438972',  -- Concrete Nails #2             (PO-20260221-0004) 20 KG
    'cc14bf5d-62ed-4c18-b8c4-f8740dae9630',  -- Concrete Nails #3             (PO-20260221-0004) 20 KG
    'dafbb4a6-6035-416b-ac69-68262877d40e',  -- Umbrella Nails #2.5           (PO-20260221-0004) 40 KG
    '870ec566-4572-4fcc-88ca-464d675c12ab',  -- Common Nails #2.5             (PO-20260221-0004) 40 KG
    '58328502-60da-4f68-9cee-0a1079e2c2dc'   -- Common Nails #3               (PO-20260221-0004) 60 KG
);


ALTER TABLE purchase_order_lines ENABLE TRIGGER on_po_line_inventory_update;


-- Verify: should return 0 rows for these products
SELECT
    pol.id          AS po_line_id,
    po.po_number,
    p.code          AS product_code,
    po_uom.code     AS po_uom,
    base_uom.code   AS base_uom,
    pol.quantity_ordered,
    pol.quantity_received
FROM purchase_order_lines pol
JOIN purchase_orders po  ON po.id  = pol.po_id
JOIN products p          ON p.id   = pol.product_id
LEFT JOIN units_of_measure po_uom   ON po_uom.id   = pol.uom_id
LEFT JOIN units_of_measure base_uom ON base_uom.id = p.base_uom_id
WHERE po.is_deleted = false
  AND pol.uom_id != p.base_uom_id
  AND p.code IN (
      'HARDI-N-1 1/4','FIN-NAIL-1','FIN-NAIL-2',
      'CN-1','CN-1.5','CN-4','CN-2',
      'CONCN-2','CONCN-3','UMB-NAIL-2.5','CN-2.5','CN-3'
  );

-- Full mismatch check (all products — should shrink by 12 rows)
SELECT COUNT(*) AS remaining_mismatches
FROM purchase_order_lines pol
JOIN purchase_orders po ON po.id = pol.po_id
JOIN products p         ON p.id  = pol.product_id
WHERE po.is_deleted = false
  AND pol.uom_id != p.base_uom_id;
