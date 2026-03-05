-- ============================================================================
-- Migration 00027: Add Stock Validation and Row-Level Locking
-- ============================================================================
-- This migration enhances inventory operations to prevent:
-- 1. Race conditions (concurrent sales of same product)
-- 2. Overselling (selling more than available)
-- 3. Negative inventory (except when explicitly allowed)
--
-- Changes:
-- - Add FOR UPDATE locking to all inventory queries
-- - Add stock validation before sales
-- - Add allow_negative_inventory flag to products
-- - Update all triggers to use locking
-- ============================================================================

-- STEP 1: Add allow_negative_inventory flag to products
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS allow_negative_inventory BOOLEAN DEFAULT false;

COMMENT ON COLUMN products.allow_negative_inventory IS 
  'When true, allows selling beyond available stock. Useful for made-to-order or special products.';

-- STEP 2: Update create_transaction_atomic with stock validation and locking
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
    p_lines              JSONB,
    p_payments           JSONB
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

        -- Resolve base-unit quantity (conversion logic)
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

        -- ═══════════════════════════════════════════════════════════════════
        -- CRITICAL: Lock inventory row to prevent race conditions
        -- ═══════════════════════════════════════════════════════════════════
        SELECT id, quantity_on_hand INTO inv_id, current_qty
        FROM branch_inventory
        WHERE branch_id  = p_branch_id
          AND product_id = v_prod_id
          AND (variant_id = v_variant_id OR (variant_id IS NULL AND v_variant_id IS NULL))
        FOR UPDATE;  -- ← Row-level lock prevents concurrent modifications

        -- Create inventory record if doesn't exist
        IF inv_id IS NULL THEN
            INSERT INTO branch_inventory (branch_id, product_id, variant_id, quantity_on_hand)
            VALUES (p_branch_id, v_prod_id, v_variant_id, 0)
            RETURNING id, quantity_on_hand INTO inv_id, current_qty;
        END IF;

        -- ═══════════════════════════════════════════════════════════════════
        -- CRITICAL: Validate sufficient stock before sale
        -- ═══════════════════════════════════════════════════════════════════
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

            -- Deduct inventory
            UPDATE branch_inventory
            SET quantity_on_hand = quantity_on_hand - base_unit_qty,
                last_movement_at = NOW()
            WHERE id = inv_id;

            -- Record movement
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
            -- Add inventory back
            UPDATE branch_inventory
            SET quantity_on_hand = quantity_on_hand + base_unit_qty,
                last_movement_at = NOW()
            WHERE id = inv_id;

            -- Record movement
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

    -- Return the saved transaction
    RETURN (SELECT to_jsonb(t.*) FROM transactions t WHERE t.id = v_txn_id);
END;
$$;

-- STEP 3: Update purchase order receiving trigger with FOR UPDATE locking
CREATE OR REPLACE FUNCTION update_inventory_on_receive()
RETURNS TRIGGER AS $$
DECLARE
    inv_id UUID;
    current_qty DECIMAL(12, 4);
    po_branch UUID;
    base_unit_qty DECIMAL(12, 4);
    qty_change DECIMAL(12, 4);
    p_base_uom UUID;
    p_selling_uom UUID;
    p_conversion_factor DECIMAL(12, 4);
    unit_conversion_factor DECIMAL(12, 4);
BEGIN
    -- Only process when quantity received increases
    IF NEW.quantity_received > OLD.quantity_received THEN
        qty_change := NEW.quantity_received - OLD.quantity_received;
        
        -- Get the PO branch
        SELECT branch_id INTO po_branch
        FROM purchase_orders
        WHERE id = NEW.po_id;

        -- Get product's unit information
        SELECT base_uom_id, selling_uom_id, conversion_factor
        INTO p_base_uom, p_selling_uom, p_conversion_factor
        FROM products
        WHERE id = NEW.product_id;

        -- Determine conversion factor
        IF NEW.uom_id = p_base_uom THEN
            base_unit_qty := qty_change;
        ELSE
            SELECT conversion_factor INTO unit_conversion_factor
            FROM product_selling_units
            WHERE product_id = NEW.product_id
              AND uom_id = NEW.uom_id
              AND is_active = true
            LIMIT 1;

            IF unit_conversion_factor IS NOT NULL AND unit_conversion_factor > 0 THEN
                base_unit_qty := qty_change / unit_conversion_factor;
            ELSIF NEW.uom_id = p_selling_uom AND p_conversion_factor > 0 THEN
                base_unit_qty := qty_change / p_conversion_factor;
            ELSE
                base_unit_qty := qty_change;
            END IF;
        END IF;

        -- ═══════════════════════════════════════════════════════════════════
        -- CRITICAL: Lock inventory row before updating
        -- ═══════════════════════════════════════════════════════════════════
        SELECT id, quantity_on_hand INTO inv_id, current_qty
        FROM branch_inventory
        WHERE branch_id = po_branch
          AND product_id = NEW.product_id
          AND (variant_id = NEW.variant_id OR (variant_id IS NULL AND NEW.variant_id IS NULL))
        FOR UPDATE;  -- ← Row-level lock

        IF inv_id IS NULL THEN
            INSERT INTO branch_inventory (branch_id, product_id, variant_id, quantity_on_hand, last_movement_at)
            VALUES (po_branch, NEW.product_id, NEW.variant_id, base_unit_qty, NOW())
            RETURNING id INTO inv_id;
            current_qty := 0;
        ELSE
            current_qty := COALESCE(current_qty, 0);
            UPDATE branch_inventory
            SET quantity_on_hand = quantity_on_hand + base_unit_qty,
                last_movement_at = NOW()
            WHERE id = inv_id;
        END IF;

        -- Record inventory movement
        INSERT INTO inventory_movements (
            branch_id, product_id, variant_id, movement_type,
            quantity_change, quantity_before, quantity_after,
            reference_id, reference_type, created_by, notes
        ) VALUES (
            po_branch, NEW.product_id, NEW.variant_id, 'purchase',
            base_unit_qty, 
            current_qty, 
            current_qty + base_unit_qty,
            NEW.po_id, 'purchase_order', auth.uid(),
            CASE 
                WHEN NEW.uom_id != p_base_uom AND unit_conversion_factor IS NOT NULL
                THEN 'Received ' || qty_change || ' units (conversion: ' || unit_conversion_factor || '), added ' || ROUND(base_unit_qty, 4) || ' base units'
                ELSE NULL
            END
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- STEP 4: Update soft delete reversal trigger with FOR UPDATE locking
CREATE OR REPLACE FUNCTION reverse_transaction_inventory()
RETURNS TRIGGER AS $$
DECLARE
    line RECORD;
    inv_id UUID;
    current_qty DECIMAL(12, 4);
    base_unit_qty DECIMAL(12, 4);
    p_base_uom UUID;
    p_selling_uom UUID;
    p_conversion_factor DECIMAL(12, 4);
    unit_conversion_factor DECIMAL(12, 4);
BEGIN
    -- Only process when is_deleted changes from false to true
    IF NEW.is_deleted = true AND OLD.is_deleted = false THEN
        -- Get all lines for this transaction
        FOR line IN
            SELECT tl.*, NEW.branch_id, NEW.transaction_type
            FROM transaction_lines tl
            WHERE tl.transaction_id = NEW.id
        LOOP
            -- Get product's unit information
            SELECT base_uom_id, selling_uom_id, conversion_factor
            INTO p_base_uom, p_selling_uom, p_conversion_factor
            FROM products
            WHERE id = line.product_id;

            -- Determine conversion factor
            IF line.uom_id = p_base_uom THEN
                base_unit_qty := line.quantity;
            ELSE
                SELECT conversion_factor INTO unit_conversion_factor
                FROM product_selling_units
                WHERE product_id = line.product_id
                  AND uom_id = line.uom_id
                  AND is_active = true
                LIMIT 1;

                IF unit_conversion_factor IS NOT NULL AND unit_conversion_factor > 0 THEN
                    base_unit_qty := line.quantity / unit_conversion_factor;
                ELSIF line.uom_id = p_selling_uom AND p_conversion_factor > 0 THEN
                    base_unit_qty := line.quantity / p_conversion_factor;
                ELSE
                    base_unit_qty := line.quantity;
                END IF;
            END IF;

            -- ═══════════════════════════════════════════════════════════════
            -- CRITICAL: Lock inventory row before updating
            -- ═══════════════════════════════════════════════════════════════
            SELECT id, quantity_on_hand INTO inv_id, current_qty
            FROM branch_inventory
            WHERE branch_id = NEW.branch_id
              AND product_id = line.product_id
              AND (variant_id = line.variant_id OR (variant_id IS NULL AND line.variant_id IS NULL))
            FOR UPDATE;  -- ← Row-level lock

            IF inv_id IS NULL THEN
                -- Create inventory record if doesn't exist
                INSERT INTO branch_inventory (branch_id, product_id, variant_id, quantity_on_hand)
                VALUES (NEW.branch_id, line.product_id, line.variant_id, 0)
                RETURNING id, quantity_on_hand INTO inv_id, current_qty;
            END IF;

            -- Reverse inventory based on original transaction type
            IF NEW.transaction_type = 'sale' THEN
                -- Sale was deleted: ADD inventory back
                UPDATE branch_inventory
                SET quantity_on_hand = quantity_on_hand + base_unit_qty,
                    last_movement_at = NOW()
                WHERE id = inv_id;

                -- Record reversal movement
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
                -- Return was deleted: REMOVE inventory
                UPDATE branch_inventory
                SET quantity_on_hand = quantity_on_hand - base_unit_qty,
                    last_movement_at = NOW()
                WHERE id = inv_id;

                -- Record reversal movement
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
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- STEP 5: Add comments
COMMENT ON COLUMN products.allow_negative_inventory IS 
  'Allows selling beyond available stock. Use for made-to-order products or when stockouts should not block sales.';

COMMENT ON FUNCTION create_transaction_atomic IS 
  'Creates transaction atomically with stock validation and row-level locking to prevent overselling and race conditions.';

COMMENT ON FUNCTION update_inventory_on_receive IS 
  'Updates inventory when PO lines are received. Uses row-level locking to prevent concurrent modification issues.';

COMMENT ON FUNCTION reverse_transaction_inventory IS 
  'Reverses inventory movements when transactions are soft-deleted. Uses row-level locking for consistency.';
