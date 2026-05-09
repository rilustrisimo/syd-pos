-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00057: Fix discount double-subtraction + add discount_percentage to RPC
--
-- Root cause of the bug:
--   createTransaction (TypeScript) computes:
--     subtotal = sum(qty × price − line_discount)   ← already post-line-discount
--     total    = subtotal − discount_amount          ← discount_amount = line_disc + order_disc
--   → total = gross − 2×line_disc − order_disc      ← WRONG (line discounts subtracted twice)
--
-- For "at cost" discounts this produces a NEGATIVE total_amount in the DB.
-- For regular line discounts the stored total is too low.
--
-- Fix applied here:
--   1. TypeScript createTransaction now uses:
--        orderDiscountOnly = max(0, discount_amount − sum(line discounts))
--        total = subtotal − orderDiscountOnly + fees
--   2. Existing rows with line discounts are corrected by this migration.
--   3. p_discount_percentage is added to the RPC (DEFAULT 0 keeps old callers working).
--
-- Report functions in migration 00055 remain correct because they use the
-- formula: subtotal + fees − discount_amount + line_discounts
-- which is not affected by fixing total_amount.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── PART 1: Fix existing transaction data ────────────────────────────────────
--
-- Correct total_amount for any transaction where line discounts caused
-- double-subtraction.  Only rows whose computed-correct total differs from
-- the stored total by more than ½ cent are touched.

WITH line_sums AS (
  SELECT transaction_id, SUM(discount_amount) AS line_discounts
  FROM   transaction_lines
  GROUP  BY transaction_id
),
corrected AS (
  SELECT
    t.id,
    GREATEST(0,
      COALESCE(t.subtotal,       0)
      - GREATEST(0, COALESCE(t.discount_amount, 0) - COALESCE(ls.line_discounts, 0))
      + COALESCE(t.delivery_fee, 0)
      + COALESCE(t.other_fees,   0)
      + COALESCE(t.tax_amount,   0)
    ) AS correct_total,
    t.amount_paid
  FROM       transactions   t
  LEFT JOIN  line_sums       ls ON ls.transaction_id = t.id
  WHERE  t.is_deleted = FALSE
    AND  COALESCE(ls.line_discounts, 0) > 0   -- only rows that had line discounts
)
UPDATE transactions t
SET
  total_amount   = c.correct_total,
  payment_status = CASE
    WHEN t.amount_paid >= c.correct_total THEN 'paid'::payment_status
    WHEN t.amount_paid  > 0              THEN 'partial'::payment_status
    ELSE                                      'unpaid'::payment_status
  END
FROM corrected c
WHERE t.id = c.id
  AND ABS(t.total_amount - c.correct_total) > 0.005;


-- ── PART 2: Replace RPC with version that accepts p_discount_percentage ───────
--
-- We must DROP the old overload first because PostgreSQL treats a changed
-- parameter list as a new overload rather than a replacement.

DROP FUNCTION IF EXISTS create_transaction_atomic(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT,
  DECIMAL, DECIMAL,
  DECIMAL, DECIMAL, TEXT, TIMESTAMPTZ,
  DECIMAL, DECIMAL, TEXT, UUID, JSONB, JSONB
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
    p_payments             JSONB          DEFAULT '[]'
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
    -- Generate transaction number
    v_txn_number := generate_transaction_number();

    -- Insert transaction header
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
        created_by
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
        p_created_by
    )
    RETURNING id INTO v_txn_id;

    -- Insert lines + update inventory per line
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

        -- Only process inventory for sales and returns
        IF p_transaction_type NOT IN ('sale', 'return') THEN
            CONTINUE;
        END IF;

        -- Get product information including allow_negative flag
        SELECT base_uom_id, selling_uom_id, conversion_factor, allow_negative_inventory, name
        INTO p_base_uom, p_selling_uom, p_conv, v_allow_negative, v_product_name
        FROM products
        WHERE id = v_prod_id;

        -- Resolve base-unit quantity
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

        -- Lock inventory row to prevent race conditions
        SELECT id, quantity_on_hand INTO inv_id, current_qty
        FROM branch_inventory
        WHERE branch_id  = p_branch_id
          AND product_id = v_prod_id
          AND (variant_id = v_variant_id OR (variant_id IS NULL AND v_variant_id IS NULL))
        FOR UPDATE;

        -- Create inventory record if doesn't exist
        IF inv_id IS NULL THEN
            INSERT INTO branch_inventory (branch_id, product_id, variant_id, quantity_on_hand)
            VALUES (p_branch_id, v_prod_id, v_variant_id, 0)
            RETURNING id, quantity_on_hand INTO inv_id, current_qty;
        END IF;

        -- Validate sufficient stock before sale
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

    -- Insert payments
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
