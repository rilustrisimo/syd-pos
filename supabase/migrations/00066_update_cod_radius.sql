-- Change flat delivery fee radius from 5km to 3km
UPDATE shop_settings SET cod_radius_km = 3;
ALTER TABLE shop_settings ALTER COLUMN cod_radius_km SET DEFAULT 3;
