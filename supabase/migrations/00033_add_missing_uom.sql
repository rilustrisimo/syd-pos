-- ============================================================================
-- Migration 00033: Add missing units of measure
-- ============================================================================
-- Adds UOMs commonly needed for hardware / general merchandise stores
-- that were missing from the original seed (00005).
-- Uses INSERT ... ON CONFLICT DO NOTHING to be safe if any already exist.
-- ============================================================================

INSERT INTO units_of_measure (code, name, description) VALUES
    -- Containers / packaging
    ('SACHET',  'Sachet',       'Small single-use packet or sachet'),
    ('BOTTLE',  'Bottle',       'Bottle (any size)'),
    ('TUBE',    'Tube',         'Tube (caulk, adhesive, toothpaste, etc.)'),
    ('TIN',     'Tin',          'Tin container (paint, grease, etc.)'),
    ('DRUM',    'Drum',         'Drum or barrel (chemicals, oil, etc.)'),
    ('TANK',    'Tank',         'Tank or large container'),
    ('JAR',     'Jar',          'Jar or wide-mouth container'),
    ('POUCH',   'Pouch',        'Flexible pouch or standup bag'),
    ('SACK',    'Sack',         'Large sack (cement, rice, feed, etc.)'),
    ('REAM',    'Ream',         '500 sheets of paper'),
    ('CART',    'Cartridge',    'Cartridge (ink, filter, etc.)'),

    -- Counting units
    ('DOZ',     'Dozen',        '12 pieces'),
    ('GROSS',   'Gross',        '144 pieces (12 dozen)'),
    ('BUNDLE',  'Bundle',       'Bundle of items'),  -- may already exist, covered by ON CONFLICT

    -- Length / dimension
    ('MM',      'Millimeter',   'Length in millimeters'),
    ('CM',      'Centimeter',   'Length in centimeters'),
    ('LM',      'Linear Meter', 'Linear meter (for cut-to-length materials)'),
    ('IN',      'Inch',         'Length in inches'),
    ('YD',      'Yard',         'Length in yards'),

    -- Area
    ('SQIN',    'Square Inch',  'Area in square inches'),

    -- Volume / weight (small)
    ('ML',      'Milliliter',   'Volume in milliliters'),
    ('G',       'Gram',         'Weight in grams'),
    ('MT',      'Metric Ton',   'Weight in metric tons (1,000 kg)'),

    -- Hardware / construction specific
    ('COIL',    'Coil',         'Coil (wire, hose, rope, etc.)'),
    ('STICK',   'Stick',        'Stick or bar (rebar, lumber, etc.)'),
    ('PANEL',   'Panel',        'Panel (plywood, GI sheet, etc.)'),
    ('BOARD',   'Board',        'Board (lumber, wood panel)'),
    ('SPOOL',   'Spool',        'Spool (wire, thread, cable)'),
    ('TRAY',    'Tray',         'Tray (eggs, seedlings, etc.)'),
    ('VIAL',    'Vial',         'Small vial or ampule'),
    ('CUP',     'Cup',          'Cup measurement')

ON CONFLICT (code) DO NOTHING;
