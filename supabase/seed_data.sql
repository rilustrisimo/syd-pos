-- Seed data for SYD Construction Supplies
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

-- Insert categories
INSERT INTO product_categories (name, description) VALUES ('Roofing Materials', 'Roofing Materials products') ON CONFLICT (name) DO NOTHING;
INSERT INTO product_categories (name, description) VALUES ('Sealants & Finishing', 'Sealants & Finishing products') ON CONFLICT (name) DO NOTHING;
INSERT INTO product_categories (name, description) VALUES ('Nails', 'Nails products') ON CONFLICT (name) DO NOTHING;
INSERT INTO product_categories (name, description) VALUES ('Steel Bars / Reinforcement', 'Steel Bars / Reinforcement products') ON CONFLICT (name) DO NOTHING;
INSERT INTO product_categories (name, description) VALUES ('Steel Sections & Framing', 'Steel Sections & Framing products') ON CONFLICT (name) DO NOTHING;
INSERT INTO product_categories (name, description) VALUES ('Metal Framing & Roofing Accessories', 'Metal Framing & Roofing Accessories products') ON CONFLICT (name) DO NOTHING;
INSERT INTO product_categories (name, description) VALUES ('Wood & Boards', 'Wood & Boards products') ON CONFLICT (name) DO NOTHING;
INSERT INTO product_categories (name, description) VALUES ('Cement & Masonry', 'Cement & Masonry products') ON CONFLICT (name) DO NOTHING;
INSERT INTO product_categories (name, description) VALUES ('Aggregates & Fill Materials', 'Aggregates & Fill Materials products') ON CONFLICT (name) DO NOTHING;
INSERT INTO product_categories (name, description) VALUES ('Plumbing Materials - G.I. Pipes', 'Plumbing Materials - G.I. Pipes products') ON CONFLICT (name) DO NOTHING;
INSERT INTO product_categories (name, description) VALUES ('Plumbing Materials - PVC Pipes', 'Plumbing Materials - PVC Pipes products') ON CONFLICT (name) DO NOTHING;
INSERT INTO product_categories (name, description) VALUES ('PVC Fittings - Elbows', 'PVC Fittings - Elbows products') ON CONFLICT (name) DO NOTHING;
INSERT INTO product_categories (name, description) VALUES ('PVC Fittings - P-Traps', 'PVC Fittings - P-Traps products') ON CONFLICT (name) DO NOTHING;
INSERT INTO product_categories (name, description) VALUES ('PVC Fittings - WYE', 'PVC Fittings - WYE products') ON CONFLICT (name) DO NOTHING;
INSERT INTO product_categories (name, description) VALUES ('PVC Fittings - Couplings', 'PVC Fittings - Couplings products') ON CONFLICT (name) DO NOTHING;
INSERT INTO product_categories (name, description) VALUES ('PVC Fittings - Reducers', 'PVC Fittings - Reducers products') ON CONFLICT (name) DO NOTHING;
INSERT INTO product_categories (name, description) VALUES ('Miscellaneous & Tools', 'Miscellaneous & Tools products') ON CONFLICT (name) DO NOTHING;
INSERT INTO product_categories (name, description) VALUES ('Coco Lumber', 'Coco Lumber products') ON CONFLICT (name) DO NOTHING;
INSERT INTO product_categories (name, description) VALUES ('Bottles', 'Bottles products') ON CONFLICT (name) DO NOTHING;
INSERT INTO product_categories (name, description) VALUES ('Steel', 'Steel products') ON CONFLICT (name) DO NOTHING;
INSERT INTO product_categories (name, description) VALUES ('Tarpaulin', 'Tarpaulin products') ON CONFLICT (name) DO NOTHING;
INSERT INTO product_categories (name, description) VALUES ('Fasteners', 'Fasteners products') ON CONFLICT (name) DO NOTHING;
INSERT INTO product_categories (name, description) VALUES ('Paint Brush', 'Paint Brush products') ON CONFLICT (name) DO NOTHING;
INSERT INTO product_categories (name, description) VALUES ('Tools', 'Tools products') ON CONFLICT (name) DO NOTHING;
INSERT INTO product_categories (name, description) VALUES ('Tape', 'Tape products') ON CONFLICT (name) DO NOTHING;
INSERT INTO product_categories (name, description) VALUES ('Electrical', 'Electrical products') ON CONFLICT (name) DO NOTHING;
INSERT INTO product_categories (name, description) VALUES ('Adhesives', 'Adhesives products') ON CONFLICT (name) DO NOTHING;
INSERT INTO product_categories (name, description) VALUES ('Hardware', 'Hardware products') ON CONFLICT (name) DO NOTHING;
INSERT INTO product_categories (name, description) VALUES ('Plumbing', 'Plumbing products') ON CONFLICT (name) DO NOTHING;

-- Now insert products
DO $$
DECLARE
  v_category_id UUID;
  v_uom_id UUID;
BEGIN

  -- Category: Roofing Materials
  SELECT id INTO v_category_id FROM product_categories WHERE name = 'Roofing Materials';
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('GI-24X8', 'G.I. Sheet 24 × 8', v_category_id, v_uom_id, v_uom_id, 176, 36.36, 240, 20, 100)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('GI-24X10', 'G.I. Sheet 24 × 10', v_category_id, v_uom_id, v_uom_id, 220, 36.36, 300, 20, 100)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('GI-24X6', 'G.I. Sheet 24 × 6', v_category_id, v_uom_id, v_uom_id, 162, 14.2, 185, 20, 100)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('GI-24X12', 'G.I. Sheet 24 × 12', v_category_id, v_uom_id, v_uom_id, 264, 21.21, 320, 20, 100)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('GI-22X8', 'G.I. Sheet 22 × 8', v_category_id, v_uom_id, v_uom_id, 160, 93.75, 310, 20, 100)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('GI-22X10', 'G.I. Sheet 22 × 10', v_category_id, v_uom_id, v_uom_id, 200, 95, 390, 20, 100)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('GI-22X6', 'G.I. Sheet 22 × 6', v_category_id, v_uom_id, v_uom_id, 178, 32.02, 235, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('GI-22X12', 'G.I. Sheet 22 × 12', v_category_id, v_uom_id, v_uom_id, 240, 95.83, 470, 20, 100)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PLAIN-G24', 'Plain Sheet Gauge 24', v_category_id, v_uom_id, v_uom_id, 176, 59.09, 280, 20, 100)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PLAIN-G22', 'Plain Sheet Gauge 22', v_category_id, v_uom_id, v_uom_id, 160, 118.75, 350, 20, 100)
  ON CONFLICT (code) DO NOTHING;

  -- Category: Sealants & Finishing
  SELECT id INTO v_category_id FROM product_categories WHERE name = 'Sealants & Finishing';
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PAIL';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('SEAL-ISL', 'Sealing Coat / Skim Coat (Island)', v_category_id, v_uom_id, v_uom_id, 403, 20.35, 485, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'BAG';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('TILE-GROUT', 'Tile Grout', v_category_id, v_uom_id, v_uom_id, 180, 38.89, 250, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('VULCA-SEAL-75ML', 'Vulca Seal 75 ml Jr.', v_category_id, v_uom_id, v_uom_id, 57, 49.12, 85, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('SUNSHIELD-SIL-300ML', 'SUNSHIELD Silicone Sealant Neutral Cure Clear 300ml', v_category_id, v_uom_id, v_uom_id, 135, 70.37, 230, 4, 20)
  ON CONFLICT (code) DO NOTHING;

  -- Category: Nails
  SELECT id INTO v_category_id FROM product_categories WHERE name = 'Nails';
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'BOX';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('CN-2', 'Common Nails #2', v_category_id, v_uom_id, v_uom_id, 970, 55.67, 1510, 1, 5)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'BOX';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('CN-2.5', 'Common Nails #2½', v_category_id, v_uom_id, v_uom_id, 970, 55.67, 1510, 1, 5)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'BOX';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('CN-3', 'Common Nails #3', v_category_id, v_uom_id, v_uom_id, 910, 70.33, 1550, 1, 5)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'BOX';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('CN-1', 'Common Nails #1', v_category_id, v_uom_id, v_uom_id, 1100, 48.18, 1630, 1, 5)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'BOX';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('CN-1.5', 'Common Nails #1½', v_category_id, v_uom_id, v_uom_id, 1030, 58.25, 1630, 1, 5)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'BOX';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('CN-4', 'Common Nails #4', v_category_id, v_uom_id, v_uom_id, 880, 70.45, 1500, 1, 5)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'BOX';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('UMB-NAIL-2.5', 'Umbrella Nails #2 1/2', v_category_id, v_uom_id, v_uom_id, 1250, -13.73, 1078, 2, 10)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'BOX';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('FLAT-NAIL', 'Flat Head Nails', v_category_id, v_uom_id, v_uom_id, 900, 27.78, 1150, 1, 5)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'BOX';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('CONCN-2', 'Concrete Nails #2', v_category_id, v_uom_id, v_uom_id, 1500, 21, 1815, 0, 2)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'BOX';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('CONCN-2.5', 'Concrete Nails #2½', v_category_id, v_uom_id, v_uom_id, 1395, 30.11, 1815, 0, 2)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'BOX';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('CONCN-3', 'Concrete Nails #3', v_category_id, v_uom_id, v_uom_id, 1500, 21, 1815, 0, 2)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'BOX';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('CONCN-1', 'Concrete Nails #1', v_category_id, v_uom_id, v_uom_id, 1395, 30.11, 1815, 0, 2)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'BOX';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('CONCN-1.5', 'Concrete Nails #1½', v_category_id, v_uom_id, v_uom_id, 1395, 30.11, 1815, 0, 2)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'BOX';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('CONCN-4', 'Concrete Nails #4', v_category_id, v_uom_id, v_uom_id, 1395, 30.11, 1815, 0, 2)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'BOX';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('HARDI-NAIL', 'Hardiflex Nails', v_category_id, v_uom_id, v_uom_id, 1450, -17.24, 1200, 1, 5)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'KG';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('FIN-NAIL-1', 'Finishing Nail #1', v_category_id, v_uom_id, v_uom_id, 47.4, 26.58, 60, 5, 25)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'KG';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('FIN-NAIL-2', 'Finishing Nail #2', v_category_id, v_uom_id, v_uom_id, 42.6, 29.11, 55, 5, 25)
  ON CONFLICT (code) DO NOTHING;

  -- Category: Steel Bars / Reinforcement
  SELECT id INTO v_category_id FROM product_categories WHERE name = 'Steel Bars / Reinforcement';
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('REBAR-10MM', 'Rebar 10 mm', v_category_id, v_uom_id, v_uom_id, 124, 20.97, 150, 40, 200)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('REBAR-12MM', 'Rebar 12 mm', v_category_id, v_uom_id, v_uom_id, 179, 14.53, 205, 40, 200)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('REBAR-8MM', 'Rebar 8 mm', v_category_id, v_uom_id, v_uom_id, 86, -6.98, 80, 20, 100)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('REBAR-9MM', 'Rebar 9 mm', v_category_id, v_uom_id, v_uom_id, 94, 1.06, 95, 20, 100)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('REBAR-16MM', 'Rebar 16 mm', v_category_id, v_uom_id, v_uom_id, 318, 17.92, 375, 40, 200)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('RNDBAR-10MM', 'Round Bar 10 mm', v_category_id, v_uom_id, v_uom_id, 103.75, 44.58, 150, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('RNDBAR-12MM', 'Round Bar 12 mm', v_category_id, v_uom_id, v_uom_id, 162, 32.72, 215, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('RNDBAR-14MM', 'Round Bar 14 mm', v_category_id, v_uom_id, v_uom_id, 250, 56, 390, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('SQBAR-10MM', 'Square Bar 10 mm', v_category_id, v_uom_id, v_uom_id, 96.25, 55.84, 150, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('SQBAR-12MM', 'Square Bar 12 mm', v_category_id, v_uom_id, v_uom_id, 121, 28.1, 155, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('SQBAR-14MM', 'Square Bar 14 mm', v_category_id, v_uom_id, v_uom_id, 199.2, 23, 245, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('FLAT-316-1', 'Flat Bar 3/16" × 1"', v_category_id, v_uom_id, v_uom_id, 148, 35.14, 200, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('FLAT-316-15', 'Flat Bar 3/16" × 1½"', v_category_id, v_uom_id, v_uom_id, 390, 12.82, 440, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('FLAT-316-2', 'Flat Bar 3/16" × 2"', v_category_id, v_uom_id, v_uom_id, 500, 30, 650, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('FLAT-14-1', 'Flat Bar 1/4" × 1"', v_category_id, v_uom_id, v_uom_id, 220, -9.09, 200, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('FLAT-14-15', 'Flat Bar 1/4" × 1½"', v_category_id, v_uom_id, v_uom_id, 430, 30, 559, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('FLAT-14-2', 'Flat Bar 1/4" × 2"', v_category_id, v_uom_id, v_uom_id, 442, 80.41, 797, 10, 50)
  ON CONFLICT (code) DO NOTHING;

  -- Category: Steel Sections & Framing
  SELECT id INTO v_category_id FROM product_categories WHERE name = 'Steel Sections & Framing';
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'LENGTH';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('RT-1X1-15', 'Rectangular Tube 1" × 1" × 1.5 mm', v_category_id, v_uom_id, v_uom_id, 235, 36.17, 320, 6, 30)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'LENGTH';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('RT-1X2-15', 'Rectangular Tube 1" × 2" × 1.5 mm', v_category_id, v_uom_id, v_uom_id, 384, 19.79, 460, 6, 30)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'LENGTH';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('RT-2X2-15', 'Rectangular Tube 2" × 2" × 1.5 mm', v_category_id, v_uom_id, v_uom_id, 485, 20.62, 585, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'LENGTH';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('RT-1X3-15', 'Rectangular Tube 1" × 3" × 1.5 mm', v_category_id, v_uom_id, v_uom_id, 470, 20.21, 565, 6, 30)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'LENGTH';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('ANG-316-1-25', 'Angle Bar 3/16" × 1" × 2.5 mm', v_category_id, v_uom_id, v_uom_id, 223, -6.34, 310, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'LENGTH';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('ANG-316-15-25', 'Angle Bar 3/16" × 1½" × 2.5 mm', v_category_id, v_uom_id, v_uom_id, 317, -9.47, 430, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'LENGTH';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('RT-15X15-15', 'Rectangular Tube 1½" × 1½" × 1.5 mm', v_category_id, v_uom_id, v_uom_id, 350, 28.57, 450, 6, 30)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'LENGTH';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('RT-2X3-15', 'Rectangular Tube 2" × 3" × 1.5 mm', v_category_id, v_uom_id, v_uom_id, 590, 52.54, 900, 6, 30)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'LENGTH';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('RT-2X4-15', 'Rectangular Tube 2" × 4" × 1.5 mm', v_category_id, v_uom_id, v_uom_id, 725, 58.62, 1150, 6, 30)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'LENGTH';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('ANG-316-2-25', 'Angle Bar 3/16" × 2" × 2.5 mm', v_category_id, v_uom_id, v_uom_id, 420, -7.82, 589, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'LENGTH';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('ANG-14-1-35', 'Angle Bar 1/4" × 1" × 3.5 mm', v_category_id, v_uom_id, v_uom_id, 307, 38.44, 425, 6, 30)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'LENGTH';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('ANG-14-15-35', 'Angle Bar 1/4" × 1½" × 3.5 mm', v_category_id, v_uom_id, v_uom_id, 430, 23.26, 530, 6, 30)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'LENGTH';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('ANG-14-2-35', 'Angle Bar 1/4" × 2" × 3.5 mm', v_category_id, v_uom_id, v_uom_id, 562.65, 59.07, 895, 6, 30)
  ON CONFLICT (code) DO NOTHING;

  -- Category: Metal Framing & Roofing Accessories
  SELECT id INTO v_category_id FROM product_categories WHERE name = 'Metal Framing & Roofing Accessories';
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('MFUR-1X2', 'Metal Furring 1"x2" / Double Furring 19mm x 50mm x 5m', v_category_id, v_uom_id, v_uom_id, 107, 26.17, 135, 20, 100)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('MSTUD-2X3', 'Metal Stud 2" × 3"', v_category_id, v_uom_id, v_uom_id, 131, -27.48, 95, 20, 100)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('MTRACK-2X3', 'Metal Track 2" × 3"', v_category_id, v_uom_id, v_uom_id, 120, -20.83, 95, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('CPURL-2X3-15', 'C-Purlins 2" × 3" × 1.5 mm', v_category_id, v_uom_id, v_uom_id, 430, 47.67, 635, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('CPURL-2X4-15', 'C-Purlins 2" × 4" × 1.5 mm', v_category_id, v_uom_id, v_uom_id, 650, 13.85, 740, 10, 50)
  ON CONFLICT (code) DO NOTHING;

  -- Category: Wood & Boards
  SELECT id INTO v_category_id FROM product_categories WHERE name = 'Wood & Boards';
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'SHEET';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PLY-ORD-14', 'Ordinary Plywood 1/4"', v_category_id, v_uom_id, v_uom_id, 300, 40, 420, 25, 125)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'SHEET';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PLY-ORD-12', 'Ordinary Plywood 1/2"', v_category_id, v_uom_id, v_uom_id, 505, 48.51, 750, 25, 125)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'SHEET';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PLY-MAR-14', 'Marine Plywood 1/4"', v_category_id, v_uom_id, v_uom_id, 330, 34.85, 445, 25, 125)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'SHEET';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PLY-MAR-12', 'Marine Plywood 1/2"', v_category_id, v_uom_id, v_uom_id, 660, 28.79, 850, 25, 125)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'SHEET';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PLY-ORD-34', 'Ordinary Plywood 3/4"', v_category_id, v_uom_id, v_uom_id, 820, 52.44, 1250, 14, 70)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'SHEET';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PLY-MAR-34', 'Marine Plywood 3/4"', v_category_id, v_uom_id, v_uom_id, 1120, 18.75, 1330, 14, 70)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('FCB-45MM', 'Fiber Cement Board 4.5 mm (1/4")', v_category_id, v_uom_id, v_uom_id, 330, 81.82, 600, 6, 30)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('FCB-35MM', 'Fiber Cement Board 3.5 mm (3/16")', v_category_id, v_uom_id, v_uom_id, 255, 96.08, 500, 6, 30)
  ON CONFLICT (code) DO NOTHING;

  -- Category: Cement & Masonry
  SELECT id INTO v_category_id FROM product_categories WHERE name = 'Cement & Masonry';
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'BAG';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('CEM-KB', 'Kapit Bahay Masonry Cement', v_category_id, v_uom_id, v_uom_id, 125, 24, 155, 132, 660)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'BAG';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('CEM-REP', 'Republic Portland Cement', v_category_id, v_uom_id, v_uom_id, 160, 28.13, 205, 132, 660)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'BAG';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('CEM-HOL', 'Holcim Cement', v_category_id, v_uom_id, v_uom_id, 205, 27.27, 261, 0, 0)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'BAG';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('CEM-UNI', 'Union Cement', v_category_id, v_uom_id, v_uom_id, 195, 29.03, 252, 0, 0)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('HBC-4', 'Hollow Blocks 4"', v_category_id, v_uom_id, v_uom_id, 11, 26.32, 12, 100, 500)
  ON CONFLICT (code) DO NOTHING;

  -- Category: Aggregates & Fill Materials
  SELECT id INTO v_category_id FROM product_categories WHERE name = 'Aggregates & Fill Materials';
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'CU.M';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('SAND-WASH', 'Sand (Washed)', v_category_id, v_uom_id, v_uom_id, 550, 23.53, 1050, 2, 10)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'CU.M';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('SAND-SCREEN', 'Sand (Screened)', v_category_id, v_uom_id, v_uom_id, 550, 23.53, 1050, 2, 10)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'CU.M';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('GRAVEL-34', 'Gravel 3/4"', v_category_id, v_uom_id, v_uom_id, 550, 21.05, 1150, 2, 10)
  ON CONFLICT (code) DO NOTHING;

  -- Category: Plumbing Materials - G.I. Pipes
  SELECT id INTO v_category_id FROM product_categories WHERE name = 'Plumbing Materials - G.I. Pipes';
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'LENGTH';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('GIP-12-S30', 'G.I. Pipe 1/2" (S30 China)', v_category_id, v_uom_id, v_uom_id, 147.29, 49.38, 220, 4, 20)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'LENGTH';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('GIP-34-S30', 'G.I. Pipe 3/4" (S30 China)', v_category_id, v_uom_id, v_uom_id, 205, 41.46, 290, 4, 20)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'LENGTH';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('GIP-1-S30', 'G.I. Pipe 1" (S30 China)', v_category_id, v_uom_id, v_uom_id, 263.1, 36.84, 360, 4, 20)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'LENGTH';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('GIP-15-S30', 'G.I. Pipe 1½" (S30 China)', v_category_id, v_uom_id, v_uom_id, 438, 25.57, 550, 4, 20)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'LENGTH';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('GIP-2-S30', 'G.I. Pipe 2" (S30 China)', v_category_id, v_uom_id, v_uom_id, 633.64, 43.61, 910, 4, 20)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'LENGTH';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('GIP-3-S30', 'G.I. Pipe 3" (S30 China)', v_category_id, v_uom_id, v_uom_id, 1150.85, 52.06, 1750, 4, 20)
  ON CONFLICT (code) DO NOTHING;

  -- Category: Plumbing Materials - PVC Pipes
  SELECT id INTO v_category_id FROM product_categories WHERE name = 'Plumbing Materials - PVC Pipes';
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PVC-12', 'PVC Pipe 1/2" (Blue)', v_category_id, v_uom_id, v_uom_id, 68.5, 43.07, 98, 20, 100)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PVC-34', 'PVC Pipe 3/4" (Blue)', v_category_id, v_uom_id, v_uom_id, 83.7, 55.32, 130, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PVC-1', 'PVC Pipe 1" (Blue)', v_category_id, v_uom_id, v_uom_id, 114, 53.51, 175, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PVC-2-S500', 'PVC Sanitary Pipe 2" Orange (S500)', v_category_id, v_uom_id, v_uom_id, 63, 138.1, 150, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PVC-3-S500', 'PVC Sanitary Pipe 3" Orange (S500)', v_category_id, v_uom_id, v_uom_id, 136, 83.82, 250, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PVC-4-S500', 'PVC Sanitary Pipe 4" Orange (S500)', v_category_id, v_uom_id, v_uom_id, 182, 64.84, 300, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PVC-2-S600', 'PVC Sanitary Pipe 2" Orange (S600)', v_category_id, v_uom_id, v_uom_id, 138.67, 116.35, 300, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PVC-3-S600', 'PVC Sanitary Pipe 3" Orange (S600)', v_category_id, v_uom_id, v_uom_id, 359, 19.78, 430, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PVC-4-S600', 'PVC Sanitary Pipe 4" Orange (S600)', v_category_id, v_uom_id, v_uom_id, 478.21, 25.47, 600, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PVC-2-S1000', 'PVC Sanitary Pipe 2" Orange (S1000)', v_category_id, v_uom_id, v_uom_id, 294.42, 18.88, 350, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PVC-3-S1000', 'PVC Sanitary Pipe 3" Orange (S1000)', v_category_id, v_uom_id, v_uom_id, 505, 19.8, 605, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PVC-4-S1000', 'PVC Sanitary Pipe 4" Orange (S1000)', v_category_id, v_uom_id, v_uom_id, 640, 25, 800, 10, 50)
  ON CONFLICT (code) DO NOTHING;

  -- Category: PVC Fittings - Elbows
  SELECT id INTO v_category_id FROM product_categories WHERE name = 'PVC Fittings - Elbows';
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('ELB-12-PL', 'PVC Elbow 1/2" Plain (Blue)', v_category_id, v_uom_id, v_uom_id, 9.5, 57.89, 15, 20, 100)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('ELB-12-THR', 'PVC Elbow 1/2" Threaded (Blue)', v_category_id, v_uom_id, v_uom_id, 16, -6.25, 15, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('ELB-2-90', 'PVC Elbow 2" × 90° (Orange)', v_category_id, v_uom_id, v_uom_id, 9, 400, 45, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('ELB-3-90', 'PVC Elbow 3" × 90° (Orange)', v_category_id, v_uom_id, v_uom_id, 17, 282.35, 65, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('ELB-2-45', 'PVC Elbow 2" × 45° (Orange)', v_category_id, v_uom_id, v_uom_id, 7.5, 500, 45, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('ELB-4-90', 'PVC Elbow 4" × 90° (Orange)', v_category_id, v_uom_id, v_uom_id, 26, 303.85, 105, 10, 50)
  ON CONFLICT (code) DO NOTHING;

  -- Category: PVC Fittings - P-Traps
  SELECT id INTO v_category_id FROM product_categories WHERE name = 'PVC Fittings - P-Traps';
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PTRAP-2', 'P-Trap 2" (Orange)', v_category_id, v_uom_id, v_uom_id, 28, 96.43, 55, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PTRAP-3', 'P-Trap 3" (Orange)', v_category_id, v_uom_id, v_uom_id, 50, 50, 75, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PTRAP-4', 'P-Trap 4" (Orange)', v_category_id, v_uom_id, v_uom_id, 77, 23.38, 95, 10, 50)
  ON CONFLICT (code) DO NOTHING;

  -- Category: PVC Fittings - WYE
  SELECT id INTO v_category_id FROM product_categories WHERE name = 'PVC Fittings - WYE';
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('WYE-3X2', 'PVC WYE 3" × 2" (Orange)', v_category_id, v_uom_id, v_uom_id, 33, 66.67, 55, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('WYE-4X2', 'PVC WYE 4" × 2" (Orange)', v_category_id, v_uom_id, v_uom_id, 47, 59.57, 75, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('WYE-2X2', 'PVC WYE 2" × 2" (Orange)', v_category_id, v_uom_id, v_uom_id, 16, 150, 40, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('WYE-3X3', 'PVC WYE 3" × 3" (Orange)', v_category_id, v_uom_id, v_uom_id, 36, 80.56, 65, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('WYE-4X3', 'PVC WYE 4" × 3" (Orange)', v_category_id, v_uom_id, v_uom_id, 52, 63.46, 85, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('WYE-4X4', 'PVC WYE 4" × 4" (Orange)', v_category_id, v_uom_id, v_uom_id, 56, 69.64, 95, 10, 50)
  ON CONFLICT (code) DO NOTHING;

  -- Category: PVC Fittings - Couplings
  SELECT id INTO v_category_id FROM product_categories WHERE name = 'PVC Fittings - Couplings';
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('COUP-1', 'PVC Coupling 1" (Blue)', v_category_id, v_uom_id, v_uom_id, 9, 122.22, 20, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('COUP-2', 'PVC Coupling 2" (Orange)', v_category_id, v_uom_id, v_uom_id, 4.5, 611.11, 32, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('COUP-3', 'PVC Coupling 3" (Orange)', v_category_id, v_uom_id, v_uom_id, 9, 455.56, 50, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('COUP-15', 'PVC Coupling 1½" (Blue)', v_category_id, v_uom_id, v_uom_id, 18, 55.56, 28, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('COUP-4', 'PVC Coupling 4" (Orange)', v_category_id, v_uom_id, v_uom_id, 18, 261.11, 65, 10, 50)
  ON CONFLICT (code) DO NOTHING;

  -- Category: PVC Fittings - Reducers
  SELECT id INTO v_category_id FROM product_categories WHERE name = 'PVC Fittings - Reducers';
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('RED-3X2', 'PVC Reducer 3" × 2" (Orange)', v_category_id, v_uom_id, v_uom_id, 11, 309.09, 45, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('RED-4X2', 'PVC Reducer 4" × 2" (Orange)', v_category_id, v_uom_id, v_uom_id, 17, 241.18, 58, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('RED-4X3', 'PVC Reducer 4" × 3" (Orange)', v_category_id, v_uom_id, v_uom_id, 18, 233.33, 60, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('RED-12X34', 'PVC Reducer 1/2" × 3/4" (Blue)', v_category_id, v_uom_id, v_uom_id, 10.5, 71.43, 18, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('RED-12X1', 'PVC Reducer 1/2" × 1" (Blue)', v_category_id, v_uom_id, v_uom_id, 12, 66.67, 20, 10, 50)
  ON CONFLICT (code) DO NOTHING;

  -- Category: Miscellaneous & Tools
  SELECT id INTO v_category_id FROM product_categories WHERE name = 'Miscellaneous & Tools';
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'M';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('TIE-WIRE', 'Tie Wire #16', v_category_id, v_uom_id, v_uom_id, 42, 66.67, 70, 20, 100)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('SHOVEL-MTL', 'Pala (Shovel, metal)', v_category_id, v_uom_id, v_uom_id, 160, 56.25, 250, 2, 12)
  ON CONFLICT (code) DO NOTHING;

  -- Category: Coco Lumber
  SELECT id INTO v_category_id FROM product_categories WHERE name = 'Coco Lumber';
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('COCO-1X2X10', 'Coco Lumber 1x2x10', v_category_id, v_uom_id, v_uom_id, 34, 32.35, 45, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('COCO-2X3X10', 'Coco Lumber 2x3x10', v_category_id, v_uom_id, v_uom_id, 100, 20, 120, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('COCO-2X2X10', 'Coco Lumber 2x2x10', v_category_id, v_uom_id, v_uom_id, 67, 19.4, 80, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('COCO-2X4X10', 'Coco Lumber 2x4x10', v_category_id, v_uom_id, v_uom_id, 133, 20.3, 160, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('COCO-4X4X10', 'Coco Lumber 4x4x10', v_category_id, v_uom_id, v_uom_id, 267, 34.83, 360, 5, 25)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('COCO-4X4X12', 'Coco Lumber 4x4x12', v_category_id, v_uom_id, v_uom_id, 320, 35, 432, 5, 25)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('COCO-4X4X8', 'Coco Lumber 4x4x8', v_category_id, v_uom_id, v_uom_id, 245, 17.55, 288, 5, 25)
  ON CONFLICT (code) DO NOTHING;

  -- Category: Bottles
  SELECT id INTO v_category_id FROM product_categories WHERE name = 'Bottles';
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('SOLIGNUM-1L', 'Solignum Ordorless All-Around Clear (1Liter)', v_category_id, v_uom_id, v_uom_id, 502, 29.48, 650, 2, 12)
  ON CONFLICT (code) DO NOTHING;

  -- Category: Steel
  SELECT id INTO v_category_id FROM product_categories WHERE name = 'Steel';
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'SHEET';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('GI-MATING-6', 'G.I. Steel Mating #6 (4.5mm) 2 x 2 x 4ft x 8ft', v_category_id, v_uom_id, v_uom_id, 440, 54.55, 680, 4, 20)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'SHEET';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('GI-MATING-10', 'G.I. Steel Mating #10 (2.7mm) 2 x 2 x 4ft x 8ft', v_category_id, v_uom_id, v_uom_id, 225, 55.56, 350, 4, 20)
  ON CONFLICT (code) DO NOTHING;

  -- Category: Tarpaulin
  SELECT id INTO v_category_id FROM product_categories WHERE name = 'Tarpaulin';
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'M';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('TRAPAL-BLUE-ORG', 'Trapal Blue/Orange (Tarpaulin)', v_category_id, v_uom_id, v_uom_id, 30, 100, 60, 10, 50)
  ON CONFLICT (code) DO NOTHING;

  -- Category: Fasteners
  SELECT id INTO v_category_id FROM product_categories WHERE name = 'Fasteners';
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'BOX';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('RIVET-1/8X1/2', 'Blind Rivets 1/8 x 1/2 (BOX)', v_category_id, v_uom_id, v_uom_id, 90, 22.22, 110, 2, 10)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'BOX';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('RIVET-1/8X3/4', 'Blind Rivets 1/8 x 3/4 (BOX)', v_category_id, v_uom_id, v_uom_id, 135, 14.81, 155, 2, 10)
  ON CONFLICT (code) DO NOTHING;

  -- Category: Paint Brush
  SELECT id INTO v_category_id FROM product_categories WHERE name = 'Paint Brush';
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('AZTECH-3/4', 'AZTECH Paint Brush 3/4', v_category_id, v_uom_id, v_uom_id, 9, 177.78, 25, 4, 24)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('AZTECH-1', 'AZTECH Paint Brush 1', v_category_id, v_uom_id, v_uom_id, 10, 200, 30, 4, 24)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('AZTECH-1.5', 'AZTECH Paint Brush 1 1/2', v_category_id, v_uom_id, v_uom_id, 12, 191.67, 35, 4, 24)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('AZTECH-2', 'AZTECH Paint Brush 2', v_category_id, v_uom_id, v_uom_id, 15, 166.67, 40, 4, 24)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('AZTECH-3/4-HD', 'AZTECH Paint Brush 3/4', v_category_id, v_uom_id, v_uom_id, 23, 95.65, 45, 4, 24)
  ON CONFLICT (code) DO NOTHING;

  -- Category: Tools
  SELECT id INTO v_category_id FROM product_categories WHERE name = 'Tools';
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('RIVITER-HD', 'Hand Riviter HUNTER Heavy Duty CHROME', v_category_id, v_uom_id, v_uom_id, 127, 104.72, 260, 1, 5)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('CAULK-GUN-HNT', 'Caulking Gun HUNTER', v_category_id, v_uom_id, v_uom_id, 79, 89.87, 150, 2, 10)
  ON CONFLICT (code) DO NOTHING;

  -- Category: Tape
  SELECT id INTO v_category_id FROM product_categories WHERE name = 'Tape';
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('TEFLON-1', 'Teflon Tape 1', v_category_id, v_uom_id, v_uom_id, 10, 150, 25, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('TEFLON-3/4', 'Teflon Tape 3/4', v_category_id, v_uom_id, v_uom_id, 8, 150, 20, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('TEFLON-1/2', 'Teflon Tape 1/2', v_category_id, v_uom_id, v_uom_id, 5, 200, 15, 10, 50)
  ON CONFLICT (code) DO NOTHING;

  -- Category: Electrical
  SELECT id INTO v_category_id FROM product_categories WHERE name = 'Electrical';
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('ENT-CAP-3/4', 'Entrance Cap 3/4', v_category_id, v_uom_id, v_uom_id, 31.8, 120.13, 70, 4, 20)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('ENT-CAP-1', 'Entrance Cap 1', v_category_id, v_uom_id, v_uom_id, 34, 61.76, 55, 4, 20)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('EMT-CONN-3/4', 'EMT Connector 3/4', v_category_id, v_uom_id, v_uom_id, 11.25, 255.56, 40, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('EMT-CONN-1', 'EMT Connector 1', v_category_id, v_uom_id, v_uom_id, 16.5, 172.73, 45, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('EMT-COUP-3/4', 'EMT Coupling 3/4', v_category_id, v_uom_id, v_uom_id, 11.25, 166.67, 30, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('EMT-COUP-1', 'EMT Coupling 1', v_category_id, v_uom_id, v_uom_id, 16.5, 93.94, 32, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('EMT-ELBOW-3/4', 'EMT Elbow 3/4', v_category_id, v_uom_id, v_uom_id, 26, 92.31, 50, 6, 30)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('EMT-ELBOW-1', 'EMT Elbow 1', v_category_id, v_uom_id, v_uom_id, 48, 56.25, 75, 6, 30)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('BRK-BOX-4H', 'Breaker Box (4 holes)', v_category_id, v_uom_id, v_uom_id, 549.78, 36.41, 750, 1, 5)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('BRK-BOX-6H', 'Breaker Box (6 holes)', v_category_id, v_uom_id, v_uom_id, 679.8, 25.03, 850, 1, 5)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('CB-60A', 'Circuit Breaker 60 Amps', v_category_id, v_uom_id, v_uom_id, 238, 34.45, 320, 2, 10)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('CB-30A', 'Circuit Breaker 30 Amps', v_category_id, v_uom_id, v_uom_id, 228, 35.96, 310, 2, 10)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('CB-20A', 'Circuit Breaker 20 Amps', v_category_id, v_uom_id, v_uom_id, 228, 35.96, 310, 2, 10)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('CB-15A', 'Circuit Breaker 15 Amps', v_category_id, v_uom_id, v_uom_id, 228, 35.96, 310, 2, 10)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'M';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('THHN-14-UP', 'United Power THHN Wire #14', v_category_id, v_uom_id, v_uom_id, 16.66, 80.07, 30, 20, 100)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'BOX';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('INS-STAPLE-1', 'Insulated Staple Wire #1', v_category_id, v_uom_id, v_uom_id, 51.8, 44.79, 75, 2, 10)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('MTR-BASE-1', 'Meter Base #1', v_category_id, v_uom_id, v_uom_id, 275, 38.18, 380, 1, 5)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('MTR-BASE-3/4', 'Meter Base #3/4', v_category_id, v_uom_id, v_uom_id, 275, 38.18, 380, 1, 5)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('SAD-CLAMP-3/4', 'Saddle Clamp 3/4', v_category_id, v_uom_id, v_uom_id, 5, 300, 20, 20, 100)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('SAD-CLAMP-1', 'Saddle Clamp 1', v_category_id, v_uom_id, v_uom_id, 7, 257.14, 25, 20, 100)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'M';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('FLAT-CORD-16', 'Flat Cord Wire #16', v_category_id, v_uom_id, v_uom_id, 18.77, 86.47, 35, 20, 100)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'M';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('FLEX-HOSE-1/2', 'Flexible Hose 1/2', v_category_id, v_uom_id, v_uom_id, 5.88, 172.11, 16, 20, 100)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'M';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('THHN-8-ROYU', 'ROYU THHN #8 (8.0mm) Stranded', v_category_id, v_uom_id, v_uom_id, 74.32, 21.11, 90, 20, 100)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'M';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('THHN-12-ROYU', 'ROYU THHN #12 (3.5mm) Stranded', v_category_id, v_uom_id, v_uom_id, 31.1, 44.69, 45, 20, 100)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'M';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('WIRE-12-PDX', 'PDX Wire #12 (2.00mm)', v_category_id, v_uom_id, v_uom_id, 48, 35.42, 65, 20, 100)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'M';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('WIRE-14-PDX', 'PDX Wire #14 (1.60mm)', v_category_id, v_uom_id, v_uom_id, 35, 57.14, 55, 20, 100)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'ROLL';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('ELEC-TAPE-4M', 'Electrical Tape ROYU 4M (Small)', v_category_id, v_uom_id, v_uom_id, 9, 122.22, 20, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'ROLL';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('ELEC-TAPE-16M', 'Electrical Tape ROYU 16M (Big)', v_category_id, v_uom_id, v_uom_id, 27.5, 81.82, 50, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('WP-ENCL-NEMA', 'Weather Proof Enclosure Box NEMA 3R 2-Pole (ROYU) Bolt-On', v_category_id, v_uom_id, v_uom_id, 288, 73.61, 500, 1, 5)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('ROYU-UTL-BOX', 'ROYU Surface Type Utility Box (RUB2)', v_category_id, v_uom_id, v_uom_id, 27, 122.22, 60, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'LENGTH';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('ELEC-MOULD-PVC', 'Electrical Moulding PVC ROYU 30mmx25mmx2.44M', v_category_id, v_uom_id, v_uom_id, 68, 61.76, 110, 4, 20)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('ROYU-2G-OUT-WD113', 'ROYU 2-Gang Outlet Wide Series WD113 w/ Plate', v_category_id, v_uom_id, v_uom_id, 89, 34.83, 120, 6, 30)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('ROYU-3G-OUT-WD115', 'ROYU 3-Gang Outlet Wide Series WD115 w/ Plate', v_category_id, v_uom_id, v_uom_id, 132, 43.94, 190, 6, 30)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('ROYU-2G-SW-WD513', 'ROYU 2-Gang Switch WD513 Wide Series w/ Plate', v_category_id, v_uom_id, v_uom_id, 89, 34.83, 120, 6, 30)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('ROYU-3G-SW-WD515', 'ROYU 3-Gang Switch WD515 Wide Series w/ Plate', v_category_id, v_uom_id, v_uom_id, 124, 45.16, 180, 6, 30)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PVC-RECPT-3', 'PVC Receptacle 3', v_category_id, v_uom_id, v_uom_id, 23, 160.87, 60, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PVC-RECPT-4', 'PVC Receptacle 4', v_category_id, v_uom_id, v_uom_id, 26, 150, 65, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('ECOLUME-LED-11W', 'ECOLUME LED 11W Daylight', v_category_id, v_uom_id, v_uom_id, 63, 90.48, 120, 6, 30)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('ECOLUME-LED-7W', 'ECOLUME LED 7W Daylight', v_category_id, v_uom_id, v_uom_id, 49, 83.67, 90, 6, 30)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('ROYU-CB-30A-ENC', 'ROYU Circuit Breaker 30A w/ ENCLOSURE', v_category_id, v_uom_id, v_uom_id, 302, 65.56, 500, 2, 10)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('ROYU-CB-20A-ENC', 'ROYU Circuit Breaker 20A w/ ENCLOSURE', v_category_id, v_uom_id, v_uom_id, 302, 65.56, 500, 2, 10)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'LENGTH';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('EMT-PIPE-1', 'emt pipe 1', v_category_id, v_uom_id, v_uom_id, 274, 38.69, 380, 4, 20)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'LENGTH';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('EMT-PIPE-3/4', 'emt pipe 3/4', v_category_id, v_uom_id, v_uom_id, 202, 58.42, 320, 4, 20)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'LENGTH';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('ROYU-EM-40X25', 'Electrical Moulding PVC ROYU 40mmx25mmx2.44M', v_category_id, v_uom_id, v_uom_id, 96, 56.25, 150, 4, 20)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'LENGTH';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('ATLANTA-EM-1', 'Atlanta Electrical Moulding 1"', v_category_id, v_uom_id, v_uom_id, 85, 64.71, 140, 4, 20)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'LENGTH';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('ATLANTA-EM-3/4', 'Atlanta Electrical Moulding 3/4"', v_category_id, v_uom_id, v_uom_id, 50, 100, 100, 4, 20)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'LENGTH';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('ATLANTA-EM-1/2', 'Atlanta Electrical Moulding 1/2"', v_category_id, v_uom_id, v_uom_id, 45, 100, 90, 4, 20)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'LENGTH';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PVC-ORG-3/4', 'Electrical PVC Pipe Orange 3/4', v_category_id, v_uom_id, v_uom_id, 61, 80.33, 110, 4, 20)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'LENGTH';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PVC-ORG-1/2', 'Electrical PVC Pipe Orange 1/2', v_category_id, v_uom_id, v_uom_id, 44, 104.55, 90, 4, 20)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('VOSCH-EMETER', 'Voschtech Electric Meter (Submeter)', v_category_id, v_uom_id, v_uom_id, 728, 18.13, 860, 2, 10)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('OMNI-JBOX-WSJ001', 'OMNI Junction Box (WSJ-001) + Cover (WJC-001)', v_category_id, v_uom_id, v_uom_id, 28, 25, 35, 6, 30)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('OMNI-LED-6W', 'OMNI Led Bulb 6W', v_category_id, v_uom_id, v_uom_id, 76, 31.58, 100, 6, 30)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('OMNI-LED-9W', 'OMNI Led Bulb 9W', v_category_id, v_uom_id, v_uom_id, 92, 30.43, 120, 6, 30)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('OMNI-LED-12W', 'OMNI Led Bulb 12W', v_category_id, v_uom_id, v_uom_id, 132, 28.79, 170, 6, 30)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('OMNI-LED-15W', 'OMNI Led Bulb 15W', v_category_id, v_uom_id, v_uom_id, 196, 27.55, 250, 6, 30)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('OMNI-PLUG-MALE', 'OMNI Regular Male Plug WRP-0002', v_category_id, v_uom_id, v_uom_id, 16, 56.25, 25, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('OMNI-OUT-2G-STO002', 'OMNI Spring Type Outlet 2 Gang STO-002', v_category_id, v_uom_id, v_uom_id, 43, 27.91, 55, 6, 30)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('OMNI-OUT-2G-WSO002', 'OMNI Surface Duplex Universal Outlet 2 Gang WSO-002', v_category_id, v_uom_id, v_uom_id, 48, 35.42, 65, 6, 30)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('OMNI-OUT-3G-STO003', 'OMNI Spring Type Outlet 3 Gang STO-003', v_category_id, v_uom_id, v_uom_id, 56, 33.93, 75, 6, 30)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('OMNI-SW-WSS003', 'OMNI Switch Surface Mounted Type WSS-003', v_category_id, v_uom_id, v_uom_id, 80, 31.25, 105, 6, 30)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('OMNI-UBOX-WUB001', 'OMNI Utility Box Flush Type WUB-001', v_category_id, v_uom_id, v_uom_id, 21, 42.86, 30, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('OMNI-PLUG-FEMALE', 'OMNI Female Plug', v_category_id, v_uom_id, v_uom_id, 11, 81.82, 20, 10, 50)
  ON CONFLICT (code) DO NOTHING;

  -- Category: Adhesives
  SELECT id INTO v_category_id FROM product_categories WHERE name = 'Adhesives';
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'BAG';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('TILE-ABC', 'Tile Adhesive (ABC)', v_category_id, v_uom_id, v_uom_id, 258, 49.22, 385, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'BAG';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('SAHARA-WP', 'Sahara (Waterproofing / Adhesive)', v_category_id, v_uom_id, v_uom_id, 350, 28.57, 450, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('BOSTIK-NMN-30G', 'Bostik No More Nail 30g', v_category_id, v_uom_id, v_uom_id, 34, 76.47, 60, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('STICKWELL-WG-250', 'STICKWELL Wood Glue Pouch (250g)', v_category_id, v_uom_id, v_uom_id, 44, 93.18, 85, 6, 30)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('SOLVENT-JOSE-BC', 'Solvent Cement Jose Big Can', v_category_id, v_uom_id, v_uom_id, 117, 45.3, 170, 2, 12)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('RUGBY-45ML', 'Bostik Rugby 45ml', v_category_id, v_uom_id, v_uom_id, 42, 78.57, 75, 4, 24)
  ON CONFLICT (code) DO NOTHING;

  -- Category: Hardware
  SELECT id INTO v_category_id FROM product_categories WHERE name = 'Hardware';
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PAIR';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('HINGE-3.5-SB', 'BullMaster Loose Pin Hinges 3-1/2 Satin Satin Brass', v_category_id, v_uom_id, v_uom_id, 65, 84.62, 120, 4, 20)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PAIR';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('HINGE-4-SB', 'BullMaster Loose Pin Hinges 4 Satin Satin Brass', v_category_id, v_uom_id, v_uom_id, 75, 100, 150, 4, 20)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('ARMOR-LOCKSET', 'ARMOR Tubular Lockset', v_category_id, v_uom_id, v_uom_id, 225, 77.78, 400, 2, 10)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('BATT-AA-EVDY', 'Eveready Battery AA', v_category_id, v_uom_id, v_uom_id, 17.5, 25.71, 22, 20, 100)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('BATT-AAA-EVDY', 'Eveready Battery AAA', v_category_id, v_uom_id, v_uom_id, 19.5, 28.21, 25, 20, 100)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('VARNISH-PLAST-YEL', 'Plastic Varnish (Yellow)', v_category_id, v_uom_id, v_uom_id, 117, 28.21, 150, 2, 12)
  ON CONFLICT (code) DO NOTHING;

  -- Category: Plumbing
  SELECT id INTO v_category_id FROM product_categories WHERE name = 'Plumbing';
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('FAUCET-TEFLON', 'Faucet with Teflon', v_category_id, v_uom_id, v_uom_id, 22, 127.27, 50, 6, 30)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PVC-COUP-1/2', 'PVC Blue Coupling 1/2', v_category_id, v_uom_id, v_uom_id, 4, 100, 8, 20, 100)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PVC-TEE-PLAIN-1/2', 'PVC Blue TEE Plain 1/2', v_category_id, v_uom_id, v_uom_id, 7, 71.43, 12, 20, 100)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PVC-TEE-THR-1/2', 'PVC Blue TEE Threaded 1/2', v_category_id, v_uom_id, v_uom_id, 8, 50, 12, 20, 100)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PE-TEE-1/2', 'PE TEE 1/2" - 20mm', v_category_id, v_uom_id, v_uom_id, 58, 89.66, 110, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PE-ELBOW-1/2', 'PE Elbow 1/2" - 20mm', v_category_id, v_uom_id, v_uom_id, 42, 61.9, 68, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PE-ADAPT-1/2', 'PE Adaptor 1/2" x 1/2"', v_category_id, v_uom_id, v_uom_id, 26, 150, 65, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PE-COUP-1/2', 'PE Coupler 1/2" - 20mm', v_category_id, v_uom_id, v_uom_id, 39, 41.03, 55, 10, 50)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'PC';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PVC-VALVE-1/2', 'PVC Ball Valve Flat 1/2"', v_category_id, v_uom_id, v_uom_id, 20, 125, 45, 6, 30)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_uom_id FROM units_of_measure WHERE code = 'M';
  INSERT INTO products (code, name, category_id, base_uom_id, selling_uom_id, latest_cogs, markup_percentage, current_selling_price, reorder_point, reorder_quantity)
  VALUES ('PE-PIPE-1/2-SDR11', 'PE Pipe SDR11/ISO 1/2', v_category_id, v_uom_id, v_uom_id, 9, 177.78, 25, 20, 100)
  ON CONFLICT (code) DO NOTHING;
END $$;

-- Verify counts
SELECT 'branches' as table_name, COUNT(*) as count FROM branches
UNION ALL SELECT 'categories', COUNT(*) FROM product_categories
UNION ALL SELECT 'units', COUNT(*) FROM units_of_measure
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'customers', COUNT(*) FROM customers;
