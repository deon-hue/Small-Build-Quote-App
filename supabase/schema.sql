-- ============================================================
-- Small Build Company — Supabase Schema
-- Run this entire file in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Jobs table
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  client TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  value NUMERIC NOT NULL DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'planning',
  start_date DATE,
  weeks INTEGER NOT NULL DEFAULT 8,
  done INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  quote_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quotes table (phases and customer stored as JSONB to mirror existing schema)
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  ref TEXT NOT NULL DEFAULT '',
  saved_date TEXT NOT NULL DEFAULT '',
  last_edited TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  job_type TEXT NOT NULL DEFAULT '',
  markup NUMERIC NOT NULL DEFAULT 15,
  vat_included BOOLEAN NOT NULL DEFAULT TRUE,
  scope TEXT NOT NULL DEFAULT '',
  photo TEXT NOT NULL DEFAULT '',
  converted_to_job BOOLEAN NOT NULL DEFAULT FALSE,
  customer JSONB NOT NULL DEFAULT '{}',
  phases JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clients table
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  added_from TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Settings table (one row per user)
CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
  company_name TEXT NOT NULL DEFAULT 'Small Build Company Ltd',
  tagline TEXT NOT NULL DEFAULT 'Building Extensions & Renovations',
  contact TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  terms TEXT NOT NULL DEFAULT 'A deposit of 25% is required prior to commencement of works. Stage payments are then due at agreed milestones throughout the project. Final payment is due upon practical completion.',
  extra TEXT NOT NULL DEFAULT 'All works are carried out in accordance with current Building Regulations. Any variations to the agreed scope of works will be priced and agreed in writing prior to proceeding.',
  logo TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Gantt states table
CREATE TABLE gantt_states (
  job_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,
  state JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (job_id, user_id)
);

-- ============================================================
-- Row Level Security (RLS) — users see ONLY their own data
-- ============================================================
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE gantt_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own jobs" ON jobs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Own quotes" ON quotes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Own clients" ON clients FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Own settings" ON settings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Own gantt states" ON gantt_states FOR ALL USING (auth.uid() = user_id);
