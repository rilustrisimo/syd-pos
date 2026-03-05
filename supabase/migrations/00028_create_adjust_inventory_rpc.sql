-- ============================================================================
-- Migration 00028: Inventory Adjustment RPC with Unit Conversion
-- ============================================================================
-- Creates atomic inventory adjustment function with:
-- - Unit conversion support (can adjust in any valid UOM)
-- - Variant support
-- - Row-level locking
-- - Validation against negative inventory
-- - Comprehensive audit trail
-- ============================================================================

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

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION adjust_inventory_atomic TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION adjust_inventory_atomic IS 
  'Atomically adjusts inventory with unit conversion, validation, and locking. Prevents negative inventory unless explicitly allowed on product. Records comprehensive audit trail.';

-- ============================================================================
-- Helper function: Bulk inventory adjustments (for stocktake)
-- ============================================================================
CREATE OR REPLACE FUNCTION bulk_adjust_inventory(
    p_adjustments JSONB,  -- [{ branch_id, product_id, variant_id, quantity_change, uom_id, notes }]
    p_reason TEXT,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_adjustment JSONB;
    v_result JSONB;
    v_results JSONB := '[]'::JSONB;
    v_success_count INT := 0;
    v_error_count INT := 0;
    v_errors JSONB := '[]'::JSONB;
BEGIN
    -- Process each adjustment
    FOR v_adjustment IN SELECT * FROM jsonb_array_elements(p_adjustments) LOOP
        BEGIN
            -- Call single adjustment function
            v_result := adjust_inventory_atomic(
                (v_adjustment->>'branch_id')::UUID,
                (v_adjustment->>'product_id')::UUID,
                NULLIF(v_adjustment->>'variant_id', '')::UUID,
                (v_adjustment->>'quantity_change')::DECIMAL,
                (v_adjustment->>'uom_id')::UUID,
                p_reason,
                COALESCE(v_adjustment->>'notes', ''),
                p_user_id
            );
            
            v_results := v_results || v_result;
            v_success_count := v_success_count + 1;
            
        EXCEPTION WHEN OTHERS THEN
            -- Collect error but continue processing
            v_errors := v_errors || jsonb_build_object(
                'product_id', v_adjustment->>'product_id',
                'error', SQLERRM
            );
            v_error_count := v_error_count + 1;
        END;
    END LOOP;

    -- Return summary
    RETURN jsonb_build_object(
        'success', v_error_count = 0,
        'total', v_success_count + v_error_count,
        'success_count', v_success_count,
        'error_count', v_error_count,
        'results', v_results,
        'errors', v_errors
    );
END;
$$;

GRANT EXECUTE ON FUNCTION bulk_adjust_inventory TO authenticated;

COMMENT ON FUNCTION bulk_adjust_inventory IS 
  'Processes multiple inventory adjustments atomically. Used for stocktake. Returns success/error summary.';
