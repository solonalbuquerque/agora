-- Service slug: unique per instance (single instance per DB, so global UNIQUE).
ALTER TABLE services ADD COLUMN IF NOT EXISTS slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_services_slug ON services(slug) WHERE slug IS NOT NULL;
