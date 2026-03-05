-- ============================================================================
-- Migration 00030: Atomic Purchase Order Receiving RPC
-- ============================================================================
-- Creates atomic RPC for receiving purchase orders with:
-- - Row-level locking to prevent race conditions
-- - Unit conversion support
-- - Automatic inventory updates
-- - Movement tracking
-- - PO status management
--
-- This replaces the trigger-based approach with an explicit RPC for better
-- control and atomicity.
-- ============================================================================

CREATE OR REPLACE FUNCTION receive_purchase_order_atomic(
    p_po_id UUID,
    p_received_lines JSONB,  -- [{ po_line_id, quantity_received }]
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_po_branch UUID;
    v_po_status TEXT;
    v_line JSONB;
    v_po_line_id UUID;
    v_qty_received DECIMAL(12, 4);
    
    -- PO line details
    v_product_id UUID;
    v_variant_id UUID;
    v_uom_id UUID;
    v_qty_ordered DECIMAL(12, 4);
    v_qty_already_received DECIMAL(12, 4);
    v_new_qty_received DECIMAL(12, 4);
    
    -- Product details
    v_product_name TEXT;
    v_base_uom UUID;
    v_selling_uom UUID;
    v_conversion_factor DECIMAL(12, 4);
    v_unit_conversion_factor DECIMAL(12, 4);
    v_base_unit_qty DECIMAL(12, 4);
    
    -- Inventory
    v_inv_id UUID;
    v_current_qty DECIMAL(12, 4);
    
    -- Summary
    v_lines_updated INT := 0;
    v_total_qty_received DECIMAL(12, 4) := 0;
BEGIN
    -- Validate PO exists and get details
    SELECT branch_id, status
    INTO v_po_branch, v_po_status
    FROM purchase_orders
    WHERE id = p_po_id
      AND is_deleted = false;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase order not found or deleted: %', p_po_id
            USING ERRCODE = 'no_data_found';
    END IF;
    
    -- Can't receive from cancelled PO
    IF v_po_status = 'cancelled' THEN
        RAISE EXCEPTION 'Cannot receive from cancelled purchase order'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;
    
    -- Process each line
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_received_lines) LOOP
        v_po_line_id := (v_line->>'po_line_id')::UUID;
        v_qty_received := (v_line->>'quantity_received')::DECIMAL;
        
        -- Validate quantity
        IF v_qty_received <= 0 THEN
            RAISE EXCEPTION 'Quantity received must be greater than zero'
                USING ERRCODE = 'invalid_parameter_value';
        END IF;
        
        -- Get PO line details with lock
        SELECT 
            product_id, variant_id, uom_id,
            quantity_ordered, quantity_received
        INTO 
            v_product_id, v_variant_id, v_uom_id,
            v_qty_ordered, v_qty_already_received
        FROM purchase_order_lines
        WHERE id = v_po_line_id
          AND po_id = p_po_id
        FOR UPDATE;  -- Lock to prevent concurrent receiving
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'PO line not found: %', v_po_line_id
                USING ERRCODE = 'no_data_found';
        END IF;
        
        -- Calculate new total received
        v_new_qty_received := COALESCE(v_qty_already_received, 0) + v_qty_received;
        
        -- Validate not receiving more than ordered
        IF v_new_qty_received > v_qty_ordered THEN
            RAISE EXCEPTION 'Cannot receive more than ordered. Ordered: %, Already received: %, Trying to receive: %',
                v_qty_ordered, v_qty_already_received, v_qty_received
                USING ERRCODE = 'check_violation';
        END IF;
        
        -- Get product details for conversion
        SELECT base_uom_id, selling_uom_id, conversion_factor, name
        INTO v_base_uom, v_selling_uom, v_conversion_factor, v_product_name
        FROM products
        WHERE id = v_product_id
          AND is_active = true;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product not found or inactive: %', v_product_id
                USING ERRCODE = 'no_data_found';
        END IF;
        
        -- ═══════════════════════════════════════════════════════════════════
        -- Convert to base units
        -- ═══════════════════════════════════════════════════════════════════
        v_unit_conversion_factor := NULL;
        
        IF v_uom_id = v_base_uom THEN
            v_base_unit_qty := v_qty_received;
        ELSE
            -- Try product_selling_units first
            SELECT conversion_factor INTO v_unit_conversion_factor
            FROM product_selling_units
            WHERE product_id = v_product_id
              AND uom_id = v_uom_id
              AND is_active = true
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
        
        -- ═══════════════════════════════════════════════════════════════════
        -- Update PO line
        -- ═══════════════════════════════════════════════════════════════════
        UPDATE purchase_order_lines
        SET quantity_received = v_new_qty_received,
            updated_at = NOW()
        WHERE id = v_po_line_id;
        
        -- ═══════════════════════════════════════════════════════════════════
        -- Update inventory with locking
        -- ═══════════════════════════════════════════════════════════════════
        SELECT id, quantity_on_hand INTO v_inv_id, v_current_qty
        FROM branch_inventory
        WHERE branch_id = v_po_branch
          AND product_id = v_product_id
          AND (variant_id = v_variant_id OR (variant_id IS NULL AND v_variant_id IS NULL))
        FOR UPDATE;  -- Lock inventory row
        
        IF v_inv_id IS NULL THEN
            -- Create inventory record
            INSERT INTO branch_inventory (
                branch_id, product_id, variant_id, 
                quantity_on_hand, last_movement_at
            )
            VALUES (
                v_po_branch, v_product_id, v_variant_id,
                v_base_unit_qty, NOW()
            )
            RETURNING id INTO v_inv_id;
            v_current_qty := 0;
        ELSE
            -- Update existing inventory
            v_current_qty := COALESCE(v_current_qty, 0);
            UPDATE branch_inventory
            SET quantity_on_hand = quantity_on_hand + v_base_unit_qty,
                last_movement_at = NOW()
            WHERE id = v_inv_id;
        END IF;
        
        -- ═══════════════════════════════════════════════════════════════════
        -- Record inventory movement
        -- ═══════════════════════════════════════════════════════════════════
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
                    THEN ' (conversion: ' || v_unit_conversion_factor || ', base units: ' || ROUND(v_base_unit_qty, 4) || ')'
                    ELSE ''
                END,
                v_product_name
            )
        );
        
        v_lines_updated := v_lines_updated + 1;
        v_total_qty_received := v_total_qty_received + v_base_unit_qty;
    END LOOP;
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- Update PO status based on completion
    -- ═══════════════════════════════════════════════════════════════════════
    DECLARE
        v_all_received BOOLEAN;
    BEGIN
        -- Check if all lines are fully received
        SELECT NOT EXISTS (
            SELECT 1 FROM purchase_order_lines
            WHERE po_id = p_po_id
              AND quantity_received < quantity_ordered
        ) INTO v_all_received;
        
        IF v_all_received THEN
            UPDATE purchase_orders
            SET status = 'received',
                updated_at = NOW()
            WHERE id = p_po_id;
        ELSE
            -- Partially received
            UPDATE purchase_orders
            SET status = 'partial',
                updated_at = NOW()
            WHERE id = p_po_id
              AND status NOT IN ('received', 'partial');
        END IF;
    END;
    
    -- Return summary
    RETURN jsonb_build_object(
        'success', true,
        'po_id', p_po_id,
        'lines_updated', v_lines_updated,
        'total_quantity_received', v_total_qty_received,
        'po_status', (SELECT status FROM purchase_orders WHERE id = p_po_id)
    );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION receive_purchase_order_atomic TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION receive_purchase_order_atomic IS 
    'Atomically receives purchase order lines with unit conversion, locking, and automatic inventory updates. Prevents concurrent receiving issues and over-receiving.';

-- ============================================================================
-- Helper function: Get PO receiving status
-- ============================================================================
CREATE OR REPLACE FUNCTION get_po_receiving_status(p_po_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'po_id', po.id,
        'po_number', po.po_number,
        'status', po.status,
        'total_lines', COUNT(pol.id),
        'fully_received_lines', COUNT(pol.id) FILTER (WHERE pol.quantity_received >= pol.quantity_ordered),
        'partially_received_lines', COUNT(pol.id) FILTER (WHERE pol.quantity_received > 0 AND pol.quantity_received < pol.quantity_ordered),
        'pending_lines', COUNT(pol.id) FILTER (WHERE pol.quantity_received = 0 OR pol.quantity_received IS NULL),
        'total_ordered', SUM(pol.quantity_ordered),
        'total_received', SUM(COALESCE(pol.quantity_received, 0)),
        'lines', jsonb_agg(
            jsonb_build_object(
                'line_id', pol.id,
                'product_id', pol.product_id,
                'product_name', p.name,
                'quantity_ordered', pol.quantity_ordered,
                'quantity_received', COALESCE(pol.quantity_received, 0),
                'quantity_pending', pol.quantity_ordered - COALESCE(pol.quantity_received, 0),
                'uom', uom.code,
                'is_complete', pol.quantity_received >= pol.quantity_ordered
            ) ORDER BY pol.line_number
        )
    )
    INTO v_result
    FROM purchase_orders po
    JOIN purchase_order_lines pol ON pol.po_id = po.id
    JOIN products p ON p.id = pol.product_id
    JOIN units_of_measure uom ON uom.id = pol.uom_id
    WHERE po.id = p_po_id
      AND po.is_deleted = false
    GROUP BY po.id;
    
    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_po_receiving_status TO authenticated;

COMMENT ON FUNCTION get_po_receiving_status IS 
    'Returns detailed receiving status for a purchase order including line-by-line breakdown.';
