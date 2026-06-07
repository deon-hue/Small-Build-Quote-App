-- phase24: persist quote_source so Quick Quotes can be identified on reload
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quote_source TEXT;
