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
