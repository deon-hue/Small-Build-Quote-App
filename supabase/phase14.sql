-- ============================================================
-- Phase 14 — Takeoff Client Records
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
-- Creates takeoff_clients as a reusable address-book for clients
-- that can be linked to Takeoff projects.  A snapshot of the
-- selected client is stored inside the takeoff_projects.data
-- JSONB column at save time, so no FK is added to that table.
-- ============================================================

CREATE TABLE IF NOT EXISTS takeoff_clients (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        REFERENCES auth.users NOT NULL,
  name          TEXT        NOT NULL DEFAULT '',
  email         TEXT        NOT NULL DEFAULT '',
  phone         TEXT        NOT NULL DEFAULT '',
  address_line1 TEXT        NOT NULL DEFAULT '',
  address_line2 TEXT        NOT NULL DEFAULT '',
  town          TEXT        NOT NULL DEFAULT '',
  county        TEXT        NOT NULL DEFAULT '',
  postcode      TEXT        NOT NULL DEFAULT '',
  notes         TEXT        NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_takeoff_clients_user ON takeoff_clients(user_id);

ALTER TABLE takeoff_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own takeoff clients"
  ON takeoff_clients FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
