-- Per-agent override for "can register services" (null = inherit from global staff setting).
ALTER TABLE agents ADD COLUMN IF NOT EXISTS can_register_services BOOLEAN;
