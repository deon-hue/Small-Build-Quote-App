-- ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
-- │ STAGING SETUP — run this ONLY on the "BuildOS Staging" Supabase project.                       │
-- │ The check below stops it if it is pasted into the live database by mistake.                    │
-- └──────────────────────────────────────────────────────────────────────────────────────────────┘
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = 'deon@smallbuildcompany.com') THEN
    RAISE EXCEPTION 'STOP: this looks like the LIVE database (it has the live owner account). Nothing was changed.';
  END IF;
END
$guard$;


-- ═══════════════════════════════ back_office_master.sql ═══════════════════════════════
-- ============================================================
-- Small Build Company — Back Office Master Database
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Labour Trades Master
CREATE TABLE IF NOT EXISTS bo_labour_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  day_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  half_day_rate_override NUMERIC(10,2),
  markup_pct NUMERIC(5,2) NOT NULL DEFAULT 20,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Phases Master
CREATE TABLE IF NOT EXISTS bo_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  job_types TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sub-Phases Master
CREATE TABLE IF NOT EXISTS bo_sub_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  phase_id UUID REFERENCES bo_phases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  markup_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks Master
CREATE TABLE IF NOT EXISTS bo_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  phase_id UUID REFERENCES bo_phases(id) ON DELETE SET NULL,
  sub_phase_id UUID REFERENCES bo_sub_phases(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  client_description TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT 'item',
  default_qty NUMERIC(10,3) NOT NULL DEFAULT 1,
  labour_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  materials_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  plant_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  subcontract_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  waste_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  other_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  markup_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  trade_name TEXT,
  productivity_rate NUMERIC(10,3),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  from_takeoff BOOLEAN NOT NULL DEFAULT TRUE,
  from_ai BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Products / Materials Master
CREATE TABLE IF NOT EXISTS bo_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  unit TEXT NOT NULL DEFAULT 'item',
  default_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  supplier TEXT NOT NULL DEFAULT '',
  waste_pct NUMERIC(5,2) NOT NULL DEFAULT 10,
  markup_pct NUMERIC(5,2) NOT NULL DEFAULT 20,
  phase_id UUID REFERENCES bo_phases(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Plant / Equipment Master
CREATE TABLE IF NOT EXISTS bo_plant_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'day',
  default_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  markup_pct NUMERIC(5,2) NOT NULL DEFAULT 20,
  phase_id UUID REFERENCES bo_phases(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Takeoff Tools
CREATE TABLE IF NOT EXISTS bo_takeoff_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  phase_id UUID REFERENCES bo_phases(id) ON DELETE SET NULL,
  description TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Takeoff Tool Sub-types
CREATE TABLE IF NOT EXISTS bo_takeoff_subtypes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  tool_id UUID REFERENCES bo_takeoff_tools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tool-Task Mappings (what tasks get generated when a sub-type is measured)
CREATE TABLE IF NOT EXISTS bo_tool_task_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  subtype_id UUID REFERENCES bo_takeoff_subtypes(id) ON DELETE CASCADE,
  task_id UUID REFERENCES bo_tasks(id) ON DELETE CASCADE,
  quantity_formula TEXT NOT NULL DEFAULT 'measured_qty',
  waste_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  markup_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Formula Rules
CREATE TABLE IF NOT EXISTS bo_formula_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  expression TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]',
  description TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Scope Mappings
CREATE TABLE IF NOT EXISTS bo_ai_scope_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  keyword TEXT NOT NULL,
  phase_id UUID REFERENCES bo_phases(id) ON DELETE CASCADE,
  sub_phase_id UUID REFERENCES bo_sub_phases(id) ON DELETE SET NULL,
  task_id UUID REFERENCES bo_tasks(id) ON DELETE SET NULL,
  weight INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bo_labour_trades_user ON bo_labour_trades(user_id);
CREATE INDEX IF NOT EXISTS idx_bo_phases_user ON bo_phases(user_id);
CREATE INDEX IF NOT EXISTS idx_bo_sub_phases_user ON bo_sub_phases(user_id);
CREATE INDEX IF NOT EXISTS idx_bo_sub_phases_phase ON bo_sub_phases(phase_id);
CREATE INDEX IF NOT EXISTS idx_bo_tasks_user ON bo_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_bo_tasks_phase ON bo_tasks(phase_id);
CREATE INDEX IF NOT EXISTS idx_bo_tasks_sub_phase ON bo_tasks(sub_phase_id);
CREATE INDEX IF NOT EXISTS idx_bo_products_user ON bo_products(user_id);
CREATE INDEX IF NOT EXISTS idx_bo_plant_items_user ON bo_plant_items(user_id);
CREATE INDEX IF NOT EXISTS idx_bo_takeoff_tools_user ON bo_takeoff_tools(user_id);
CREATE INDEX IF NOT EXISTS idx_bo_takeoff_subtypes_tool ON bo_takeoff_subtypes(tool_id);
CREATE INDEX IF NOT EXISTS idx_bo_tool_task_mappings_subtype ON bo_tool_task_mappings(subtype_id);
CREATE INDEX IF NOT EXISTS idx_bo_formula_rules_user ON bo_formula_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_bo_ai_scope_mappings_user ON bo_ai_scope_mappings(user_id);

-- ── Row Level Security ─────────────────────────────────────────────────────────
ALTER TABLE bo_labour_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE bo_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE bo_sub_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE bo_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE bo_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE bo_plant_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bo_takeoff_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE bo_takeoff_subtypes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bo_tool_task_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bo_formula_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE bo_ai_scope_mappings ENABLE ROW LEVEL SECURITY;

-- RLS Policies (own data only)
CREATE POLICY "Users manage own labour trades" ON bo_labour_trades FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own phases" ON bo_phases FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own sub_phases" ON bo_sub_phases FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own tasks" ON bo_tasks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own products" ON bo_products FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own plant items" ON bo_plant_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own takeoff tools" ON bo_takeoff_tools FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own takeoff subtypes" ON bo_takeoff_subtypes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own tool task mappings" ON bo_tool_task_mappings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own formula rules" ON bo_formula_rules FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own ai scope mappings" ON bo_ai_scope_mappings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════ phase11.sql ═══════════════════════════════
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

-- ═══════════════════════════════ phase12.sql ═══════════════════════════════
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

-- ═══════════════════════════════ phase13.sql ═══════════════════════════════
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

-- ═══════════════════════════════ phase14.sql ═══════════════════════════════
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

-- ═══════════════════════════════ phase15.sql ═══════════════════════════════
-- Phase 15: Add recipe_items JSONB to bo_tasks
-- Stores the full 5-category cost recipe (LayerCostRecord) for each task.
-- This enables the Construction Layer Editor to pull BO defaults per layer/task.

ALTER TABLE public.bo_tasks
  ADD COLUMN IF NOT EXISTS recipe_items JSONB DEFAULT NULL;

COMMENT ON COLUMN public.bo_tasks.recipe_items IS
  'Full 5-category cost recipe stored as LayerCostRecord JSON: '
  '{ labourItems, materialItems, plantItems, subItems, otherItems }. '
  'Set when user saves a construction layer recipe to Back Office.';

-- ═══════════════════════════════ phase16.sql ═══════════════════════════════
-- Phase 16: Plant & Equipment master data foundation
-- 1) Extend bo_plant_items into a full plant record (single source of truth).
-- 2) Add forward-looking columns + skeleton tables for future plant features
--    (owned/hired, supplier hire rates, maintenance, availability, operators,
--     transport, fuel). Schema only — no features built on these yet.

-- ── 1. Extend bo_plant_items ──────────────────────────────────────────────────
-- default_cost is kept as the COST RATE (what the plant costs us).
-- charge_rate is the new SELL RATE (what we bill the client).

ALTER TABLE public.bo_plant_items
  ADD COLUMN IF NOT EXISTS category          TEXT    NOT NULL DEFAULT 'General',
  ADD COLUMN IF NOT EXISTS description        TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS charge_rate        NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier           TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS operator_required  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS notes              TEXT    NOT NULL DEFAULT '',
  -- forward-looking (future features; safe defaults, no UI yet)
  ADD COLUMN IF NOT EXISTS ownership          TEXT    NOT NULL DEFAULT 'hired',  -- 'hired' | 'owned'
  ADD COLUMN IF NOT EXISTS transport_cost     NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fuel_cost_per_unit NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Backfill charge_rate from cost + markup for any existing rows that have none.
UPDATE public.bo_plant_items
   SET charge_rate = ROUND(default_cost * (1 + markup_pct / 100.0), 2)
 WHERE charge_rate = 0 AND default_cost > 0;

CREATE INDEX IF NOT EXISTS idx_bo_plant_items_category ON public.bo_plant_items(user_id, category);

COMMENT ON COLUMN public.bo_plant_items.default_cost IS 'Cost rate — what the plant costs us (per unit).';
COMMENT ON COLUMN public.bo_plant_items.charge_rate  IS 'Charge rate — what we bill the client (per unit).';
COMMENT ON COLUMN public.bo_plant_items.ownership    IS 'hired | owned — reserved for future Owned/Hired Plant feature.';

-- ── 2. Future-feature skeleton tables (schema only) ───────────────────────────
-- Created now so later features (supplier rates, maintenance, availability,
-- operator assignments) can be built without further migrations to wire them up.

-- Supplier hire rates: multiple suppliers / rates per plant item.
CREATE TABLE IF NOT EXISTS public.bo_plant_supplier_rates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users NOT NULL,
  plant_item_id UUID REFERENCES public.bo_plant_items(id) ON DELETE CASCADE,
  supplier      TEXT NOT NULL DEFAULT '',
  unit          TEXT NOT NULL DEFAULT 'day',
  rate          NUMERIC(10,2) NOT NULL DEFAULT 0,
  min_hire_period TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Maintenance / service records (for owned plant).
CREATE TABLE IF NOT EXISTS public.bo_plant_maintenance (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users NOT NULL,
  plant_item_id UUID REFERENCES public.bo_plant_items(id) ON DELETE CASCADE,
  service_date  DATE,
  service_type  TEXT NOT NULL DEFAULT '',
  cost          NUMERIC(10,2) NOT NULL DEFAULT 0,
  next_due_date DATE,
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Availability calendar (booked / out / available windows).
CREATE TABLE IF NOT EXISTS public.bo_plant_availability (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users NOT NULL,
  plant_item_id UUID REFERENCES public.bo_plant_items(id) ON DELETE CASCADE,
  start_date    DATE,
  end_date      DATE,
  status        TEXT NOT NULL DEFAULT 'available',  -- available | booked | maintenance
  job_id        UUID,
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Operator assignments (who operates a plant item on a job).
CREATE TABLE IF NOT EXISTS public.bo_plant_operator_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users NOT NULL,
  plant_item_id UUID REFERENCES public.bo_plant_items(id) ON DELETE CASCADE,
  operator_name TEXT NOT NULL DEFAULT '',
  job_id        UUID,
  start_date    DATE,
  end_date      DATE,
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── RLS for the new tables ────────────────────────────────────────────────────
ALTER TABLE public.bo_plant_supplier_rates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bo_plant_maintenance             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bo_plant_availability            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bo_plant_operator_assignments    ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bo_plant_supplier_rates') THEN
    CREATE POLICY "Users manage own plant supplier rates" ON public.bo_plant_supplier_rates
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bo_plant_maintenance') THEN
    CREATE POLICY "Users manage own plant maintenance" ON public.bo_plant_maintenance
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bo_plant_availability') THEN
    CREATE POLICY "Users manage own plant availability" ON public.bo_plant_availability
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bo_plant_operator_assignments') THEN
    CREATE POLICY "Users manage own plant operator assignments" ON public.bo_plant_operator_assignments
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bo_plant_supplier_rates_item       ON public.bo_plant_supplier_rates(plant_item_id);
CREATE INDEX IF NOT EXISTS idx_bo_plant_maintenance_item          ON public.bo_plant_maintenance(plant_item_id);
CREATE INDEX IF NOT EXISTS idx_bo_plant_availability_item         ON public.bo_plant_availability(plant_item_id);
CREATE INDEX IF NOT EXISTS idx_bo_plant_operator_assignments_item ON public.bo_plant_operator_assignments(plant_item_id);

-- ═══════════════════════════════ phase17.sql ═══════════════════════════════
-- Phase 17: Document capture + job-cost ledger (Phase 1 of the doc-scan feature)
-- Scan/upload supplier docs (invoices, receipts, delivery notes), extract their
-- details, review, and save as actual costs against a job.
--
-- App is the system of record for job costing. The xero_* columns on job_costs
-- are reserved for the later Xero accounting push (no feature built on them yet).

-- ── Storage bucket for job documents ──────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'job-documents', 'job-documents', false, 15728640,  -- 15 MB
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/heic','image/tiff','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS — owner-only, keyed to the first path segment ({user_id}/...)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Job docs: users upload own') THEN
    CREATE POLICY "Job docs: users upload own" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'job-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Job docs: users read own') THEN
    CREATE POLICY "Job docs: users read own" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'job-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Job docs: users delete own') THEN
    CREATE POLICY "Job docs: users delete own" ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'job-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;

-- ── job_documents: uploaded file + raw extraction snapshot ────────────────────
CREATE TABLE IF NOT EXISTS public.job_documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users NOT NULL,
  job_id         UUID REFERENCES public.jobs(id)   ON DELETE CASCADE,
  quote_id       UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  file_name      TEXT NOT NULL DEFAULT '',
  storage_path   TEXT NOT NULL,
  mime_type      TEXT NOT NULL DEFAULT '',
  file_size      INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'uploaded',  -- uploaded | extracted | reviewed | error
  raw_extraction JSONB,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── job_costs: the actuals ledger (one row per cost line) ─────────────────────
CREATE TABLE IF NOT EXISTS public.job_costs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users NOT NULL,
  job_id         UUID REFERENCES public.jobs(id)   ON DELETE CASCADE,
  quote_id       UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  document_id    UUID REFERENCES public.job_documents(id) ON DELETE SET NULL,
  supplier       TEXT NOT NULL DEFAULT '',
  doc_date       DATE,
  doc_number     TEXT NOT NULL DEFAULT '',
  description    TEXT NOT NULL DEFAULT '',
  cost_category  TEXT NOT NULL DEFAULT 'materials',  -- labour | materials | plant | subcontractors | other
  net_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
  vat_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
  gross_amount   NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unknown',    -- unknown | unpaid | partial | paid
  source         TEXT NOT NULL DEFAULT 'document',   -- document | manual
  -- Reserved for Phase 4 Xero push (no UI yet):
  xero_invoice_id TEXT,
  xero_status     TEXT,
  synced_at       TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_documents_job  ON public.job_documents(user_id, job_id);
CREATE INDEX IF NOT EXISTS idx_job_costs_job      ON public.job_costs(user_id, job_id);
CREATE INDEX IF NOT EXISTS idx_job_costs_document ON public.job_costs(document_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.job_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_costs     ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_documents') THEN
    CREATE POLICY "Own job_documents" ON public.job_documents
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_costs') THEN
    CREATE POLICY "Own job_costs" ON public.job_costs
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ═══════════════════════════════ phase18.sql ═══════════════════════════════
-- Phase 18: Suppliers master list (alongside Clients)
-- App-side now; the xero_* columns are reserved for the later two-way
-- Xero Contacts sync (no sync built yet).

CREATE TABLE IF NOT EXISTS public.suppliers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users NOT NULL,
  name            TEXT NOT NULL DEFAULT '',   -- company / supplier name
  contact_name    TEXT NOT NULL DEFAULT '',   -- person to contact
  phone           TEXT NOT NULL DEFAULT '',
  email           TEXT NOT NULL DEFAULT '',
  address         TEXT NOT NULL DEFAULT '',
  notes           TEXT NOT NULL DEFAULT '',
  account_number  TEXT NOT NULL DEFAULT '',   -- our trade account ref with them
  added_from      TEXT NOT NULL DEFAULT 'manual',
  -- reserved for Phase 4 Xero contact sync:
  xero_contact_id TEXT,
  xero_synced_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'suppliers') THEN
    CREATE POLICY "Own suppliers" ON public.suppliers
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_suppliers_user ON public.suppliers(user_id);

-- ═══════════════════════════════ phase19.sql ═══════════════════════════════
-- Phase 19: Xero connection (OAuth2 token storage)
-- One connection per user. Tokens are protected by RLS (owner-only). Access
-- tokens are short-lived; the rotating refresh token is used to renew them.

CREATE TABLE IF NOT EXISTS public.xero_connections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users NOT NULL UNIQUE,
  tenant_id     TEXT NOT NULL DEFAULT '',
  tenant_name   TEXT NOT NULL DEFAULT '',
  access_token  TEXT NOT NULL DEFAULT '',
  refresh_token TEXT NOT NULL DEFAULT '',
  expires_at    TIMESTAMPTZ,
  scopes        TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.xero_connections ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'xero_connections') THEN
    CREATE POLICY "Own xero_connection" ON public.xero_connections
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ═══════════════════════════════ phase20.sql ═══════════════════════════════
-- Phase 20: Xero contact-sync link columns on clients
-- (suppliers already has xero_contact_id / xero_synced_at / updated_at from phase18)

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS xero_contact_id TEXT,
  ADD COLUMN IF NOT EXISTS xero_synced_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT NOW();

-- ═══════════════════════════════ phase21.sql ═══════════════════════════════
-- Phase 21: Quote Intelligence — learns from completed/accepted quotes
-- Stores extracted phase patterns so the AI reviewer gets smarter over time.

CREATE TABLE IF NOT EXISTS public.quote_intelligence (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid        REFERENCES auth.users NOT NULL,
  quote_ref      text,
  job_type       text,
  -- Phase hierarchy
  parent_phase   text,
  phase_name     text        NOT NULL,
  sub_phase_name text,
  task_name      text,
  -- Measurements (normalised for per-m² cost learning)
  qty_value      numeric,
  qty_unit       text,
  -- Cost totals
  labour_total        numeric DEFAULT 0,
  materials_total     numeric DEFAULT 0,
  plant_total         numeric DEFAULT 0,
  subcontract_total   numeric DEFAULT 0,
  other_total         numeric DEFAULT 0,
  total_sell          numeric DEFAULT 0,
  markup_pct          numeric,
  -- Items included — array of {category, desc} objects
  items_summary  jsonb   DEFAULT '[]',
  -- Quote outcome
  quote_outcome  text    DEFAULT 'completed',  -- 'won' | 'lost' | 'completed'
  created_at     timestamptz DEFAULT now()
);

-- Fast lookup by user + phase (used when fetching historical context)
CREATE INDEX IF NOT EXISTS qi_user_phase    ON public.quote_intelligence (user_id, phase_name);
CREATE INDEX IF NOT EXISTS qi_user_jobtype  ON public.quote_intelligence (user_id, job_type);

-- RLS
ALTER TABLE public.quote_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own intelligence"
  ON public.quote_intelligence FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
