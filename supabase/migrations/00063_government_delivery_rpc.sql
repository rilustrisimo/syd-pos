-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00063: Government Delivery RPC + Skip Inventory on Sale Creation
--
-- Two changes:
--   1. Recreate create_transaction_atomic (26 params) to skip inventory
--      movement for government sales (p_is_government_sale = TRUE).
--      Lines are still inserted; only the branch_inventory update + movement
--      record are skipped until deliver_government_sale() is called.
--
--   2. New function deliver_government_sale(transaction_id, delivered_by):
--      - Validates the sale is a government sale and not yet delivered
--      - Marks is_delivered = TRUE, records delivered_at / delivered_by
--      - Moves inventory for all transaction_lines (same logic as the sale
--        branch in create_transaction_atomic)
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Recreate create_transaction_atomic (skip inventory for gov sales) ─────

DROP FUNCTION IF EXISTS create_transaction_atomic(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT,
  DECIMAL, DECIMAL,
  DECIMAL, DECIMAL, DECIMAL, TEXT, TIMESTAMPTZ,
  DECIMAL, DECIMAL, TEXT, UUID, JSONB, JSONB,
  BOOLEAN, TEXT, TEXT, DECIMAL, DECIMAL, UUID
);

CREATE OR REPLACE FUNCTION create_transaction_atomic(
    p_branch_id            UUID,
    p_customer_id          UUID,
    p_transaction_type     TEXT,
    p_delivery_type        TEXT,
    p_delivery_address     TEXT,
    p_delivery_phone       TEXT,
    p_notes                TEXT,
    p_subtotal             DECIMAL(12, 2),
    p_discount_amount      DECIMAL(12, 2),
    p_discount_percentage  DECIMAL(5,  2) DEFAULT 0,
    p_delivery_fee         DECIMAL(12, 2) DEFAULT 0,
    p_other_fees           DECIMAL(12, 2) DEFAULT 0,
    p_other_fees_notes     TEXT           DEFAULT NULL,
    p_transaction_date     TIMESTAMPTZ    DEFAULT NULL,
    p_total_amount         DECIMAL(12, 2) DEFAULT 0,
    p_amount_paid          DECIMAL(12, 2) DEFAULT 0,
    p_payment_status       TEXT           DEFAULT 'unpaid',
    p_created_by           UUID           DEFAULT NULL,
    p_lines                JSONB          DEFAULT '[]',
    p_payments             JSONB          DEFAULT '[]',
    -- Government-specific fields
    p_is_government_sale   BOOLEAN        DEFAULT FALSE,
    p_po_number            TEXT           DEFAULT NULL,
    p_government_agency    TEXT           DEFAULT NULL,
    p_withholding_rate     DECIMAL(5, 2)  DEFAULT 0,
    p_withholding_amount   DECIMAL(12, 2) DEFAULT 0,
    -- Canvass reference (government sales only)
    p_canvas_id            UUID           DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_txn_number         TEXT;
    v_txn_id             UUID;
    v_line               JSONB;
    v_payment            JSONB;
    v_line_num           INT := 1;
    v_line_id            UUID;

    -- Inventory variables
    inv_id               UUID;
    current_qty          DECIMAL(12, 4);
    base_unit_qty        DECIMAL(12, 4);
    p_base_uom           UUID;
    p_selling_uom        UUID;
    p_conv               DECIMAL(12, 4);
    unit_conv            DECIMAL(12, 4);
    v_prod_id            UUID;
    v_variant_id         UUID;
    v_quantity           DECIMAL(12, 4);
    v_uom_id             UUID;
    v_allow_negative     BOOLEAN;
    v_product_name       TEXT;
BEGIN
    v_txn_number := generate_transaction_number();

    INSERT INTO transactions (
        transaction_number,
        branch_id,
        customer_id,
        transaction_type,
        delivery_type,
        delivery_address,
        delivery_phone,
        notes,
        subtotal,
        discount_amount,
        discount_percentage,
        delivery_fee,
        other_fees,
        other_fees_notes,
        transaction_date,
        total_amount,
        amount_paid,
        payment_status,
        created_by,
        is_government_sale,
        po_number,
        government_agency,
        withholding_rate,
        withholding_amount,
        canvas_id
    ) VALUES (
        v_txn_number,
        p_branch_id,
        p_customer_id,
        p_transaction_type::transaction_type,
        p_delivery_type::delivery_type,
        p_delivery_address,
        p_delivery_phone,
        p_notes,
        p_subtotal,
        p_discount_amount,
        COALESCE(p_discount_percentage, 0),
        p_delivery_fee,
        p_other_fees,
        p_other_fees_notes,
        COALESCE(p_transaction_date, NOW()),
        p_total_amount,
        p_amount_paid,
        p_payment_status::payment_status,
        p_created_by,
        COALESCE(p_is_government_sale, FALSE),
        p_po_number,
        p_government_agency,
        COALESCE(p_withholding_rate, 0),
        COALESCE(p_withholding_amount, 0),
        p_canvas_id
    )
    RETURNING id INTO v_txn_id;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP

        v_prod_id    := (v_line->>'product_id')::UUID;
        v_variant_id := NULLIF(v_line->>'variant_id', '')::UUID;
        v_quantity   := (v_line->>'quantity')::DECIMAL;
        v_uom_id     := (v_line->>'uom_id')::UUID;

        INSERT INTO transaction_lines (
            transaction_id,
            line_number,
            product_id,
            variant_id,
            quantity,
            uom_id,
            unit_price,
            cogs_per_unit,
            discount_amount
        ) VALUES (
            v_txn_id,
            v_line_num,
            v_prod_id,
            v_variant_id,
            v_quantity,
            v_uom_id,
            (v_line->>'unit_price')::DECIMAL,
            (v_line->>'cogs_per_unit')::DECIMAL,
            COALESCE((v_line->>'discount_amount')::DECIMAL, 0)
        )
        RETURNING id INTO v_line_id;

        v_line_num := v_line_num + 1;

        -- Skip inventory for non-sale/return transactions
        IF p_transaction_type NOT IN ('sale', 'return') THEN
            CONTINUE;
        END IF;

        -- Government sales: inventory moves on delivery, not on creation
        IF COALESCE(p_is_government_sale, FALSE) = TRUE THEN
            CONTINUE;
        END IF;

        SELECT base_uom_id, selling_uom_id, conversion_factor, allow_negative_inventory, name
        INTO p_base_uom, p_selling_uom, p_conv, v_allow_negative, v_product_name
        FROM products
        WHERE id = v_prod_id;

        unit_conv := NULL;

        IF v_uom_id = p_base_uom THEN
            base_unit_qty := v_quantity;
        ELSE
            SELECT conversion_factor INTO unit_conv
            FROM product_selling_units
            WHERE product_id = v_prod_id
              AND uom_id     = v_uom_id
              AND is_active  = true
            LIMIT 1;

            IF unit_conv IS NOT NULL AND unit_conv > 0 THEN
                base_unit_qty := v_quantity / unit_conv;
            ELSIF v_uom_id = p_selling_uom AND p_conv > 0 THEN
                base_unit_qty := v_quantity / p_conv;
            ELSE
                base_unit_qty := v_quantity;
            END IF;
        END IF;

        SELECT id, quantity_on_hand INTO inv_id, current_qty
        FROM branch_inventory
        WHERE branch_id  = p_branch_id
          AND product_id = v_prod_id
          AND (variant_id = v_variant_id OR (variant_id IS NULL AND v_variant_id IS NULL))
        FOR UPDATE;

        IF inv_id IS NULL THEN
            INSERT INTO branch_inventory (branch_id, product_id, variant_id, quantity_on_hand)
            VALUES (p_branch_id, v_prod_id, v_variant_id, 0)
            RETURNING id, quantity_on_hand INTO inv_id, current_qty;
        END IF;

        IF p_transaction_type = 'sale' THEN
            IF current_qty < base_unit_qty AND v_allow_negative = false THEN
                RAISE EXCEPTION 'Insufficient stock for product "%". Available: % base units, Requested: % base units (% selling units)',
                    v_product_name,
                    ROUND(current_qty, 4),
                    ROUND(base_unit_qty, 4),
                    v_quantity
                    USING ERRCODE = 'check_violation',
                          HINT = 'Enable "allow_negative_inventory" on this product to override.';
            END IF;

            UPDATE branch_inventory
            SET quantity_on_hand = quantity_on_hand - base_unit_qty,
                last_movement_at = NOW()
            WHERE id = inv_id;

            INSERT INTO inventory_movements (
                branch_id, product_id, variant_id, movement_type,
                quantity_change, quantity_before, quantity_after,
                reference_id, reference_type, created_by, notes
            ) VALUES (
                p_branch_id, v_prod_id, v_variant_id, 'sale',
                -base_unit_qty, current_qty, current_qty - base_unit_qty,
                v_txn_id, 'transaction', p_created_by,
                CASE
                    WHEN v_uom_id != p_base_uom AND unit_conv IS NOT NULL
                    THEN 'Sold ' || v_quantity || ' units (conv: ' || unit_conv
                         || '), deducted ' || ROUND(base_unit_qty, 4) || ' base units'
                    ELSE NULL
                END
            );

        ELSIF p_transaction_type = 'return' THEN
            UPDATE branch_inventory
            SET quantity_on_hand = quantity_on_hand + base_unit_qty,
                last_movement_at = NOW()
            WHERE id = inv_id;

            INSERT INTO inventory_movements (
                branch_id, product_id, variant_id, movement_type,
                quantity_change, quantity_before, quantity_after,
                reference_id, reference_type, created_by, notes
            ) VALUES (
                p_branch_id, v_prod_id, v_variant_id, 'return',
                base_unit_qty, current_qty, current_qty + base_unit_qty,
                v_txn_id, 'transaction', p_created_by,
                CASE
                    WHEN v_uom_id != p_base_uom AND unit_conv IS NOT NULL
                    THEN 'Returned ' || v_quantity || ' units (conv: ' || unit_conv
                         || '), added ' || ROUND(base_unit_qty, 4) || ' base units'
                    ELSE NULL
                END
            );
        END IF;

    END LOOP;

    FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
        INSERT INTO transaction_payments (
            transaction_id,
            payment_method,
            amount,
            reference_number,
            created_by
        ) VALUES (
            v_txn_id,
            (v_payment->>'payment_method')::payment_method,
            (v_payment->>'amount')::DECIMAL,
            NULLIF(v_payment->>'reference_number', ''),
            p_created_by
        );
    END LOOP;

    RETURN (SELECT to_jsonb(t.*) FROM transactions t WHERE t.id = v_txn_id);
END;
$$;

GRANT EXECUTE ON FUNCTION create_transaction_atomic TO authenticated;


-- ── 2. New RPC: deliver_government_sale ───────────────────────────────────────
-- Called when goods are physically delivered to the government agency.
-- Marks the transaction as delivered and moves inventory for all lines.

CREATE OR REPLACE FUNCTION deliver_government_sale(
    p_transaction_id UUID,
    p_delivered_by   UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_txn          RECORD;
    v_line         RECORD;
    inv_id         UUID;
    current_qty    DECIMAL(12, 4);
    base_unit_qty  DECIMAL(12, 4);
    p_base_uom     UUID;
    p_selling_uom  UUID;
    p_conv         DECIMAL(12, 4);
    unit_conv      DECIMAL(12, 4);
    v_allow_neg    BOOLEAN;
    v_product_name TEXT;
BEGIN
    -- Fetch and lock the transaction
    SELECT * INTO v_txn
    FROM transactions
    WHERE id                = p_transaction_id
      AND is_government_sale = TRUE
      AND is_deleted         = FALSE
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Government sale not found or has been deleted.';
    END IF;

    IF v_txn.is_delivered THEN
        RAISE EXCEPTION 'Sale % is already marked as delivered.', v_txn.transaction_number;
    END IF;

    -- Mark as delivered
    UPDATE transactions
    SET is_delivered = TRUE,
        delivered_at = NOW(),
        delivered_by = p_delivered_by
    WHERE id = p_transaction_id;

    -- Move inventory for each line
    FOR v_line IN
        SELECT * FROM transaction_lines WHERE transaction_id = p_transaction_id
    LOOP
        SELECT base_uom_id, selling_uom_id, conversion_factor, allow_negative_inventory, name
        INTO p_base_uom, p_selling_uom, p_conv, v_allow_neg, v_product_name
        FROM products
        WHERE id = v_line.product_id;

        unit_conv := NULL;

        IF v_line.uom_id = p_base_uom THEN
            base_unit_qty := v_line.quantity;
        ELSE
            SELECT conversion_factor INTO unit_conv
            FROM product_selling_units
            WHERE product_id = v_line.product_id
              AND uom_id     = v_line.uom_id
              AND is_active  = true
            LIMIT 1;

            IF unit_conv IS NOT NULL AND unit_conv > 0 THEN
                base_unit_qty := v_line.quantity / unit_conv;
            ELSIF v_line.uom_id = p_selling_uom AND p_conv > 0 THEN
                base_unit_qty := v_line.quantity / p_conv;
            ELSE
                base_unit_qty := v_line.quantity;
            END IF;
        END IF;

        -- Lock inventory row
        SELECT id, quantity_on_hand INTO inv_id, current_qty
        FROM branch_inventory
        WHERE branch_id  = v_txn.branch_id
          AND product_id = v_line.product_id
          AND (variant_id = v_line.variant_id OR (variant_id IS NULL AND v_line.variant_id IS NULL))
        FOR UPDATE;

        IF inv_id IS NULL THEN
            INSERT INTO branch_inventory (branch_id, product_id, variant_id, quantity_on_hand)
            VALUES (v_txn.branch_id, v_line.product_id, v_line.variant_id, 0)
            RETURNING id, quantity_on_hand INTO inv_id, current_qty;
        END IF;

        -- Validate stock
        IF current_qty < base_unit_qty AND v_allow_neg = FALSE THEN
            RAISE EXCEPTION 'Insufficient stock for product "%". Available: % base units, Required: % base units',
                v_product_name,
                ROUND(current_qty, 4),
                ROUND(base_unit_qty, 4)
                USING ERRCODE = 'check_violation';
        END IF;

        -- Deduct inventory
        UPDATE branch_inventory
        SET quantity_on_hand = quantity_on_hand - base_unit_qty,
            last_movement_at = NOW()
        WHERE id = inv_id;

        INSERT INTO inventory_movements (
            branch_id, product_id, variant_id, movement_type,
            quantity_change, quantity_before, quantity_after,
            reference_id, reference_type, created_by, notes
        ) VALUES (
            v_txn.branch_id, v_line.product_id, v_line.variant_id, 'sale',
            -base_unit_qty, current_qty, current_qty - base_unit_qty,
            p_transaction_id, 'transaction', p_delivered_by,
            'Delivered: ' || v_txn.transaction_number ||
            CASE
                WHEN v_line.uom_id != p_base_uom AND unit_conv IS NOT NULL
                THEN ' (' || v_line.quantity || ' units → ' || ROUND(base_unit_qty, 4) || ' base units)'
                ELSE ''
            END
        );
    END LOOP;

    RETURN (SELECT to_jsonb(t.*) FROM transactions t WHERE t.id = p_transaction_id);
END;
$$;

GRANT EXECUTE ON FUNCTION deliver_government_sale TO authenticated;
