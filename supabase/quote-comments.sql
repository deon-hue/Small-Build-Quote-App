-- Quote Comments table — for client/contractor communication on quotes

CREATE TABLE IF NOT EXISTS quote_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  author_name TEXT NOT NULL DEFAULT '', -- "You" for contractor, client name for clients
  message TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE, -- Only visible to contractor if true
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE quote_comments ENABLE ROW LEVEL SECURITY;

-- Contractor can see all comments on their quotes
DROP POLICY IF EXISTS "Contractor sees all comments on own quotes" ON quote_comments;
CREATE POLICY "Contractor sees all comments on own quotes" ON quote_comments
  FOR SELECT USING (
    quote_id IN (SELECT id FROM quotes WHERE user_id = auth.uid())
  );

-- Contractor can create comments
DROP POLICY IF EXISTS "Contractor can create comments" ON quote_comments;
CREATE POLICY "Contractor can create comments" ON quote_comments
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    quote_id IN (SELECT id FROM quotes WHERE user_id = auth.uid())
  );

-- Contractor can update/delete their own comments
DROP POLICY IF EXISTS "Contractor can update own comments" ON quote_comments;
CREATE POLICY "Contractor can update own comments" ON quote_comments
  FOR UPDATE USING (user_id = auth.uid());

-- Portal: Clients can see non-internal comments on their quotes
DROP POLICY IF EXISTS "Portal clients see non-internal comments" ON quote_comments;
CREATE POLICY "Portal clients see non-internal comments" ON quote_comments
  FOR SELECT USING (
    NOT is_internal AND
    quote_id IN (SELECT id FROM quotes WHERE customer ->> 'email' = auth.jwt() ->> 'email')
  );
