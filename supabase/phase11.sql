-- ============================================================
-- Phase 11 — Takeoff Projects + Settings Extensions
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
-- Purpose:
--   1. Create takeoff_projects table (Tier 3 project overrides)
--   2. Extend settings table with business/financial fields (Tier 2)
-- ============================================================

-- ── Takeoff Projects ──────────────────────────────────────────────────────────
-- Stores the full project state (elements + items + calibration) as JSONB.
-- Plan images are excluded from this table — they remain in localStorage only
-- because they can be several MB as data URIs.
--
-- The localStorage key 'sbc_takeoff_project' remains as the immediate write
-- cache and offline/recovery fallback. Supabase is the system of record.

CREATE TABLE IF NOT EXISTS takeoff_projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users NOT NULL,
  name          TEXT NOT NULL DEFAULT 'New Take-off',
  address       TEXT NOT NULL DEFAULT '',
  job_type      TEXT NOT NULL DEFAULT '',
  calibration   JSONB NOT NULL DEFAULT '{"mpp":0.00265,"label":"1:100"}',
  elements      JSONB NOT NULL DEFAULT '[]',
  items         JSONB NOT NULL DEFAULT '[]',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_takeoff_projects_user    ON takeoff_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_takeoff_projects_updated ON takeoff_projects(updated_at DESC);

ALTER TABLE takeoff_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own takeoff projects"
  ON takeoff_projects FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Settings Extensions ───────────────────────────────────────────────────────
-- Adds business/financial fields to the existing settings table.
-- These fields map to the BusinessDefaults interface in lib/product-config.ts.
-- All columns use IF NOT EXISTS so re-running this file is safe.

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS vat_registered    BOOLEAN       NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS vat_number        TEXT          NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS vat_rate          NUMERIC(5,2)  NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS default_markup    NUMERIC(5,2)  NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS payment_terms     TEXT          NOT NULL DEFAULT 'Stage payments due at agreed milestones. Final payment due on practical completion.',
  ADD COLUMN IF NOT EXISTS currency          TEXT          NOT NULL DEFAULT 'GBP',
  ADD COLUMN IF NOT EXISTS company_number    TEXT          NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS insurance_number  TEXT          NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cis_registered    BOOLEAN       NOT NULL DEFAULT FALSE;
