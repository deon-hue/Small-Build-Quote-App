-- Add resent_at column to variations table to track when variations are resent to clients
ALTER TABLE variations ADD COLUMN IF NOT EXISTS resent_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN variations.resent_at IS 'When the variation was last resent to the client after updates';
