-- Portal activity log table
-- Run this in Supabase SQL editor

CREATE TABLE IF NOT EXISTS portal_activity_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL,
  client_id     UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_email  TEXT,
  event_type    TEXT NOT NULL CHECK (event_type IN (
    'sign_in', 'sign_in_failed', 'magic_link_sent', 'magic_link_rate_limit'
  )),
  details       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE portal_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read own logs" ON portal_activity_logs;
CREATE POLICY "Admins read own logs" ON portal_activity_logs
  FOR SELECT USING (auth.uid() = owner_user_id);
