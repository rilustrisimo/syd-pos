-- Update product prices from CSV data (SYD_Materials_2026-02-08.csv)
-- Run this in Supabase SQL Editor
-- Note: Products are identified by the 'code' column

-- First, check what products exist (uncomment to run):
-- SELECT id, code, name, latest_cogs, markup_percentage, current_selling_price FROM products LIMIT 5;

-- Update all products with pricing from CSV
-- Roofing Materials
UPDATE products SET latest_cogs = 176, markup_percentage = 31.5, current_selling_price = 240, updated_at = NOW() WHERE code = 'GI-24X8';
UPDATE products SET latest_cogs = 220, markup_percentage = 32.5, current_selling_price = 300, updated_at = NOW() WHERE code = 'GI-24X10';
UPDATE products SET latest_cogs = 264, markup_percentage = 25.8, current_selling_price = 340, updated_at = NOW() WHERE code = 'GI-24X12';
UPDATE products SET latest_cogs = 160, markup_percentage = 32, current_selling_price = 220, updated_at = NOW() WHERE code = 'GI-22X8';
UPDATE products SET latest_cogs = 200, markup_percentage = 31, current_selling_price = 270, updated_at = NOW() WHERE code = 'GI-22X10';
UPDATE products SET latest_cogs = 240, markup_percentage = 33.8, current_selling_price = 330, updated_at = NOW() WHERE code = 'GI-22X12';
UPDATE products SET latest_cogs = 176, markup_percentage = 31.5, current_selling_price = 240, updated_at = NOW() WHERE code = 'PLAIN-G24';
UPDATE products SET latest_cogs = 160, markup_percentage = 32, current_selling_price = 220, updated_at = NOW() WHERE code = 'PLAIN-G22';

-- Sealants & Finishing
UPDATE products SET latest_cogs = 403, markup_percentage = 20.8, current_selling_price = 495, updated_at = NOW() WHERE code = 'SEAL-ISL';
UPDATE products SET latest_cogs = 57, markup_percentage = 49.1, current_selling_price = 85, updated_at = NOW() WHERE code = 'VULCA-SEAL-75ML';
UPDATE products SET latest_cogs = 135, markup_percentage = 70.4, current_selling_price = 230, updated_at = NOW() WHERE code = 'SUNSHIELD-SIL-300ML';

-- Nails
UPDATE products SET latest_cogs = 970, markup_percentage = 15, current_selling_price = 52, updated_at = NOW() WHERE code = 'CN-2';
UPDATE products SET latest_cogs = 970, markup_percentage = 15, current_selling_price = 52, updated_at = NOW() WHERE code = 'CN-2.5';
UPDATE products SET latest_cogs = 910, markup_percentage = 15, current_selling_price = 49, updated_at = NOW() WHERE code = 'CN-3';
UPDATE products SET latest_cogs = 1100, markup_percentage = 15, current_selling_price = 58, updated_at = NOW() WHERE code = 'CN-1';
UPDATE products SET latest_cogs = 1030, markup_percentage = 20, current_selling_price = 57, updated_at = NOW() WHERE code = 'CN-1.5';
UPDATE products SET latest_cogs = 880, markup_percentage = 20, current_selling_price = 50, updated_at = NOW() WHERE code = 'CN-4';
UPDATE products SET latest_cogs = 1250, markup_percentage = 14, current_selling_price = 69, updated_at = NOW() WHERE code = 'UMB-NAIL-2.5';
UPDATE products SET latest_cogs = 1500, markup_percentage = 15, current_selling_price = 76, updated_at = NOW() WHERE code = 'CONCN-2';
UPDATE products SET latest_cogs = 1500, markup_percentage = 15, current_selling_price = 76, updated_at = NOW() WHERE code = 'CONCN-3';
UPDATE products SET latest_cogs = 47.4, markup_percentage = 26.6, current_selling_price = 60, updated_at = NOW() WHERE code = 'FIN-NAIL-1';
UPDATE products SET latest_cogs = 42.6, markup_percentage = 29.1, current_selling_price = 55, updated_at = NOW() WHERE code = 'FIN-NAIL-2';

-- Steel Bars / Reinforcement
UPDATE products SET latest_cogs = 124, markup_percentage = 30, current_selling_price = 170, updated_at = NOW() WHERE code = 'REBAR-10MM';
UPDATE products SET latest_cogs = 179, markup_percentage = 29.5, current_selling_price = 240, updated_at = NOW() WHERE code = 'REBAR-12MM';
UPDATE products SET latest_cogs = 86, markup_percentage = 30, current_selling_price = 120, updated_at = NOW() WHERE code = 'REBAR-8MM';
UPDATE products SET latest_cogs = 94, markup_percentage = 29, current_selling_price = 130, updated_at = NOW() WHERE code = 'REBAR-9MM';
UPDATE products SET latest_cogs = 220, markup_percentage = 28, current_selling_price = 290, updated_at = NOW() WHERE code = 'FLAT-14-1';
UPDATE products SET latest_cogs = 442, markup_percentage = 29.4, current_selling_price = 580, updated_at = NOW() WHERE code = 'FLAT-14-2';

-- Steel Sections & Framing
UPDATE products SET latest_cogs = 384, markup_percentage = 29.3, current_selling_price = 505, updated_at = NOW() WHERE code = 'RT-1X2-15';
UPDATE products SET latest_cogs = 223, markup_percentage = 30.9, current_selling_price = 300, updated_at = NOW() WHERE code = 'ANG-316-1-25';
UPDATE products SET latest_cogs = 317, markup_percentage = 29.8, current_selling_price = 420, updated_at = NOW() WHERE code = 'ANG-316-15-25';
UPDATE products SET latest_cogs = 420, markup_percentage = 28.9, current_selling_price = 550, updated_at = NOW() WHERE code = 'ANG-316-2-25';

-- Metal Framing & Roofing Accessories
UPDATE products SET latest_cogs = 107, markup_percentage = 19, current_selling_price = 135, updated_at = NOW() WHERE code = 'MFUR-1X2';
UPDATE products SET latest_cogs = 131, markup_percentage = 16.5, current_selling_price = 160, updated_at = NOW() WHERE code = 'MSTUD-2X3';
UPDATE products SET latest_cogs = 120, markup_percentage = 18.5, current_selling_price = 150, updated_at = NOW() WHERE code = 'MTRACK-2X3';
UPDATE products SET latest_cogs = 430, markup_percentage = 15.8, current_selling_price = 505, updated_at = NOW() WHERE code = 'CPURL-2X3-15';

-- Wood & Boards
UPDATE products SET latest_cogs = 300, markup_percentage = 10.9, current_selling_price = 340, updated_at = NOW() WHERE code = 'PLY-ORD-14';
UPDATE products SET latest_cogs = 505, markup_percentage = 11.4, current_selling_price = 570, updated_at = NOW() WHERE code = 'PLY-ORD-12';
UPDATE products SET latest_cogs = 330, markup_percentage = 12.9, current_selling_price = 380, updated_at = NOW() WHERE code = 'PLY-MAR-14';
UPDATE products SET latest_cogs = 660, markup_percentage = 12.5, current_selling_price = 750, updated_at = NOW() WHERE code = 'PLY-MAR-12';
UPDATE products SET latest_cogs = 820, markup_percentage = 14.9, current_selling_price = 950, updated_at = NOW() WHERE code = 'PLY-ORD-34';
UPDATE products SET latest_cogs = 1120, markup_percentage = 11, current_selling_price = 1250, updated_at = NOW() WHERE code = 'PLY-MAR-34';
UPDATE products SET latest_cogs = 330, markup_percentage = 12.9, current_selling_price = 380, updated_at = NOW() WHERE code = 'FCB-45MM';
UPDATE products SET latest_cogs = 255, markup_percentage = 14.9, current_selling_price = 300, updated_at = NOW() WHERE code = 'FCB-35MM';

-- Cement & Masonry
UPDATE products SET latest_cogs = 205, markup_percentage = 3.9, current_selling_price = 220, updated_at = NOW() WHERE code = 'CEM-HOL';
UPDATE products SET latest_cogs = 195, markup_percentage = 4.5, current_selling_price = 210, updated_at = NOW() WHERE code = 'CEM-UNI';

-- Aggregates & Fill Materials
UPDATE products SET latest_cogs = 550, markup_percentage = 88.7, current_selling_price = 1050, updated_at = NOW() WHERE code = 'SAND-WASH';
UPDATE products SET latest_cogs = 550, markup_percentage = 88.7, current_selling_price = 1050, updated_at = NOW() WHERE code = 'SAND-SCREEN';
UPDATE products SET latest_cogs = 550, markup_percentage = 88.7, current_selling_price = 1050, updated_at = NOW() WHERE code = 'GRAVEL-34';

-- Plumbing Materials - PVC Pipes
UPDATE products SET latest_cogs = 68.5, markup_percentage = 19.5, current_selling_price = 90, updated_at = NOW() WHERE code = 'PVC-12';
UPDATE products SET latest_cogs = 63, markup_percentage = 21, current_selling_price = 84, updated_at = NOW() WHERE code = 'PVC-2-S500';
UPDATE products SET latest_cogs = 136, markup_percentage = 26, current_selling_price = 179, updated_at = NOW() WHERE code = 'PVC-3-S500';
UPDATE products SET latest_cogs = 182, markup_percentage = 27, current_selling_price = 239, updated_at = NOW() WHERE code = 'PVC-4-S500';

-- PVC Fittings - Elbows
UPDATE products SET latest_cogs = 9.5, markup_percentage = 90, current_selling_price = 30, updated_at = NOW() WHERE code = 'ELB-12-PL';
UPDATE products SET latest_cogs = 16, markup_percentage = 90, current_selling_price = 43, updated_at = NOW() WHERE code = 'ELB-12-THR';
UPDATE products SET latest_cogs = 9, markup_percentage = 95, current_selling_price = 30, updated_at = NOW() WHERE code = 'ELB-2-90';
UPDATE products SET latest_cogs = 17, markup_percentage = 91, current_selling_price = 45, updated_at = NOW() WHERE code = 'ELB-3-90';
UPDATE products SET latest_cogs = 7.5, markup_percentage = 90, current_selling_price = 26, updated_at = NOW() WHERE code = 'ELB-2-45';
UPDATE products SET latest_cogs = 26, markup_percentage = 90, current_selling_price = 62, updated_at = NOW() WHERE code = 'ELB-4-90';

-- PVC Fittings - P-Traps
UPDATE products SET latest_cogs = 28, markup_percentage = 29.5, current_selling_price = 45, updated_at = NOW() WHERE code = 'PTRAP-2';
UPDATE products SET latest_cogs = 50, markup_percentage = 30.5, current_selling_price = 74, updated_at = NOW() WHERE code = 'PTRAP-3';
UPDATE products SET latest_cogs = 77, markup_percentage = 30.5, current_selling_price = 109, updated_at = NOW() WHERE code = 'PTRAP-4';

-- PVC Fittings - WYE
UPDATE products SET latest_cogs = 33, markup_percentage = 25, current_selling_price = 49, updated_at = NOW() WHERE code = 'WYE-3X2';
UPDATE products SET latest_cogs = 47, markup_percentage = 29, current_selling_price = 69, updated_at = NOW() WHERE code = 'WYE-4X2';
UPDATE products SET latest_cogs = 16, markup_percentage = 30.5, current_selling_price = 29, updated_at = NOW() WHERE code = 'WYE-2X2';
UPDATE products SET latest_cogs = 36, markup_percentage = 28, current_selling_price = 54, updated_at = NOW() WHERE code = 'WYE-3X3';
UPDATE products SET latest_cogs = 52, markup_percentage = 27, current_selling_price = 74, updated_at = NOW() WHERE code = 'WYE-4X3';
UPDATE products SET latest_cogs = 56, markup_percentage = 27, current_selling_price = 79, updated_at = NOW() WHERE code = 'WYE-4X4';

-- PVC Fittings - Couplings
UPDATE products SET latest_cogs = 9, markup_percentage = 30, current_selling_price = 20, updated_at = NOW() WHERE code = 'COUP-1';
UPDATE products SET latest_cogs = 4.5, markup_percentage = 30, current_selling_price = 14, updated_at = NOW() WHERE code = 'COUP-2';
UPDATE products SET latest_cogs = 9, markup_percentage = 30, current_selling_price = 20, updated_at = NOW() WHERE code = 'COUP-3';
UPDATE products SET latest_cogs = 18, markup_percentage = 30, current_selling_price = 32, updated_at = NOW() WHERE code = 'COUP-15';
UPDATE products SET latest_cogs = 18, markup_percentage = 30, current_selling_price = 32, updated_at = NOW() WHERE code = 'COUP-4';

-- PVC Fittings - Reducers
UPDATE products SET latest_cogs = 17, markup_percentage = 30, current_selling_price = 30, updated_at = NOW() WHERE code = 'RED-4X2';
UPDATE products SET latest_cogs = 18, markup_percentage = 30, current_selling_price = 32, updated_at = NOW() WHERE code = 'RED-4X3';
UPDATE products SET latest_cogs = 10.5, markup_percentage = 30, current_selling_price = 22, updated_at = NOW() WHERE code = 'RED-12X34';
UPDATE products SET latest_cogs = 12, markup_percentage = 30, current_selling_price = 24, updated_at = NOW() WHERE code = 'RED-12X1';

-- Miscellaneous & Tools
UPDATE products SET latest_cogs = 42, markup_percentage = 44, current_selling_price = 70, updated_at = NOW() WHERE code = 'TIE-WIRE';
UPDATE products SET latest_cogs = 160, markup_percentage = 80, current_selling_price = 300, updated_at = NOW() WHERE code = 'SHOVEL-MTL';

-- Coco Lumber
UPDATE products SET latest_cogs = 34, markup_percentage = 48, current_selling_price = 50, updated_at = NOW() WHERE code = 'COCO-1X2X10';
UPDATE products SET latest_cogs = 100, markup_percentage = 30, current_selling_price = 130, updated_at = NOW() WHERE code = 'COCO-2X3X10';
UPDATE products SET latest_cogs = 67, markup_percentage = 27, current_selling_price = 85, updated_at = NOW() WHERE code = 'COCO-2X2X10';
UPDATE products SET latest_cogs = 133, markup_percentage = 28, current_selling_price = 170, updated_at = NOW() WHERE code = 'COCO-2X4X10';
UPDATE products SET latest_cogs = 267, markup_percentage = 48, current_selling_price = 395, updated_at = NOW() WHERE code = 'COCO-4X4X10';
UPDATE products SET latest_cogs = 320, markup_percentage = 48.5, current_selling_price = 475, updated_at = NOW() WHERE code = 'COCO-4X4X12';
UPDATE products SET latest_cogs = 245, markup_percentage = 48.9, current_selling_price = 365, updated_at = NOW() WHERE code = 'COCO-4X4X8';

-- Bottles
UPDATE products SET latest_cogs = 502, markup_percentage = 29.5, current_selling_price = 650, updated_at = NOW() WHERE code = 'SOLIGNUM-1L';

-- Steel
UPDATE products SET latest_cogs = 440, markup_percentage = 54.5, current_selling_price = 680, updated_at = NOW() WHERE code = 'GI-MATING-6';
UPDATE products SET latest_cogs = 225, markup_percentage = 55.5, current_selling_price = 350, updated_at = NOW() WHERE code = 'GI-MATING-10';

-- Tarpaulin
UPDATE products SET latest_cogs = 30, markup_percentage = 100, current_selling_price = 60, updated_at = NOW() WHERE code = 'TRAPAL-BLUE-ORG';

-- Fasteners
UPDATE products SET latest_cogs = 90, markup_percentage = 22.2, current_selling_price = 110, updated_at = NOW() WHERE code = 'RIVET-1/8X1/2';
UPDATE products SET latest_cogs = 135, markup_percentage = 14.8, current_selling_price = 155, updated_at = NOW() WHERE code = 'RIVET-1/8X3/4';

-- Paint Brush
UPDATE products SET latest_cogs = 9, markup_percentage = 177.8, current_selling_price = 25, updated_at = NOW() WHERE code = 'AZTECH-3/4';
UPDATE products SET latest_cogs = 10, markup_percentage = 200, current_selling_price = 30, updated_at = NOW() WHERE code = 'AZTECH-1';
UPDATE products SET latest_cogs = 12, markup_percentage = 191.7, current_selling_price = 35, updated_at = NOW() WHERE code = 'AZTECH-1.5';
UPDATE products SET latest_cogs = 15, markup_percentage = 166.7, current_selling_price = 40, updated_at = NOW() WHERE code = 'AZTECH-2';
UPDATE products SET latest_cogs = 23, markup_percentage = 95.7, current_selling_price = 45, updated_at = NOW() WHERE code = 'AZTECH-3/4-HD';

-- Tools
UPDATE products SET latest_cogs = 127, markup_percentage = 104.7, current_selling_price = 260, updated_at = NOW() WHERE code = 'RIVITER-HD';
UPDATE products SET latest_cogs = 79, markup_percentage = 89.9, current_selling_price = 150, updated_at = NOW() WHERE code = 'CAULK-GUN-HNT';

-- Tape
UPDATE products SET latest_cogs = 10, markup_percentage = 150, current_selling_price = 25, updated_at = NOW() WHERE code = 'TEFLON-1';
UPDATE products SET latest_cogs = 8, markup_percentage = 150, current_selling_price = 20, updated_at = NOW() WHERE code = 'TEFLON-3/4';
UPDATE products SET latest_cogs = 5, markup_percentage = 200, current_selling_price = 15, updated_at = NOW() WHERE code = 'TEFLON-1/2';

-- Electrical (continued in next section due to length)
