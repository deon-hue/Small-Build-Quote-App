-- ============================================================
-- Phase 13 — External Wall Types & Layers (Back Office master data)
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
-- Creates bo_wall_types and bo_wall_layers tables.
-- These replace the hardcoded WALL_MAKEUPS constant as the source
-- of truth for External Wall construction recipes.
--
-- canonical_id stores the original string key (e.g. 'cav_wall_partial')
-- so that existing takeoff projects continue to resolve correctly.
-- ============================================================

CREATE TABLE IF NOT EXISTS bo_wall_types (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID REFERENCES auth.users NOT NULL,
  canonical_id       TEXT,                          -- original string key for built-ins
  name               TEXT NOT NULL,
  client_description TEXT NOT NULL DEFAULT '',
  labour_hrs_per_m2  NUMERIC(6,3) NOT NULL DEFAULT 0,
  waste_percent      NUMERIC(5,2) NOT NULL DEFAULT 10,
  display_order      INTEGER NOT NULL DEFAULT 0,
  active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bo_wall_layers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users NOT NULL,
  wall_type_id    UUID REFERENCES bo_wall_types(id) ON DELETE CASCADE NOT NULL,
  canonical_id    TEXT,                              -- original string key for built-in layers
  name            TEXT NOT NULL,
  thickness_mm    NUMERIC(7,2) NOT NULL DEFAULT 0,
  unit            TEXT NOT NULL DEFAULT 'm²',        -- 'm²' | 'lm' | 'm³' | 'nr'
  qty_type        TEXT NOT NULL DEFAULT 'area',      -- LayerQtyType: area|volume|perimeter|count|ufh_pipe
  spacing_mm      NUMERIC(7,2),                      -- for ufh_pipe qty_type
  description     TEXT NOT NULL DEFAULT '',
  category        TEXT NOT NULL DEFAULT 'materials', -- labour|materials|plant|other
  default_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  display_order   INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bo_wall_types_user    ON bo_wall_types(user_id);
CREATE INDEX IF NOT EXISTS idx_bo_wall_layers_type   ON bo_wall_layers(wall_type_id);
CREATE INDEX IF NOT EXISTS idx_bo_wall_layers_user   ON bo_wall_layers(user_id);

-- Unique per user on canonical_id so sync can upsert safely
CREATE UNIQUE INDEX IF NOT EXISTS uq_bo_wall_types_canon
  ON bo_wall_types(user_id, canonical_id) WHERE canonical_id IS NOT NULL;

ALTER TABLE bo_wall_types  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bo_wall_layers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own wall types"
  ON bo_wall_types FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own wall layers"
  ON bo_wall_layers FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
