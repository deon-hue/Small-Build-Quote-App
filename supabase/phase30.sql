-- Migration: Bill Payments with CIS deduction + job cost sync
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS bills (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ref            TEXT NOT NULL,
  supplier_id    UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name  TEXT NOT NULL DEFAULT '',
  job_id         UUID REFERENCES jobs(id) ON DELETE SET NULL,
  bill_date      TEXT NOT NULL DEFAULT '',
  due_date       TEXT NOT NULL DEFAULT '',
  description    TEXT NOT NULL DEFAULT '',
  line_items     JSONB NOT NULL DEFAULT '[]'::JSONB,
  labour_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  materials_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  plant_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal       NUMERIC(12,2) NOT NULL DEFAULT 0,
  cis_rate       NUMERIC(5,2)  NOT NULL DEFAULT 0,
  cis_deduction  NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_payable  NUMERIC(12,2) NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'draft',
  notes          TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own bills"
  ON bills FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Link job_costs rows back to the bill that created them.
-- ON DELETE CASCADE means deleting a bill auto-removes its cost lines.
ALTER TABLE job_costs
  ADD COLUMN IF NOT EXISTS bill_id UUID REFERENCES bills(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_job_costs_bill ON job_costs(bill_id);
