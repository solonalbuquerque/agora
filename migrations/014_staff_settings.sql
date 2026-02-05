-- Staff settings (key/value) for TOTP secret and other options
CREATE TABLE IF NOT EXISTS staff_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
