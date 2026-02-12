-- Seed subcategories for each category
-- This uses a DO block to insert subcategories based on category names

DO $$
DECLARE
    cat_cement UUID;
    cat_steel UUID;
    cat_lumber UUID;
    cat_pipes UUID;
    cat_electrical UUID;
    cat_plumbing UUID;
    cat_paint UUID;
    cat_hardware UUID;
    cat_roofing UUID;
    cat_tools UUID;
BEGIN
    -- Get category IDs
    SELECT id INTO cat_cement FROM product_categories WHERE name = 'Cement & Concrete';
    SELECT id INTO cat_steel FROM product_categories WHERE name = 'Steel & Metal';
    SELECT id INTO cat_lumber FROM product_categories WHERE name = 'Lumber & Wood';
    SELECT id INTO cat_pipes FROM product_categories WHERE name = 'Pipes & Fittings';
    SELECT id INTO cat_electrical FROM product_categories WHERE name = 'Electrical';
    SELECT id INTO cat_plumbing FROM product_categories WHERE name = 'Plumbing';
    SELECT id INTO cat_paint FROM product_categories WHERE name = 'Paint & Finishes';
    SELECT id INTO cat_hardware FROM product_categories WHERE name = 'Hardware';
    SELECT id INTO cat_roofing FROM product_categories WHERE name = 'Roofing';
    SELECT id INTO cat_tools FROM product_categories WHERE name = 'Tools';

    -- Cement & Concrete subcategories
    IF cat_cement IS NOT NULL THEN
        INSERT INTO product_subcategories (category_id, name, description) VALUES
            (cat_cement, 'Portland Cement', 'Standard Portland cement bags'),
            (cat_cement, 'Ready-Mix Concrete', 'Pre-mixed concrete products'),
            (cat_cement, 'Cement Additives', 'Accelerators, retarders, and plasticizers'),
            (cat_cement, 'Grout & Mortar', 'Grout, mortar mix, and tile adhesives'),
            (cat_cement, 'Concrete Blocks', 'CHB, hollow blocks, and solid blocks')
        ON CONFLICT (category_id, name) DO NOTHING;
    END IF;

    -- Steel & Metal subcategories
    IF cat_steel IS NOT NULL THEN
        INSERT INTO product_subcategories (category_id, name, description) VALUES
            (cat_steel, 'Deformed Bars', 'Rebar and deformed steel bars'),
            (cat_steel, 'Steel Sheets', 'GI sheets, plain sheets, corrugated'),
            (cat_steel, 'Steel Pipes', 'Black iron and galvanized steel pipes'),
            (cat_steel, 'Angle Bars', 'L-shaped angle bars and channels'),
            (cat_steel, 'Wire & Mesh', 'Tie wire, welded wire mesh, chicken wire')
        ON CONFLICT (category_id, name) DO NOTHING;
    END IF;

    -- Lumber & Wood subcategories
    IF cat_lumber IS NOT NULL THEN
        INSERT INTO product_subcategories (category_id, name, description) VALUES
            (cat_lumber, 'Plywood', 'Marine plywood, ordinary plywood'),
            (cat_lumber, 'Lumber', 'Coco lumber, good lumber, hardwood'),
            (cat_lumber, 'Particle Board', 'MDF, HDF, and particle boards'),
            (cat_lumber, 'Wood Moldings', 'Door jambs, baseboards, corner guards'),
            (cat_lumber, 'Treated Wood', 'Pressure-treated lumber')
        ON CONFLICT (category_id, name) DO NOTHING;
    END IF;

    -- Pipes & Fittings subcategories
    IF cat_pipes IS NOT NULL THEN
        INSERT INTO product_subcategories (category_id, name, description) VALUES
            (cat_pipes, 'PVC Pipes', 'Orange, blue, and white PVC pipes'),
            (cat_pipes, 'PVC Fittings', 'Elbows, tees, couplings, reducers'),
            (cat_pipes, 'HDPE Pipes', 'High-density polyethylene pipes'),
            (cat_pipes, 'Metal Pipes', 'GI pipes and black iron pipes'),
            (cat_pipes, 'Valves', 'Gate valves, ball valves, check valves')
        ON CONFLICT (category_id, name) DO NOTHING;
    END IF;

    -- Electrical subcategories
    IF cat_electrical IS NOT NULL THEN
        INSERT INTO product_subcategories (category_id, name, description) VALUES
            (cat_electrical, 'Wires & Cables', 'THHN, Romex, and electrical wires'),
            (cat_electrical, 'Switches & Outlets', 'Wall switches, outlets, plates'),
            (cat_electrical, 'Conduits', 'PVC conduit, flexible conduit'),
            (cat_electrical, 'Breakers & Panels', 'Circuit breakers, panel boards'),
            (cat_electrical, 'Lighting', 'Bulbs, fixtures, and lighting accessories')
        ON CONFLICT (category_id, name) DO NOTHING;
    END IF;

    -- Plumbing subcategories
    IF cat_plumbing IS NOT NULL THEN
        INSERT INTO product_subcategories (category_id, name, description) VALUES
            (cat_plumbing, 'Faucets', 'Kitchen and lavatory faucets'),
            (cat_plumbing, 'Toilets & Bidets', 'Water closets, bidets, urinals'),
            (cat_plumbing, 'Sinks & Lavatories', 'Kitchen sinks, wash basins'),
            (cat_plumbing, 'Water Heaters', 'Electric and gas water heaters'),
            (cat_plumbing, 'Pumps', 'Jet pumps, submersible pumps')
        ON CONFLICT (category_id, name) DO NOTHING;
    END IF;

    -- Paint & Finishes subcategories
    IF cat_paint IS NOT NULL THEN
        INSERT INTO product_subcategories (category_id, name, description) VALUES
            (cat_paint, 'Latex Paint', 'Interior and exterior latex paints'),
            (cat_paint, 'Enamel Paint', 'Quick-dry and semi-gloss enamel'),
            (cat_paint, 'Primers & Sealers', 'Concrete neutralizer, wood primer'),
            (cat_paint, 'Wood Stains', 'Varnish, lacquer, wood stains'),
            (cat_paint, 'Specialty Coatings', 'Epoxy, waterproofing, roof coating')
        ON CONFLICT (category_id, name) DO NOTHING;
    END IF;

    -- Hardware subcategories
    IF cat_hardware IS NOT NULL THEN
        INSERT INTO product_subcategories (category_id, name, description) VALUES
            (cat_hardware, 'Nails', 'Common nails, concrete nails, finishing nails'),
            (cat_hardware, 'Screws & Bolts', 'Wood screws, machine bolts, lag screws'),
            (cat_hardware, 'Hinges & Locks', 'Door hinges, padlocks, deadbolts'),
            (cat_hardware, 'Brackets & Hangers', 'Shelf brackets, joist hangers'),
            (cat_hardware, 'Adhesives & Sealants', 'Silicone, construction adhesive, epoxy')
        ON CONFLICT (category_id, name) DO NOTHING;
    END IF;

    -- Roofing subcategories
    IF cat_roofing IS NOT NULL THEN
        INSERT INTO product_subcategories (category_id, name, description) VALUES
            (cat_roofing, 'Metal Roofing', 'Longspan, corrugated, tile effect'),
            (cat_roofing, 'Roof Accessories', 'Ridge caps, flashings, gutters'),
            (cat_roofing, 'Insulation', 'Foam boards, roof insulation'),
            (cat_roofing, 'Waterproofing', 'Roof sealants and membranes'),
            (cat_roofing, 'Skylights', 'Roof windows and skylights')
        ON CONFLICT (category_id, name) DO NOTHING;
    END IF;

    -- Tools subcategories
    IF cat_tools IS NOT NULL THEN
        INSERT INTO product_subcategories (category_id, name, description) VALUES
            (cat_tools, 'Hand Tools', 'Hammers, screwdrivers, pliers, wrenches'),
            (cat_tools, 'Power Tools', 'Drills, grinders, saws'),
            (cat_tools, 'Measuring Tools', 'Tape measures, levels, squares'),
            (cat_tools, 'Cutting Tools', 'Hacksaws, chisels, utility knives'),
            (cat_tools, 'Safety Equipment', 'Hard hats, gloves, safety glasses')
        ON CONFLICT (category_id, name) DO NOTHING;
    END IF;

END $$;
