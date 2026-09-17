-- Phase D-1 of the marketing content pipeline: stock media imported
-- from Pexels/Pixabay/Unsplash needs durable attribution, not just a
-- one-time display at import time (both providers' terms expect
-- credit to persist), so this is captured now rather than retrofitted
-- later with no way to recover it for already-imported rows.

ALTER TABLE content_media ADD COLUMN IF NOT EXISTS attribution text;
