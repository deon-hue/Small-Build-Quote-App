-- Phase: Sub rate profiles on contacts + Admin time log table
-- Run this in Supabase SQL editor

-- Add sub rate profile columns to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sub_hourly_rate NUMERIC(10,2);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sub_day_rate    NUMERIC(10,2);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sub_half_day_rate NUMERIC(10,2);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS cis_registered  BOOLEAN DEFAULT FALSE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS cis_percentage  NUMERIC(5,2) DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sub_payment_type TEXT DEFAULT 'invoice';

-- Admin-driven sub time log table (not tied to contracts)
CREATE TABLE IF NOT EXISTS sub_admin_time_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users NOT NULL,
  contact_id      UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  job_id          TEXT,
  entry_date      DATE NOT NULL,
  start_time      TEXT,
  finish_time     TEXT,
  total_hours     NUMERIC(5,2),
  rate_type       TEXT CHECK (rate_type IN ('hourly','day','half_day','custom')) DEFAULT 'day',
  rate_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount          NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount_overridden BOOLEAN DEFAULT FALSE,
  notes           TEXT DEFAULT '',
  entry_type      TEXT CHECK (entry_type IN ('payable','billable','internal')) DEFAULT 'payable',
  status          TEXT CHECK (status IN ('pending','approved','paid')) DEFAULT 'pending',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sub_admin_time_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own time logs" ON sub_admin_time_logs;
CREATE POLICY "Users manage own time logs" ON sub_admin_time_logs
  FOR ALL USING (auth.uid() = user_id);
