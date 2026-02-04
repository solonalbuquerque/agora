-- Services: price in cents + coin (default AGOTEST). Rename price_cents_usd -> price_cents.

ALTER TABLE services ADD COLUMN IF NOT EXISTS coin VARCHAR(16) NOT NULL DEFAULT 'AGOTEST';

-- If column is still named price_cents_usd, rename
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'price_cents_usd'
  ) THEN
    ALTER TABLE services RENAME COLUMN price_cents_usd TO price_cents;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'price_cents'
  ) THEN
    ALTER TABLE services ADD COLUMN price_cents BIGINT NOT NULL DEFAULT 0;
  END IF;
END $$;
