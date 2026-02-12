-- Fix markup percentages by calculating from cost price vs selling price
-- Formula: markup_percentage = ((selling_price - cost_price) / cost_price) * 100

-- First, let's see the current state
SELECT
    code,
    name,
    latest_cogs,
    current_selling_price,
    markup_percentage as old_markup,
    CASE
        WHEN latest_cogs > 0 THEN
            ROUND(((current_selling_price - latest_cogs) / latest_cogs * 100)::numeric, 2)
        ELSE 0
    END as calculated_markup
FROM products
WHERE latest_cogs > 0
ORDER BY code
LIMIT 20;

-- Update all products with correct markup percentage
UPDATE products
SET markup_percentage = CASE
    WHEN latest_cogs > 0 THEN
        ROUND(((current_selling_price - latest_cogs) / latest_cogs * 100)::numeric, 2)
    ELSE 0
END
WHERE latest_cogs > 0;

-- Verify the update
SELECT
    COUNT(*) as total_products,
    COUNT(*) FILTER (WHERE markup_percentage > 0) as products_with_markup,
    ROUND(AVG(markup_percentage)::numeric, 2) as avg_markup,
    ROUND(MIN(markup_percentage)::numeric, 2) as min_markup,
    ROUND(MAX(markup_percentage)::numeric, 2) as max_markup
FROM products
WHERE latest_cogs > 0;
