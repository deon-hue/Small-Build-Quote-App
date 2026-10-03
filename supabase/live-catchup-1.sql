-- live-catchup-1.sql — creates three tables the app uses but the LIVE database never got, because their original
-- migrations (phase13.sql, phase21.sql) were never run there. Found 2026-10-03 by comparing live against a staging
-- copy built from the repo's SQL. Until now the app's attempts to read/write these tables failed quietly:
--   • quote_intelligence  — what the AI quote reviewer learns from saved quotes
--   • bo_wall_types / bo_wall_layers — Back Office wall build-up library and the Take-off layer editor
-- Adds empty tables only; changes no existing data. Safe to run twice. Run in the Supabase SQL Editor on the LIVE project.

BEGIN;

-- ── Back Office wall types & layers (from phase13.sql) ───────────────────────
CREATE TABLE IF NOT EXISTS bo_wall_types (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID REFERENCES auth.users NOT NULL,
  canonical_id       TEXT,
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
  canonical_id    TEXT,
  name            TEXT NOT NULL,
  thickness_mm    NUMERIC(7,2) NOT NULL DEFAULT 0,
  unit            TEXT NOT NULL DEFAULT 'm²',
  qty_type        TEXT NOT NULL DEFAULT 'area',
  spacing_mm      NUMERIC(7,2),
  description     TEXT NOT NULL DEFAULT '',
  category        TEXT NOT NULL DEFAULT 'materials',
  default_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  display_order   INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bo_wall_types_user    ON bo_wall_types(user_id);
CREATE INDEX IF NOT EXISTS idx_bo_wall_layers_type   ON bo_wall_layers(wall_type_id);
CREATE INDEX IF NOT EXISTS idx_bo_wall_layers_user   ON bo_wall_layers(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bo_wall_types_canon
  ON bo_wall_types(user_id, canonical_id) WHERE canonical_id IS NOT NULL;

ALTER TABLE bo_wall_types  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bo_wall_layers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own wall types" ON bo_wall_types;
CREATE POLICY "Users manage own wall types"
  ON bo_wall_types FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own wall layers" ON bo_wall_layers;
CREATE POLICY "Users manage own wall layers"
  ON bo_wall_layers FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Quote intelligence (from phase21.sql) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quote_intelligence (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid        REFERENCES auth.users NOT NULL,
  quote_ref      text,
  job_type       text,
  parent_phase   text,
  phase_name     text        NOT NULL,
  sub_phase_name text,
  task_name      text,
  qty_value      numeric,
  qty_unit       text,
  labour_total        numeric DEFAULT 0,
  materials_total     numeric DEFAULT 0,
  plant_total         numeric DEFAULT 0,
  subcontract_total   numeric DEFAULT 0,
  other_total         numeric DEFAULT 0,
  total_sell          numeric DEFAULT 0,
  markup_pct          numeric,
  items_summary  jsonb   DEFAULT '[]',
  quote_outcome  text    DEFAULT 'completed',
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS qi_user_phase    ON public.quote_intelligence (user_id, phase_name);
CREATE INDEX IF NOT EXISTS qi_user_jobtype  ON public.quote_intelligence (user_id, job_type);

ALTER TABLE public.quote_intelligence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own intelligence" ON public.quote_intelligence;
CREATE POLICY "Users manage own intelligence"
  ON public.quote_intelligence FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMIT;
