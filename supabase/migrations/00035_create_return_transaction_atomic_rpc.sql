-- ============================================================================
-- Migration 00035: Atomic return transaction RPC
-- ============================================================================
-- PROBLEM: createReturnTransaction() in the app uses direct INSERT to
-- transactions + transaction_lines. The on_transaction_inventory_update
-- trigger fires when the transaction header is inserted, but at that point
-- zero lines exist, so it finds nothing and does nothing. Inventory is
-- NEVER updated for returns.
--
-- FIX: Create create_return_transaction_atomic() that inserts header, lines,
-- payment, and inventory movements all in one DB transaction — identical
-- pattern to create_transaction_atomic (migration 00026) for sales.
--
-- Also adds original_transaction_id column to transactions for proper
-- referential integrity instead of text-based notes lookup.
-- ============================================================================

-- Step 1: Add original_transaction_id column to transactions
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS original_transaction_id UUID
        REFERENCES transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_original_id
    ON transactions(original_transaction_id)
    WHERE original_transaction_id IS NOT NULL;

COMMENT ON COLUMN transactions.original_transaction_id IS
    'For return transactions: references the original sale transaction.';


-- Step 2: Create the atomic return RPC
CREATE OR REPLACE FUNCTION create_return_transaction_atomic(
    p_branch_id               UUID,
    p_customer_id             UUID,
    p_original_transaction_id UUID,
    p_reason                  TEXT,        -- Overall return reason/notes
    p_notes                   TEXT,        -- Additional notes
    p_subtotal                DECIMAL(12, 2),
    p_refund_amount           DECIMAL(12, 2),
    p_refund_method           TEXT,        -- 'cash', 'gcash', 'store_credit', etc.
    p_refund_reference        TEXT,
    p_created_by              UUID,
    p_lines                   JSONB,
    -- Each line: { product_id, variant_id, quantity, uom_id,
    --              unit_price, cogs_per_unit, should_restock, return_reason }
    p_transaction_date        TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_return_number         TEXT;
    v_return_id             UUID;
    v_original_txn_number   TEXT;
    v_line                  JSONB;
    v_line_num              INT := 1;

    -- Per-line vars
    v_prod_id               UUID;
    v_variant_id            UUID;
    v_quantity              DECIMAL(12, 4);
    v_uom_id                UUID;
    v_unit_price            DECIMAL(12, 2);
    v_cogs_per_unit         DECIMAL(12, 4);
    v_return_reason         TEXT;
    v_should_restock        BOOLEAN;

    -- Inventory vars
    v_base_uom              UUID;
    v_selling_uom           UUID;
    v_prod_conv             DECIMAL(12, 4);
    v_unit_conv             DECIMAL(12, 4);
    v_base_qty              DECIMAL(12, 4);
    v_inv_id                UUID;
    v_current_qty           DECIMAL(12, 4);

    -- Customer credit
    v_had_credit            BOOLEAN;
    v_customer_balance      DECIMAL(12, 2);
BEGIN

    -- ─────────────────────────────────────────────────────────────────────
    -- 1. Validate original transaction
    -- ─────────────────────────────────────────────────────────────────────
    SELECT transaction_number INTO v_original_txn_number
    FROM transactions
    WHERE id = p_original_transaction_id
      AND is_deleted = false;

    IF v_original_txn_number IS NULL THEN
        RAISE EXCEPTION 'Original transaction not found or has been deleted'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- ─────────────────────────────────────────────────────────────────────
    -- 2. Generate RTN number (sequential per day)
    -- ─────────────────────────────────────────────────────────────────────
    SELECT 'RTN-' || TO_CHAR(COALESCE(p_transaction_date, NOW()), 'YYYYMMDD') || '-' ||
           LPAD((
               COALESCE((
                   SELECT MAX(CAST(SUBSTRING(transaction_number FROM 14) AS INT))
                   FROM transactions
                   WHERE transaction_number LIKE 'RTN-' || TO_CHAR(COALESCE(p_transaction_date, NOW()), 'YYYYMMDD') || '-%'
                     AND transaction_number ~ '^RTN-[0-9]{8}-[0-9]+$'
               ), 0) + 1
           )::TEXT, 4, '0')
    INTO v_return_number;

    -- ─────────────────────────────────────────────────────────────────────
    -- 3. Insert return transaction header
    -- ─────────────────────────────────────────────────────────────────────
    INSERT INTO transactions (
        transaction_number, branch_id, customer_id, transaction_type,
        delivery_type, subtotal, discount_amount, discount_percentage, tax_amount,
        total_amount, payment_status, amount_paid,
        notes, created_by, transaction_date, original_transaction_id
    ) VALUES (
        v_return_number,
        p_branch_id,
        p_customer_id,
        'return',
        'pickup',
        p_subtotal, 0, 0, 0,
        p_subtotal,
        'paid',
        p_refund_amount,
        'Return for ' || v_original_txn_number
            || CASE WHEN p_reason IS NOT NULL AND p_reason != ''
                    THEN '. Reason: ' || p_reason ELSE '' END
            || CASE WHEN p_notes IS NOT NULL AND p_notes != ''
                    THEN '. ' || p_notes ELSE '' END,
        p_created_by,
        COALESCE(p_transaction_date, NOW()),
        p_original_transaction_id
    ) RETURNING id INTO v_return_id;

    -- ─────────────────────────────────────────────────────────────────────
    -- 4. Process each return line
    -- ─────────────────────────────────────────────────────────────────────
    FOR v_line IN SELECT jsonb_array_elements(p_lines) LOOP

        v_prod_id       := (v_line->>'product_id')::UUID;
        v_variant_id    := NULLIF(v_line->>'variant_id', '')::UUID;
        v_quantity      := (v_line->>'quantity')::DECIMAL;
        v_uom_id        := (v_line->>'uom_id')::UUID;
        v_unit_price    := (v_line->>'unit_price')::DECIMAL;
        v_cogs_per_unit := (v_line->>'cogs_per_unit')::DECIMAL;
        v_return_reason := v_line->>'return_reason';

        -- Determine should_restock: auto-false for damaged/expired/defective/quality_issue
        IF v_return_reason IN ('damaged', 'expired', 'defective', 'quality_issue') THEN
            v_should_restock := false;
        ELSIF (v_line->>'should_restock') IS NOT NULL AND (v_line->>'should_restock') != '' THEN
            v_should_restock := (v_line->>'should_restock')::BOOLEAN;
        ELSE
            v_should_restock := true;  -- default: restock
        END IF;

        -- Insert transaction line (set_restock_flag trigger also runs and enforces this)
        INSERT INTO transaction_lines (
            transaction_id, line_number, product_id, variant_id,
            quantity, uom_id, unit_price, cogs_per_unit, discount_amount,
            should_restock, return_reason, notes
        ) VALUES (
            v_return_id, v_line_num, v_prod_id, v_variant_id,
            v_quantity, v_uom_id, v_unit_price, v_cogs_per_unit, 0,
            v_should_restock, v_return_reason,
            'Reason: ' || COALESCE(v_return_reason, 'customer_request')
        );

        v_line_num := v_line_num + 1;

        -- ── Convert quantity to base units ───────────────────────────────
        SELECT base_uom_id, selling_uom_id, conversion_factor
        INTO v_base_uom, v_selling_uom, v_prod_conv
        FROM products WHERE id = v_prod_id;

        IF v_uom_id = v_base_uom THEN
            v_base_qty := v_quantity;
        ELSE
            SELECT conversion_factor INTO v_unit_conv
            FROM product_selling_units
            WHERE product_id = v_prod_id
              AND uom_id = v_uom_id
              AND is_active = true
            LIMIT 1;

            IF v_unit_conv IS NOT NULL AND v_unit_conv > 0 THEN
                v_base_qty := v_quantity / v_unit_conv;
            ELSIF v_uom_id = v_selling_uom AND v_prod_conv > 0 THEN
                v_base_qty := v_quantity / v_prod_conv;
            ELSE
                v_base_qty := v_quantity;
            END IF;
        END IF;

        -- ── Get/create inventory row (with lock) ─────────────────────────
        SELECT id, quantity_on_hand INTO v_inv_id, v_current_qty
        FROM branch_inventory
        WHERE branch_id  = p_branch_id
          AND product_id = v_prod_id
          AND (variant_id = v_variant_id OR (variant_id IS NULL AND v_variant_id IS NULL))
        FOR UPDATE;

        IF v_inv_id IS NULL THEN
            INSERT INTO branch_inventory (branch_id, product_id, variant_id, quantity_on_hand, last_movement_at)
            VALUES (p_branch_id, v_prod_id, v_variant_id, 0, NOW())
            RETURNING id, quantity_on_hand INTO v_inv_id, v_current_qty;
        END IF;

        v_current_qty := COALESCE(v_current_qty, 0);

        -- ── Update inventory and record movement ─────────────────────────
        IF v_should_restock THEN
            -- Add stock back
            UPDATE branch_inventory
            SET quantity_on_hand = quantity_on_hand + v_base_qty,
                last_movement_at = NOW()
            WHERE id = v_inv_id;

            INSERT INTO inventory_movements (
                branch_id, product_id, variant_id,
                movement_type, quantity_change, quantity_before, quantity_after,
                reference_id, reference_type, created_by, notes
            ) VALUES (
                p_branch_id, v_prod_id, v_variant_id,
                'return',
                v_base_qty,
                v_current_qty,
                v_current_qty + v_base_qty,
                v_return_id, 'transaction', p_created_by,
                'Returned ' || v_quantity || ' units → ' || ROUND(v_base_qty, 4) || ' base units added back to stock'
                || CASE WHEN v_return_reason IS NOT NULL THEN ' (' || v_return_reason || ')' ELSE '' END
            );
        ELSE
            -- Damaged/expired: no stock change, but record the event
            INSERT INTO inventory_movements (
                branch_id, product_id, variant_id,
                movement_type, quantity_change, quantity_before, quantity_after,
                reference_id, reference_type, created_by, notes
            ) VALUES (
                p_branch_id, v_prod_id, v_variant_id,
                'damaged_return',
                0,
                v_current_qty,
                v_current_qty,
                v_return_id, 'transaction', p_created_by,
                'Return accepted (' || COALESCE(v_return_reason, 'damaged') || ') — NOT restocked. '
                || v_quantity || ' units written off'
            );
        END IF;

    END LOOP;

    -- ─────────────────────────────────────────────────────────────────────
    -- 5. Record refund payment (negative = money going out)
    -- ─────────────────────────────────────────────────────────────────────
    INSERT INTO transaction_payments (
        transaction_id, payment_method, amount, reference_number, notes, created_by
    ) VALUES (
        v_return_id,
        CASE WHEN p_refund_method = 'store_credit' THEN 'credit' ELSE p_refund_method END,
        -p_refund_amount,
        p_refund_reference,
        'Refund for ' || v_original_txn_number,
        p_created_by
    );

    -- ─────────────────────────────────────────────────────────────────────
    -- 6. Reduce customer outstanding_balance if original sale used credit
    -- ─────────────────────────────────────────────────────────────────────
    SELECT EXISTS (
        SELECT 1 FROM transaction_payments
        WHERE transaction_id  = p_original_transaction_id
          AND payment_method  = 'credit'
          AND amount          > 0
    ) INTO v_had_credit;

    IF v_had_credit AND p_customer_id IS NOT NULL THEN
        UPDATE customers
        SET outstanding_balance = GREATEST(0, COALESCE(outstanding_balance, 0) - p_refund_amount)
        WHERE id = p_customer_id;
    END IF;

    -- ─────────────────────────────────────────────────────────────────────
    -- 7. Return created transaction as JSON
    -- ─────────────────────────────────────────────────────────────────────
    RETURN (SELECT to_jsonb(t.*) FROM transactions t WHERE t.id = v_return_id);

END;
$$;
