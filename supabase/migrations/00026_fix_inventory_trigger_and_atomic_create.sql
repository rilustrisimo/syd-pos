-- ─────────────────────────────────────────────────────────────────────────────
-- 00026: Atomic transaction creation RPC for the mobile POS
--
-- The existing trigger on `transactions` INSERT fires before lines are inserted,
-- so it finds 0 rows and does nothing.  This RPC:
--   1. Inserts header, lines, and payments in one implicit DB transaction
--      (any failure rolls back everything — no orphan records).
--   2. Explicitly applies inventory movements per line AFTER all lines are
--      inserted, using the same multi-unit conversion logic as the web triggers.
--
-- The web POS continues to use its existing code path (unmodified).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_transaction_atomic(
    p_branch_id          UUID,
    p_customer_id        UUID,
    p_transaction_type   TEXT,
    p_delivery_type      TEXT,
    p_delivery_address   TEXT,
    p_delivery_phone     TEXT,
    p_notes              TEXT,
    p_subtotal           DECIMAL(12, 2),
    p_discount_amount    DECIMAL(12, 2),
    p_delivery_fee       DECIMAL(12, 2),
    p_other_fees         DECIMAL(12, 2),
    p_other_fees_notes   TEXT,
    p_transaction_date   TIMESTAMPTZ,
    p_total_amount       DECIMAL(12, 2),
    p_amount_paid        DECIMAL(12, 2),
    p_payment_status     TEXT,
    p_created_by         UUID,
    p_lines              JSONB,   -- [{ product_id, variant_id, quantity, uom_id, unit_price, cogs_per_unit, discount_amount }]
    p_payments           JSONB    -- [{ payment_method, amount, reference_number }]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_txn_number    TEXT;
    v_txn_id        UUID;
    v_line          JSONB;
    v_payment       JSONB;
    v_line_num      INT := 1;
    v_line_id       UUID;

    -- Inventory variables
    inv_id          UUID;
    current_qty     DECIMAL(12, 4);
    base_unit_qty   DECIMAL(12, 4);
    p_base_uom      UUID;
    p_selling_uom   UUID;
    p_conv          DECIMAL(12, 4);
    unit_conv       DECIMAL(12, 4);
    v_prod_id       UUID;
    v_variant_id    UUID;
    v_quantity      DECIMAL(12, 4);
    v_uom_id        UUID;
BEGIN
    -- ── Generate transaction number ──────────────────────────────────────────
    v_txn_number := generate_transaction_number();

    -- ── Insert transaction header ────────────────────────────────────────────
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
        delivery_fee,
        other_fees,
        other_fees_notes,
        transaction_date,
        total_amount,
        amount_paid,
        payment_status,
        created_by
    ) VALUES (
        v_txn_number,
        p_branch_id,
        p_customer_id,
        p_transaction_type::transaction_type,
        p_delivery_type,
        p_delivery_address,
        p_delivery_phone,
        p_notes,
        p_subtotal,
        p_discount_amount,
        p_delivery_fee,
        p_other_fees,
        p_other_fees_notes,
        COALESCE(p_transaction_date, NOW()),
        p_total_amount,
        p_amount_paid,
        p_payment_status::payment_status,
        p_created_by
    )
    RETURNING id INTO v_txn_id;

    -- ── Insert lines + update inventory per line ─────────────────────────────
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

        -- Only deduct/add inventory for sales and returns
        IF p_transaction_type NOT IN ('sale', 'return') THEN
            CONTINUE;
        END IF;

        -- Resolve base-unit quantity (mirrors process_transaction_inventory logic)
        SELECT base_uom_id, selling_uom_id, conversion_factor
        INTO p_base_uom, p_selling_uom, p_conv
        FROM products WHERE id = v_prod_id;

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

        -- Get or create branch_inventory row
        SELECT id, quantity_on_hand INTO inv_id, current_qty
        FROM branch_inventory
        WHERE branch_id  = p_branch_id
          AND product_id = v_prod_id
          AND (variant_id = v_variant_id OR (variant_id IS NULL AND v_variant_id IS NULL));

        IF inv_id IS NULL THEN
            INSERT INTO branch_inventory (branch_id, product_id, variant_id, quantity_on_hand)
            VALUES (p_branch_id, v_prod_id, v_variant_id, 0)
            RETURNING id, quantity_on_hand INTO inv_id, current_qty;
        END IF;

        IF p_transaction_type = 'sale' THEN
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

    -- ── Insert payments ──────────────────────────────────────────────────────
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

    -- ── Return the saved transaction row ─────────────────────────────────────
    RETURN (SELECT to_jsonb(t.*) FROM transactions t WHERE t.id = v_txn_id);
END;
$$;

-- Grant execute to authenticated users (table-level RLS still applies)
GRANT EXECUTE ON FUNCTION create_transaction_atomic TO authenticated;
