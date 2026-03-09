-- Diagnostic: Find all products with inflated COGS due to conversion factor bug
-- Shows products where base_uom = selling_uom but COGS was multiplied by conversion_factor

SELECT 
  p.code,
  p.name,
  p.latest_cogs as correct_cogs,
  p.base_unit_cost,
  p.conversion_factor,
  bu.code as base_uom,
  su.code as selling_uom,
  -- Count affected transactions
  (
    SELECT COUNT(DISTINCT tl.transaction_id)
    FROM transaction_lines tl
    WHERE tl.product_id = p.id
    AND ABS(tl.cogs_per_unit - (p.latest_cogs * p.conversion_factor)) < 0.01
  ) as affected_transactions,
  -- Show sample bad COGS values
  (
    SELECT json_agg(
      json_build_object(
        'txn', sub.transaction_number,
        'date', sub.transaction_date,
        'qty', sub.quantity,
        'bad_cogs', sub.cogs_per_unit,
        'should_be', p.latest_cogs,
        'profit', sub.line_profit
      )
    )
    FROM (
      SELECT 
        t.transaction_number,
        t.transaction_date,
        tl.quantity,
        tl.cogs_per_unit,
        tl.line_profit
      FROM transaction_lines tl
      JOIN transactions t ON tl.transaction_id = t.id
      WHERE tl.product_id = p.id
      AND ABS(tl.cogs_per_unit - (p.latest_cogs * p.conversion_factor)) < 0.01
      ORDER BY t.transaction_date DESC
      LIMIT 3
    ) sub
  ) as sample_transactions
FROM products p
LEFT JOIN units_of_measure bu ON p.base_uom_id = bu.id
LEFT JOIN units_of_measure su ON p.selling_uom_id = su.id
WHERE p.base_uom_id = p.selling_uom_id 
  AND p.conversion_factor != 1
  AND EXISTS (
    SELECT 1 
    FROM transaction_lines tl
    WHERE tl.product_id = p.id
    AND ABS(tl.cogs_per_unit - (p.latest_cogs * p.conversion_factor)) < 0.01
  )
ORDER BY p.name;
