-- Phase 2 migration — run this in Supabase SQL Editor

-- Invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  ref TEXT NOT NULL DEFAULT '',
  job_id TEXT DEFAULT '',
  quote_id TEXT DEFAULT '',
  client_name TEXT NOT NULL DEFAULT '',
  client_address TEXT DEFAULT '',
  client_email TEXT DEFAULT '',
  line_items JSONB NOT NULL DEFAULT '[]',
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_included BOOLEAN NOT NULL DEFAULT true,
  vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  issue_date TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own invoices" ON invoices;
CREATE POLICY "Users manage own invoices" ON invoices FOR ALL USING (auth.uid() = user_id);

-- Job notes / activity log table
CREATE TABLE IF NOT EXISTS job_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  job_id TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE job_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own job notes" ON job_notes;
CREATE POLICY "Users manage own job notes" ON job_notes FOR ALL USING (auth.uid() = user_id);
