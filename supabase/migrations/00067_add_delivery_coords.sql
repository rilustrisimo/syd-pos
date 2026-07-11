-- Store customer pin coordinates and road-based distance on delivery transactions
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS delivery_latitude   NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS delivery_longitude  NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS delivery_distance_km NUMERIC(6,2);

COMMENT ON COLUMN transactions.delivery_latitude   IS 'Customer pinned delivery location — latitude';
COMMENT ON COLUMN transactions.delivery_longitude  IS 'Customer pinned delivery location — longitude';
COMMENT ON COLUMN transactions.delivery_distance_km IS 'Road distance from store to customer pin (OSRM); straight-line Haversine fallback if no road data';
