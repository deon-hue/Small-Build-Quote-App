-- ============================================================
-- Quote Versioning System
-- Run this in Supabase SQL Editor
-- ============================================================

-- Add versioning columns to quotes table
ALTER TABLE quotes
ADD COLUMN IF NOT EXISTS version_number INT DEFAULT 1,
ADD COLUMN IF NOT EXISTS parent_quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS created_from_version_id UUID REFERENCES quotes(id) ON DELETE SET NULL;

-- Create index for version lookups
CREATE INDEX IF NOT EXISTS idx_quotes_parent ON quotes(parent_quote_id);
CREATE INDEX IF NOT EXISTS idx_quotes_version ON quotes(parent_quote_id, version_number);

-- Add comment explaining version fields
COMMENT ON COLUMN quotes.version_number IS 'Version number within this quote series (1, 2, 3, etc)';
COMMENT ON COLUMN quotes.parent_quote_id IS 'Parent quote ID if this is a version; NULL if this is the original';
COMMENT ON COLUMN quotes.created_from_version_id IS 'Which version this was created from when making a new version';
