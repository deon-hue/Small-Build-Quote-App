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
