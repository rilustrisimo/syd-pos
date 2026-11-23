-- Migration 00109: Wire inventory lots into the existing stock functions
--
-- Each function below is its latest version, unchanged except for the
-- lots_private.* calls marked "Lots" (see 00108):
--   create_transaction_atomic        (from 00063)  sale → consume lots
--   deliver_government_sale          (from 00063)  delivery → consume lots
--   create_return_transaction_atomic (from 00106)  return → match to the sale
--   reverse_transaction_inventory    (from 00106)  delete → undo lots
--   adjust_inventory_atomic          (from 00028)  +lot / store-first write-off
--   receive_purchase_order_atomic    (from 00056)  receive → new lot; new
--                                                 optional p_investment_tags
-- Then creates opening lots for all current stock (store-owned).

-- receive_purchase_order_atomic gains a parameter: drop the old signature
-- so PostgREST doesn't see two candidates.
DROP FUNCTION IF EXISTS receive_purchase_order_atomic(UUID, JSONB, UUID, DATE);

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

            -- Lots: take the sold units from the oldest lots (00108).
            PERFORM lots_private.consume(v_txn_id, v_line_id, p_branch_id, v_prod_id, v_variant_id, base_unit_qty);

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

            -- Lots: a return made through this function has no original sale
            -- to match, so the units come back as a store-owned lot.
            PERFORM lots_private.add_lot(p_branch_id, v_prod_id, v_variant_id, base_unit_qty,
                (SELECT latest_cogs FROM products WHERE id = v_prod_id), 'return',
                NULL, NULL, now(), 'Return ' || v_txn_number);
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

        -- Lots: take the delivered units from the oldest lots (00108).
        PERFORM lots_private.consume(p_transaction_id, v_line.id, v_txn.branch_id,
                                     v_line.product_id, v_line.variant_id, base_unit_qty);
    END LOOP;

    RETURN (SELECT to_jsonb(t.*) FROM transactions t WHERE t.id = p_transaction_id);
END;
$$;

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
    v_ret_line_id           UUID;
BEGIN

    -- ─────────────────────────────────────────────────────────────────────
    -- 1. Validate original transaction
    -- ─────────────────────────────────────────────────────────────────────
    SELECT transaction_number INTO v_original_txn_number
    FROM transactions
    WHERE id = p_original_transaction_id
      AND is_deleted = false;

    IF v_original_txn_number IS NULL THEN
        RAISE EXCEPTION 'Original transaction % not found or is deleted', p_original_transaction_id;
    END IF;

    -- ─────────────────────────────────────────────────────────────────────
    -- 2. Generate return transaction number
    -- ─────────────────────────────────────────────────────────────────────
    SELECT 'RTN-' ||
           TO_CHAR(COALESCE(p_transaction_date, NOW()), 'YYYYMMDD') || '-' ||
           LPAD(
               (COALESCE(
                   (SELECT MAX(
                       CASE
                           WHEN transaction_number ~ '^RTN-[0-9]{8}-[0-9]+$'
                           THEN SUBSTRING(transaction_number FROM 'RTN-[0-9]{8}-([0-9]+)')::INT
                           ELSE 0
                       END
                   )
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
        'Return for ' || v_original_txn_number ||
            CASE WHEN p_reason IS NOT NULL THEN ' | ' || p_reason ELSE '' END ||
            CASE WHEN p_notes  IS NOT NULL THEN ' | ' || p_notes  ELSE '' END,
        p_created_by,
        COALESCE(p_transaction_date, NOW()),
        p_original_transaction_id
    )
    RETURNING id INTO v_return_id;

    -- ─────────────────────────────────────────────────────────────────────
    -- 4. Insert transaction lines (with inventory restocking)
    -- ─────────────────────────────────────────────────────────────────────
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        v_prod_id       := (v_line->>'product_id')::UUID;
        v_variant_id    := (v_line->>'variant_id')::UUID;
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
        -- FIXED: Cast v_return_reason::return_reason to match column type
        INSERT INTO transaction_lines (
            transaction_id, line_number, product_id, variant_id,
            quantity, uom_id, unit_price, cogs_per_unit, discount_amount,
            should_restock, return_reason, notes
        ) VALUES (
            v_return_id, v_line_num, v_prod_id, v_variant_id,
            v_quantity, v_uom_id, v_unit_price, v_cogs_per_unit, 0,
            v_should_restock, v_return_reason::return_reason,
            'Reason: ' || COALESCE(v_return_reason, 'customer_request')
        )
        RETURNING id INTO v_ret_line_id;

        v_line_num := v_line_num + 1;

        -- ── Convert quantity to base units ───────────────────────────────
        SELECT base_uom_id, selling_uom_id, conversion_factor
        INTO v_base_uom, v_selling_uom, v_prod_conv
        FROM products WHERE id = v_prod_id;

        -- Same conversion as sales (create_transaction_atomic): selling units
        -- per base unit, so DIVIDE. (00036 multiplied, which restocked e.g.
        -- 968 boxes for 22 PC of a 44-PC box instead of 0.5.)
        v_unit_conv := NULL;
        IF v_uom_id = v_base_uom THEN
            v_base_qty := v_quantity;
        ELSE
            SELECT conversion_factor INTO v_unit_conv
            FROM product_selling_units
            WHERE product_id = v_prod_id AND uom_id = v_uom_id AND is_active = true
            LIMIT 1;

            IF v_unit_conv IS NOT NULL AND v_unit_conv > 0 THEN
                v_base_qty := v_quantity / v_unit_conv;
            ELSIF v_uom_id = v_selling_uom AND v_prod_conv > 0 THEN
                v_base_qty := v_quantity / v_prod_conv;
            ELSE
                v_base_qty := v_quantity;
            END IF;
        END IF;

        -- ── Get or create inventory record ───────────────────────────────
        v_inv_id := NULL;
        SELECT id, quantity_on_hand
        INTO v_inv_id, v_current_qty
        FROM branch_inventory
        WHERE branch_id = p_branch_id
          AND product_id = v_prod_id
          AND (v_variant_id IS NULL AND variant_id IS NULL OR variant_id = v_variant_id)
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
                'Restocked from ' || v_return_number || ' | Reason: ' || COALESCE(v_return_reason, 'customer_request')
            );
        ELSE
            -- Not restocking (damaged/expired/defective/quality_issue) - record movement but don't add to inventory
            INSERT INTO inventory_movements (
                branch_id, product_id, variant_id,
                movement_type, quantity_change, quantity_before, quantity_after,
                reference_id, reference_type, created_by, notes
            ) VALUES (
                p_branch_id, v_prod_id, v_variant_id,
                'damaged_return',
                0,  -- No change to inventory
                v_current_qty,
                v_current_qty,  -- Same quantity
                v_return_id, 'transaction', p_created_by,
                'Not restocked from ' || v_return_number ||
                    CASE WHEN v_return_reason IS NOT NULL
                        THEN ' | Reason: ' || v_return_reason
                        ELSE ''
                    END
            );
        END IF;

        -- Lots: match the returned units to the original sale (00108).
        -- Restocked units go back to the same lot/owner; damaged ones don't.
        PERFORM lots_private.return_restore(v_return_id, v_ret_line_id, p_original_transaction_id,
            p_branch_id, v_prod_id, v_variant_id, v_base_qty, v_should_restock);

    END LOOP;

    -- ─────────────────────────────────────────────────────────────────────
    -- 5. Insert refund payment
    -- ─────────────────────────────────────────────────────────────────────
    IF p_refund_amount > 0 THEN
        INSERT INTO transaction_payments (
            transaction_id, payment_method, amount, reference_number, created_by
        ) VALUES (
            v_return_id,
            p_refund_method::payment_method,  -- Cast to payment_method enum
            -p_refund_amount,  -- Negative amount for refund
            p_refund_reference,
            p_created_by
        );
    END IF;

    -- ─────────────────────────────────────────────────────────────────────
    -- 6. Update customer outstanding balance (if credit customer)
    -- ─────────────────────────────────────────────────────────────────────
    IF p_customer_id IS NOT NULL THEN
        SELECT outstanding_balance > 0 INTO v_had_credit
        FROM customers WHERE id = p_customer_id;

        IF v_had_credit THEN
            UPDATE customers
            SET outstanding_balance = GREATEST(0, COALESCE(outstanding_balance, 0) - p_refund_amount)
            WHERE id = p_customer_id;
        END IF;
    END IF;

    -- ─────────────────────────────────────────────────────────────────────
    -- 7. Return created transaction as JSON
    -- ─────────────────────────────────────────────────────────────────────
    RETURN (SELECT to_jsonb(t.*) FROM transactions t WHERE t.id = v_return_id);

END;
$$;

CREATE OR REPLACE FUNCTION reverse_transaction_inventory()
RETURNS TRIGGER AS $$
DECLARE
    line                   RECORD;
    inv_id                 UUID;
    current_qty            DECIMAL(12, 4);
    base_unit_qty          DECIMAL(12, 4);
    p_base_uom             UUID;
    p_selling_uom          UUID;
    p_conversion_factor    DECIMAL(12, 4);
    unit_conversion_factor DECIMAL(12, 4);
BEGIN
    IF NEW.is_deleted = true AND OLD.is_deleted = false THEN

        -- Government sale that was never delivered: inventory was never moved,
        -- so there is nothing to reverse.
        IF COALESCE(NEW.is_government_sale, FALSE) = TRUE
           AND COALESCE(NEW.is_delivered,    FALSE) = FALSE THEN
            RETURN NEW;
        END IF;

        FOR line IN
            SELECT tl.*, NEW.branch_id, NEW.transaction_type
            FROM transaction_lines tl
            WHERE tl.transaction_id = NEW.id
              -- A return line that was never restocked (damaged etc.) added
              -- no stock, so deleting the return must not remove any.
              AND NOT (NEW.transaction_type = 'return' AND COALESCE(tl.should_restock, true) = false)
        LOOP
            unit_conversion_factor := NULL;
            inv_id := NULL;
            SELECT base_uom_id, selling_uom_id, conversion_factor
            INTO p_base_uom, p_selling_uom, p_conversion_factor
            FROM products
            WHERE id = line.product_id;

            IF line.uom_id = p_base_uom THEN
                base_unit_qty := line.quantity;
            ELSE
                SELECT conversion_factor INTO unit_conversion_factor
                FROM product_selling_units
                WHERE product_id = line.product_id
                  AND uom_id     = line.uom_id
                  AND is_active  = true
                LIMIT 1;

                IF unit_conversion_factor IS NOT NULL AND unit_conversion_factor > 0 THEN
                    base_unit_qty := line.quantity / unit_conversion_factor;
                ELSIF line.uom_id = p_selling_uom AND p_conversion_factor > 0 THEN
                    base_unit_qty := line.quantity / p_conversion_factor;
                ELSE
                    base_unit_qty := line.quantity;
                END IF;
            END IF;

            SELECT id, quantity_on_hand INTO inv_id, current_qty
            FROM branch_inventory
            WHERE branch_id  = NEW.branch_id
              AND product_id = line.product_id
              AND (variant_id = line.variant_id OR (variant_id IS NULL AND line.variant_id IS NULL))
            FOR UPDATE;

            IF inv_id IS NULL THEN
                INSERT INTO branch_inventory (branch_id, product_id, variant_id, quantity_on_hand)
                VALUES (NEW.branch_id, line.product_id, line.variant_id, 0)
                RETURNING id, quantity_on_hand INTO inv_id, current_qty;
            END IF;

            IF NEW.transaction_type = 'sale' THEN
                UPDATE branch_inventory
                SET quantity_on_hand = quantity_on_hand + base_unit_qty,
                    last_movement_at = NOW()
                WHERE id = inv_id;

                INSERT INTO inventory_movements (
                    branch_id, product_id, variant_id, movement_type,
                    quantity_change, quantity_before, quantity_after,
                    reference_id, reference_type, created_by, notes
                ) VALUES (
                    NEW.branch_id, line.product_id, line.variant_id, 'adjustment',
                    base_unit_qty, current_qty, current_qty + base_unit_qty,
                    NEW.id, 'transaction_reversal', NEW.deleted_by,
                    'Reversed deleted sale: ' || NEW.transaction_number ||
                    CASE
                        WHEN line.uom_id != p_base_uom AND unit_conversion_factor IS NOT NULL
                        THEN ' (' || line.quantity || ' units = ' || ROUND(base_unit_qty, 4) || ' base units)'
                        ELSE ''
                    END
                );

            ELSIF NEW.transaction_type = 'return' THEN
                UPDATE branch_inventory
                SET quantity_on_hand = quantity_on_hand - base_unit_qty,
                    last_movement_at = NOW()
                WHERE id = inv_id;

                INSERT INTO inventory_movements (
                    branch_id, product_id, variant_id, movement_type,
                    quantity_change, quantity_before, quantity_after,
                    reference_id, reference_type, created_by, notes
                ) VALUES (
                    NEW.branch_id, line.product_id, line.variant_id, 'adjustment',
                    -base_unit_qty, current_qty, current_qty - base_unit_qty,
                    NEW.id, 'transaction_reversal', NEW.deleted_by,
                    'Reversed deleted return: ' || NEW.transaction_number ||
                    CASE
                        WHEN line.uom_id != p_base_uom AND unit_conversion_factor IS NOT NULL
                        THEN ' (' || line.quantity || ' units = ' || ROUND(base_unit_qty, 4) || ' base units)'
                        ELSE ''
                    END
                );
            END IF;

        END LOOP;

        -- Lots: undo what the sale or return did to lots (00108).
        IF NEW.transaction_type = 'sale' THEN
            PERFORM lots_private.reverse_sale(NEW.id, NEW.deleted_by);
        ELSIF NEW.transaction_type = 'return' THEN
            PERFORM lots_private.reverse_return(NEW.id, NEW.deleted_by);
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION adjust_inventory_atomic(
    p_branch_id      UUID,
    p_product_id     UUID,
    p_variant_id     UUID,
    p_quantity_change DECIMAL(12, 4),
    p_uom_id         UUID,
    p_reason         TEXT,
    p_notes          TEXT,
    p_user_id        UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    inv_id               UUID;
    current_qty          DECIMAL(12, 4);
    base_unit_change     DECIMAL(12, 4);
    new_qty              DECIMAL(12, 4);
    p_base_uom           UUID;
    p_selling_uom        UUID;
    p_conv               DECIMAL(12, 4);
    unit_conv            DECIMAL(12, 4);
    v_allow_negative     BOOLEAN;
    v_product_name       TEXT;
    v_adjustment_notes   TEXT;
BEGIN
    -- Validate reason
    IF p_reason IS NULL OR p_reason = '' THEN
        RAISE EXCEPTION 'Adjustment reason is required'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Get product information
    SELECT base_uom_id, selling_uom_id, conversion_factor, allow_negative_inventory, name
    INTO p_base_uom, p_selling_uom, p_conv, v_allow_negative, v_product_name
    FROM products 
    WHERE id = p_product_id
      AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not found or inactive: %', p_product_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- Convert adjustment quantity to base units
    unit_conv := NULL;

    IF p_uom_id = p_base_uom THEN
        base_unit_change := p_quantity_change;
    ELSE
        -- Try product_selling_units first
        SELECT conversion_factor INTO unit_conv
        FROM product_selling_units
        WHERE product_id = p_product_id
          AND uom_id     = p_uom_id
          AND is_active  = true
        LIMIT 1;

        IF unit_conv IS NOT NULL AND unit_conv > 0 THEN
            base_unit_change := p_quantity_change / unit_conv;
        ELSIF p_uom_id = p_selling_uom AND p_conv > 0 THEN
            base_unit_change := p_quantity_change / p_conv;
        ELSE
            RAISE EXCEPTION 'Invalid UOM for product "%". No conversion factor found.', v_product_name
                USING ERRCODE = 'invalid_parameter_value',
                      HINT = 'Use the base UOM or add a conversion factor for this UOM.';
        END IF;
    END IF;

    -- Build adjustment notes with conversion info
    IF unit_conv IS NOT NULL AND p_uom_id != p_base_uom THEN
        v_adjustment_notes := format(
            '%s | Adjusted %s units (conv: %s) = %s base units',
            p_notes,
            p_quantity_change,
            unit_conv,
            ROUND(base_unit_change, 4)
        );
    ELSE
        v_adjustment_notes := p_notes;
    END IF;

    -- ═══════════════════════════════════════════════════════════════════════
    -- CRITICAL: Lock inventory row to prevent race conditions
    -- ═══════════════════════════════════════════════════════════════════════
    SELECT id, quantity_on_hand INTO inv_id, current_qty
    FROM branch_inventory
    WHERE branch_id  = p_branch_id
      AND product_id = p_product_id
      AND (variant_id = p_variant_id OR (variant_id IS NULL AND p_variant_id IS NULL))
    FOR UPDATE;  -- ← Row-level lock

    -- Create inventory record if doesn't exist
    IF inv_id IS NULL THEN
        INSERT INTO branch_inventory (
            branch_id, 
            product_id, 
            variant_id, 
            quantity_on_hand,
            last_movement_at
        )
        VALUES (
            p_branch_id, 
            p_product_id, 
            p_variant_id, 
            0,
            NOW()
        )
        RETURNING id, quantity_on_hand INTO inv_id, current_qty;
    END IF;

    -- Calculate new quantity
    new_qty := current_qty + base_unit_change;

    -- ═══════════════════════════════════════════════════════════════════════
    -- CRITICAL: Validate against negative inventory
    -- ═══════════════════════════════════════════════════════════════════════
    IF new_qty < 0 AND v_allow_negative = false THEN
        RAISE EXCEPTION 'Adjustment would result in negative inventory for product "%". Current: % base units, Adjustment: % base units, Result would be: % base units', 
            v_product_name,
            ROUND(current_qty, 4),
            ROUND(base_unit_change, 4),
            ROUND(new_qty, 4)
            USING ERRCODE = 'check_violation',
                  HINT = 'Enable "allow_negative_inventory" on this product to override.';
    END IF;

    -- Update inventory
    UPDATE branch_inventory
    SET quantity_on_hand = new_qty,
        last_movement_at = NOW()
    WHERE id = inv_id;

    -- Record movement
    INSERT INTO inventory_movements (
        branch_id,
        product_id,
        variant_id,
        movement_type,
        quantity_change,
        quantity_before,
        quantity_after,
        reference_type,
        created_by,
        notes
    ) VALUES (
        p_branch_id,
        p_product_id,
        p_variant_id,
        'adjustment',
        base_unit_change,
        current_qty,
        new_qty,
        'manual_adjustment',
        p_user_id,
        format('Reason: %s | %s', p_reason, v_adjustment_notes)
    );

    -- Lots (00108): added stock becomes a store-owned lot at the current
    -- cost; removed stock comes out of store-owned units first.
    IF base_unit_change > 0 THEN
        PERFORM lots_private.add_lot(p_branch_id, p_product_id, p_variant_id, base_unit_change,
            (SELECT latest_cogs FROM products WHERE id = p_product_id), 'adjustment',
            NULL, NULL, now(), 'Adjustment: ' || p_reason);
    ELSIF base_unit_change < 0 THEN
        PERFORM lots_private.trim(p_branch_id, p_product_id, p_variant_id,
            p_reason, 'manual_adjustment', inv_id, p_user_id);
    END IF;

    -- Return updated inventory
    RETURN jsonb_build_object(
        'success', true,
        'inventory_id', inv_id,
        'product_id', p_product_id,
        'variant_id', p_variant_id,
        'quantity_before', current_qty,
        'quantity_after', new_qty,
        'quantity_change', base_unit_change,
        'adjustment_in_uom', p_quantity_change,
        'notes', v_adjustment_notes
    );
END;
$$;

CREATE OR REPLACE FUNCTION receive_purchase_order_atomic(
    p_po_id          UUID,
    p_received_lines JSONB,         -- [{ po_line_id, quantity_received }]
    p_user_id        UUID,
    p_receive_date   DATE DEFAULT NULL, -- actual delivery date (NULL = today)
    -- Optional: [{ po_line_id, investment_id, quantity }] — quantity in the
    -- PO line's unit. Admin only. Tags part of what's received to investments.
    p_investment_tags JSONB DEFAULT NULL
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
    v_lot_id            UUID;
    v_tag               JSONB;
    v_tag_qty           DECIMAL(12, 4);
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

        -- Lots (00108): this delivery becomes a lot, costed per base unit.
        v_lot_id := lots_private.add_lot(
            v_po_branch, v_product_id, v_variant_id, v_base_unit_qty,
            v_effective_unit_cost * v_qty_received / NULLIF(v_base_unit_qty, 0),
            'po', p_po_id, v_po_line_id,
            CASE WHEN p_receive_date IS NULL OR p_receive_date >= CURRENT_DATE THEN now()
                 ELSE p_receive_date::timestamptz + INTERVAL '12 hours' END,
            NULL);

        -- Optional investment tags for this line
        FOR v_tag IN
            SELECT value FROM jsonb_array_elements(COALESCE(p_investment_tags, '[]'::jsonb))
            WHERE (value->>'po_line_id')::UUID = v_po_line_id
        LOOP
            PERFORM lots_private.assert_admin();
            v_tag_qty := (v_tag->>'quantity')::DECIMAL;
            IF v_tag_qty IS NULL OR v_tag_qty <= 0 THEN
                CONTINUE;
            END IF;
            IF v_tag_qty > v_qty_received THEN
                RAISE EXCEPTION 'Cannot tag more than received for "%" (received %, tagging %)',
                    v_product_name, v_qty_received, v_tag_qty
                    USING ERRCODE = 'check_violation';
            END IF;
            PERFORM lots_private.tag(
                (v_tag->>'investment_id')::UUID, v_lot_id,
                v_tag_qty * v_base_unit_qty / v_qty_received,   -- to base units
                p_user_id, 'Tagged at receiving');
        END LOOP;

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

GRANT EXECUTE ON FUNCTION create_transaction_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION deliver_government_sale TO authenticated;
GRANT EXECUTE ON FUNCTION create_return_transaction_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION adjust_inventory_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION receive_purchase_order_atomic(UUID, JSONB, UUID, DATE, JSONB) TO authenticated;

-- ── Opening lots: all current stock, store-owned, at today's cost ─────────────
INSERT INTO inventory_lots (branch_id, product_id, variant_id, source, received_at,
                            unit_cost, qty_received, qty_remaining, notes)
SELECT bi.branch_id, bi.product_id, bi.variant_id, 'opening', now(),
       COALESCE(p.latest_cogs, 0), bi.quantity_on_hand, bi.quantity_on_hand,
       'Opening stock when lots were introduced'
FROM branch_inventory bi
JOIN products p ON p.id = bi.product_id
WHERE bi.quantity_on_hand > 0
  AND NOT EXISTS (
    SELECT 1 FROM inventory_lots l
    WHERE l.branch_id = bi.branch_id AND l.product_id = bi.product_id
      AND l.variant_id IS NOT DISTINCT FROM bi.variant_id
  );
