-- phase28.sql — Client self-serve AI quote requests
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS quote_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name      TEXT NOT NULL DEFAULT '',
  client_email     TEXT NOT NULL DEFAULT '',
  client_phone     TEXT NOT NULL DEFAULT '',
  project_type     TEXT NOT NULL DEFAULT '',
  project_address  TEXT NOT NULL DEFAULT '',
  scope_text       TEXT NOT NULL DEFAULT '',
  ai_phases        JSONB NOT NULL DEFAULT '[]',
  estimated_total  NUMERIC(12,2) NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'pending',  -- pending | reviewing | accepted | declined
  admin_notes      TEXT NOT NULL DEFAULT '',
  quote_id         UUID,  -- set when converted to a formal quote
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE quote_requests ENABLE ROW LEVEL SECURITY;

-- Public (unauthenticated) can insert — the client submission form
DROP POLICY IF EXISTS "Public insert quote_requests" ON quote_requests;
CREATE POLICY "Public insert quote_requests" ON quote_requests
  FOR INSERT WITH CHECK (true);

-- Any authenticated user (the builder / team) can read
DROP POLICY IF EXISTS "Auth select quote_requests" ON quote_requests;
CREATE POLICY "Auth select quote_requests" ON quote_requests
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Any authenticated user can update (change status, add notes)
DROP POLICY IF EXISTS "Auth update quote_requests" ON quote_requests;
CREATE POLICY "Auth update quote_requests" ON quote_requests
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Any authenticated user can delete
DROP POLICY IF EXISTS "Auth delete quote_requests" ON quote_requests;
CREATE POLICY "Auth delete quote_requests" ON quote_requests
  FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS quote_requests_status_idx ON quote_requests(status);
CREATE INDEX IF NOT EXISTS quote_requests_created_at_idx ON quote_requests(created_at DESC);
