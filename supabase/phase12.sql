-- ============================================================
-- Phase 12 — Canonical IDs for Back Office sync
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
-- Adds a canonical_id column to bo_phases, bo_sub_phases and bo_tasks.
-- This is a stable string key (e.g. 'phase_ext_walls', 'demo-structural')
-- that links each row back to its definition in the product lib files.
--
-- The sync function (syncBackOfficeFromProduct) uses this to:
--   • Match existing rows without touching customer-set rates/markups
--   • Insert brand-new rows when a phase/task is added in code
--   • Update names when a phase/task is renamed in code
--   • Never delete rows (customer may have added their own)
-- ============================================================

ALTER TABLE bo_phases     ADD COLUMN IF NOT EXISTS canonical_id TEXT;
ALTER TABLE bo_sub_phases ADD COLUMN IF NOT EXISTS canonical_id TEXT;
ALTER TABLE bo_tasks      ADD COLUMN IF NOT EXISTS canonical_id TEXT;

-- Unique per user so ON CONFLICT works correctly
CREATE UNIQUE INDEX IF NOT EXISTS uq_bo_phases_canon
  ON bo_phases(user_id, canonical_id) WHERE canonical_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bo_sub_phases_canon
  ON bo_sub_phases(user_id, canonical_id) WHERE canonical_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bo_tasks_canon
  ON bo_tasks(user_id, canonical_id) WHERE canonical_id IS NOT NULL;
