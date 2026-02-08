const fs = require('fs')
const path = require('path')

// Read the JSON file
const jsonPath = path.join(__dirname, '../../construction_materials.json')
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))

let sql = `-- Seed data for SYD Construction Supplies
-- Run this in Supabase SQL Editor

-- First, insert the default branch
INSERT INTO branches (code, name, address)
VALUES ('MAIN', 'SYD Construction Supplies - Main', 'Main Branch Address')
ON CONFLICT (code) DO NOTHING;

-- Insert units of measure
INSERT INTO units_of_measure (code, name, description) VALUES
    ('PC', 'Piece', 'Individual piece or unit'),
    ('BOX', 'Box', 'Box or carton'),
    ('BAG', 'Bag', 'Bag or sack'),
    ('KG', 'Kilogram', 'Weight in kilograms'),
    ('LB', 'Pound', 'Weight in pounds'),
    ('M', 'Meter', 'Length in meters'),
    ('FT', 'Foot', 'Length in feet'),
    ('SQM', 'Square Meter', 'Area in square meters'),
    ('SQFT', 'Square Foot', 'Area in square feet'),
    ('L', 'Liter', 'Volume in liters'),
    ('GAL', 'Gallon', 'Volume in gallons'),
    ('ROLL', 'Roll', 'Roll or spool'),
    ('SHEET', 'Sheet', 'Single sheet'),
    ('PAIR', 'Pair', 'Pair of items'),
    ('SET', 'Set', 'Complete set'),
    ('PAIL', 'Pail', 'Pail or bucket'),
    ('PACK', 'Pack', 'Package or pack'),
    ('BUNDLE', 'Bundle', 'Bundle of items'),
    ('LENGTH', 'Length', 'Standard length (varies by product)'),
    ('CAN', 'Can', 'Can or container'),
    ('TUBE', 'Tube', 'Tube or cartridge'),
    ('JAR', 'Jar', 'Jar or container'),
    ('SACK', 'Sack', 'Sack or bag'),
    ('CU.M', 'Cubic Meter', 'Volume in cubic meters')
ON CONFLICT (code) DO NOTHING;

-- Insert default customer
INSERT INTO customers (name, customer_type, is_active)
VALUES ('Walk-in Customer', 'cash', TRUE)
ON CONFLICT DO NOTHING;

`

// Collect unique categories
const categories = [...new Set(data.inventory.map(c => c.category))]

sql += `-- Insert categories\n`
categories.forEach(cat => {
  const escaped = cat.replace(/'/g, "''")
  sql += `INSERT INTO product_categories (name, description) VALUES ('${escaped}', '${escaped} products') ON CONFLICT (name) DO NOTHING;\n`
})

sql += `\n-- Now insert products\n`
sql += `DO $$\n`
sql += `DECLARE\n`
sql += `  v_category_id UUID;\n`
sql += `  v_uom_id UUID;\n`
sql += `BEGIN\n`

// Unit mappings
const unitMap = {
  'pcs': 'PC',
  'pc': 'PC',
  'piece': 'PC',
  'pieces': 'PC',
  'box': 'BOX',
  'boxes': 'BOX',
  'bag': 'BAG',
  'bags': 'BAG',
  'sack': 'SACK',
  'sacks': 'SACK',
  'kg': 'KG',
  'kilo': 'KG',
  'kilos': 'KG',
  'kilogram': 'KG',
  'm': 'M',
  'meter': 'M',
  'meters': 'M',
  'ft': 'FT',
  'foot': 'FT',
  'feet': 'FT',
  'roll': 'ROLL',
  'rolls': 'ROLL',
  'gallon': 'GAL',
  'gal': 'GAL',
  'liter': 'L',
  'liters': 'L',
  'l': 'L',
  'set': 'SET',
  'sets': 'SET',
  'pair': 'PAIR',
  'pairs': 'PAIR',
  'pack': 'PACK',
  'packs': 'PACK',
  'bundle': 'BUNDLE',
  'bundles': 'BUNDLE',
  'sheet': 'SHEET',
  'sheets': 'SHEET',
  'length': 'LENGTH',
  'lengths': 'LENGTH',
  'can': 'CAN',
  'cans': 'CAN',
  'pail': 'PAIL',
  'pails': 'PAIL',
  'tube': 'TUBE',
  'tubes': 'TUBE',
  'jar': 'JAR',
  'jars': 'JAR',
  'cu.m': 'CU.M',
  'cubic meter': 'CU.M',
}

data.inventory.forEach(categoryData => {
  const escapedCat = categoryData.category.replace(/'/g, "''")
  sql += `\n  -- Category: ${categoryData.category}\n`
  sql += `  SELECT id INTO v_category_id FROM product_categories WHERE name = '${escapedCat}';\n`

  categoryData.items.forEach(item => {
    const unitLower = item.unit.toLowerCase()
    const mappedUnit = unitMap[unitLower] || 'PC'
    const escapedCode = item.item_code.replace(/'/g, "''")
    const escapedName = item.description.replace(/'/g, "''")
    const reorderPoint = Math.floor(item.default_quantity * 0.2)

    sql += `  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = '${mappedUnit}';\n`
    sql += `  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)\n`
    sql += `  VALUES ('${escapedCode}', '${escapedName}', v_category_id, v_uom_id, v_uom_id, ${item.cost_price}, ${item.markup_percent}, ${item.selling_price}, ${reorderPoint}, ${item.default_quantity})\n`
    sql += `  ON CONFLICT (code) DO NOTHING;\n`
  })
})

sql += `END $$;\n`

sql += `\n-- Verify counts\n`
sql += `SELECT 'branches' as table_name, COUNT(*) as count FROM branches\n`
sql += `UNION ALL SELECT 'categories', COUNT(*) FROM product_categories\n`
sql += `UNION ALL SELECT 'units', COUNT(*) FROM units_of_measure\n`
sql += `UNION ALL SELECT 'products', COUNT(*) FROM products\n`
sql += `UNION ALL SELECT 'customers', COUNT(*) FROM customers;\n`

// Write to file
const outputPath = path.join(__dirname, '../supabase/seed_data.sql')
fs.writeFileSync(outputPath, sql)
console.log(`Generated ${outputPath}`)
console.log(`Categories: ${categories.length}`)
console.log(`Products: ${data.inventory.reduce((sum, c) => sum + c.items.length, 0)}`)
