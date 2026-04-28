-- ============================================================================
-- Migration 00056: Fix PO receiving issues
-- ============================================================================
--
-- Problems fixed:
--
-- 1. RETAIN PRICE NOT WORKING
--    The `on_po_line_received` trigger (00010, updated by 00053) auto-sets
--    `products.current_selling_price` the moment `quantity_received` increases —
--    before the price review dialog opens. User selecting "Retain" correctly
--    skips the JS update, but the DB has already changed the price.
--    Fix: Drop the trigger. Move COGS updates into receive_purchase_order_atomic
--    which is the authoritative receive path (same reasoning as migration 00034
--    which dropped the duplicate inventory trigger).
--    current_selling_price is now ONLY touched by the price review dialog.
--
-- 2. `partially_received` STATUS TYPO
--    RPC used `status = 'partial'` and `NOT IN ('received', 'partial')` but the
--    enum value is `'partially_received'`. POs got stuck in their pre-receive
--    status (draft / sent / confirmed) when partially received.
--
-- 3. `actual_delivery_date` NOT SET
--    receiveAllPOLines (TS) tried to update `updated_at` with the receive date
--    instead of `actual_delivery_date`. The RPC now accepts `p_receive_date` and
--    stamps `actual_delivery_date` when the PO becomes fully received.
--
-- 4. DELIVERY CHARGE NOT DISTRIBUTED INTO COGS
--    The UI says "distributed proportionally into product COGS on receipt" but
--    neither the old trigger nor the RPC did it. The trigger had no access to
--    the PO header. The RPC now computes:
--      effective_unit_cost = unit_cost × (1 + delivery_charge / total_merchandise)
--    which is the per-selling-unit cost including a proportional delivery share.
--
-- ============================================================================

-- ── Step 1: Drop the trigger and function that auto-applied selling price ─────
-- The trigger fires on purchase_order_lines AFTER UPDATE when quantity_received
-- increases. It called update_product_pricing_on_receive() which set both
-- latest_cogs AND current_selling_price — bypassing the price review dialog.
-- The new RPC handles latest_cogs and base_unit_cost updates correctly.

DROP TRIGGER IF EXISTS on_po_line_received ON purchase_order_lines;
DROP FUNCTION IF EXISTS update_product_pricing_on_receive();

-- Drop the old 3-argument overload before replacing with the 4-argument version.
-- Without this, PostgreSQL sees two overloads and raises "function name is not unique".
DROP FUNCTION IF EXISTS receive_purchase_order_atomic(UUID, JSONB, UUID);

-- ── Step 2: Replace receive_purchase_order_atomic ────────────────────────────

CREATE OR REPLACE FUNCTION receive_purchase_order_atomic(
    p_po_id          UUID,
    p_received_lines JSONB,         -- [{ po_line_id, quantity_received }]
    p_user_id        UUID,
    p_receive_date   DATE DEFAULT NULL  -- actual delivery date (NULL = today)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_po_branch     UUID;
    v_po_status     TEXT;
    v_delivery_charge    DECIMAL(12, 2);
    v_total_merchandise  DECIMAL(12, 4);

    v_line          JSONB;
    v_po_line_id    UUID;
    v_qty_received  DECIMAL(12, 4);

    -- PO line details
    v_product_id          UUID;
    v_variant_id          UUID;
    v_uom_id              UUID;
    v_unit_cost           DECIMAL(12, 4);
    v_qty_ordered         DECIMAL(12, 4);
    v_qty_already_received DECIMAL(12, 4);
    v_new_qty_received    DECIMAL(12, 4);

    -- Product details
    v_product_name        TEXT;
    v_base_uom            UUID;
    v_selling_uom         UUID;
    v_conversion_factor   DECIMAL(12, 4);
    v_unit_conversion_factor DECIMAL(12, 4);
    v_base_unit_qty       DECIMAL(12, 4);

    -- Effective COGS (unit_cost + proportional delivery share)
    v_effective_unit_cost  DECIMAL(12, 4);

    -- Inventory
    v_inv_id        UUID;
    v_current_qty   DECIMAL(12, 4);

    -- Summary
    v_lines_updated     INT := 0;
    v_total_qty_received DECIMAL(12, 4) := 0;
    v_all_received      BOOLEAN;
BEGIN
    -- ── Validate PO and get header data ──────────────────────────────────────
    SELECT branch_id, status, COALESCE(delivery_charge, 0)
    INTO   v_po_branch, v_po_status, v_delivery_charge
    FROM   purchase_orders
    WHERE  id = p_po_id
      AND  is_deleted = false;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase order not found or deleted: %', p_po_id
            USING ERRCODE = 'no_data_found';
    END IF;

    IF v_po_status = 'cancelled' THEN
        RAISE EXCEPTION 'Cannot receive from cancelled purchase order'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- ── Delivery charge distribution ─────────────────────────────────────────
    -- Total merchandise = sum(quantity_ordered × unit_cost) across all lines
    SELECT COALESCE(SUM(quantity_ordered * unit_cost), 0)
    INTO   v_total_merchandise
    FROM   purchase_order_lines
    WHERE  po_id = p_po_id;

    -- ── Process each received line ────────────────────────────────────────────
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_received_lines) LOOP
        v_po_line_id   := (v_line->>'po_line_id')::UUID;
        v_qty_received := (v_line->>'quantity_received')::DECIMAL;

        IF v_qty_received <= 0 THEN
            RAISE EXCEPTION 'Quantity received must be greater than zero'
                USING ERRCODE = 'invalid_parameter_value';
        END IF;

        -- Get PO line details with row lock
        SELECT product_id, variant_id, uom_id, unit_cost,
               quantity_ordered, quantity_received
        INTO   v_product_id, v_variant_id, v_uom_id, v_unit_cost,
               v_qty_ordered, v_qty_already_received
        FROM   purchase_order_lines
        WHERE  id    = v_po_line_id
          AND  po_id = p_po_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'PO line not found: %', v_po_line_id
                USING ERRCODE = 'no_data_found';
        END IF;

        v_new_qty_received := COALESCE(v_qty_already_received, 0) + v_qty_received;

        IF v_new_qty_received > v_qty_ordered THEN
            RAISE EXCEPTION 'Cannot receive more than ordered. Ordered: %, Already received: %, Trying to receive: %',
                v_qty_ordered, v_qty_already_received, v_qty_received
                USING ERRCODE = 'check_violation';
        END IF;

        -- Get product details
        SELECT base_uom_id, selling_uom_id, conversion_factor, name
        INTO   v_base_uom, v_selling_uom, v_conversion_factor, v_product_name
        FROM   products
        WHERE  id = v_product_id
          AND  is_active = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product not found or inactive: %', v_product_id
                USING ERRCODE = 'no_data_found';
        END IF;

        -- ── Unit conversion to base units ─────────────────────────────────────
        v_unit_conversion_factor := NULL;

        IF v_uom_id = v_base_uom THEN
            v_base_unit_qty := v_qty_received;
        ELSE
            SELECT conversion_factor INTO v_unit_conversion_factor
            FROM   product_selling_units
            WHERE  product_id = v_product_id
              AND  uom_id     = v_uom_id
              AND  is_active  = true
            LIMIT 1;

            IF v_unit_conversion_factor IS NOT NULL AND v_unit_conversion_factor > 0 THEN
                v_base_unit_qty := v_qty_received / v_unit_conversion_factor;
            ELSIF v_uom_id = v_selling_uom AND v_conversion_factor > 0 THEN
                v_base_unit_qty := v_qty_received / v_conversion_factor;
            ELSE
                RAISE EXCEPTION 'Cannot convert UOM to base units for product "%". No conversion factor found.',
                    v_product_name
                    USING ERRCODE = 'invalid_parameter_value';
            END IF;
        END IF;

        -- ── Update PO line ────────────────────────────────────────────────────
        UPDATE purchase_order_lines
        SET    quantity_received = v_new_qty_received,
               updated_at        = NOW()
        WHERE  id = v_po_line_id;

        -- ── Update inventory with row lock ────────────────────────────────────
        SELECT id, quantity_on_hand INTO v_inv_id, v_current_qty
        FROM   branch_inventory
        WHERE  branch_id   = v_po_branch
          AND  product_id  = v_product_id
          AND  (variant_id = v_variant_id OR (variant_id IS NULL AND v_variant_id IS NULL))
        FOR UPDATE;

        IF v_inv_id IS NULL THEN
            INSERT INTO branch_inventory (
                branch_id, product_id, variant_id,
                quantity_on_hand, last_movement_at
            ) VALUES (
                v_po_branch, v_product_id, v_variant_id,
                v_base_unit_qty, NOW()
            )
            RETURNING id INTO v_inv_id;
            v_current_qty := 0;
        ELSE
            v_current_qty := COALESCE(v_current_qty, 0);
            UPDATE branch_inventory
            SET    quantity_on_hand  = quantity_on_hand + v_base_unit_qty,
                   last_movement_at = NOW()
            WHERE  id = v_inv_id;
        END IF;

        -- ── Record inventory movement ─────────────────────────────────────────
        INSERT INTO inventory_movements (
            branch_id, product_id, variant_id, movement_type,
            quantity_change, quantity_before, quantity_after,
            reference_id, reference_type, created_by, notes
        ) VALUES (
            v_po_branch, v_product_id, v_variant_id, 'purchase',
            v_base_unit_qty,
            v_current_qty,
            v_current_qty + v_base_unit_qty,
            p_po_id, 'purchase_order', p_user_id,
            format(
                'Received %s units%s for %s',
                v_qty_received,
                CASE
                    WHEN v_uom_id != v_base_uom AND v_unit_conversion_factor IS NOT NULL
                    THEN ' (conversion: ' || v_unit_conversion_factor
                         || ', base units: ' || ROUND(v_base_unit_qty, 4) || ')'
                    ELSE ''
                END,
                v_product_name
            )
        );

        -- ── Update product COGS (with delivery charge distribution) ───────────
        -- effective_unit_cost = unit_cost × (1 + delivery_charge / total_merchandise)
        -- When delivery_charge = 0 or total_merchandise = 0, falls back to unit_cost.
        -- We update latest_cogs and base_unit_cost only — NOT current_selling_price.
        -- Selling price changes are handled exclusively by the price review dialog.
        IF v_total_merchandise > 0 AND v_delivery_charge > 0 THEN
            v_effective_unit_cost := v_unit_cost
                * (1 + v_delivery_charge::DECIMAL / v_total_merchandise);
        ELSE
            v_effective_unit_cost := v_unit_cost;
        END IF;

        UPDATE products p
        SET
            latest_cogs    = v_effective_unit_cost,
            base_unit_cost = ROUND(
                v_effective_unit_cost * COALESCE(NULLIF(p.conversion_factor, 0), 1),
                4
            ),
            updated_at = NOW()
        WHERE p.id = v_product_id;

        v_lines_updated      := v_lines_updated + 1;
        v_total_qty_received := v_total_qty_received + v_base_unit_qty;
    END LOOP;

    -- ── Update PO status ──────────────────────────────────────────────────────
    SELECT NOT EXISTS (
        SELECT 1 FROM purchase_order_lines
        WHERE po_id = p_po_id
          AND quantity_received < quantity_ordered
    ) INTO v_all_received;

    IF v_all_received THEN
        UPDATE purchase_orders
        SET status               = 'received',
            actual_delivery_date = COALESCE(p_receive_date, CURRENT_DATE),
            updated_at           = NOW()
        WHERE id = p_po_id;
    ELSE
        -- Use correct enum value: 'partially_received' (not 'partial')
        UPDATE purchase_orders
        SET status     = 'partially_received',
            updated_at = NOW()
        WHERE id = p_po_id
          AND status NOT IN ('received', 'partially_received');
    END IF;

    RETURN jsonb_build_object(
        'success',               true,
        'po_id',                 p_po_id,
        'lines_updated',         v_lines_updated,
        'total_quantity_received', v_total_qty_received,
        'po_status',             (SELECT status FROM purchase_orders WHERE id = p_po_id)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION receive_purchase_order_atomic TO authenticated;

COMMENT ON FUNCTION receive_purchase_order_atomic IS
    'Atomically receives PO lines. Updates inventory, records movements, updates '
    'product COGS (latest_cogs + base_unit_cost with delivery charge distribution). '
    'Does NOT touch current_selling_price — that is handled by the price review dialog. '
    'Fixes: partially_received status, actual_delivery_date stamping, delivery charge COGS.';
