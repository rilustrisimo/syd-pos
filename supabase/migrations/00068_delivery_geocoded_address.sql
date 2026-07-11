-- Add reverse-geocoded rough address from Nominatim (OpenStreetMap)
-- Captured when staff pins the customer location on the delivery map.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS delivery_geocoded_address TEXT;

COMMENT ON COLUMN transactions.delivery_geocoded_address IS 'Rough address from Nominatim reverse geocoding of the delivery pin (e.g. "Brgy. Poblacion, Talakag, Bukidnon")';
