-- ============================================================
-- Quote templates: a named, ready-made set of sub-phases picked from Back Office > Phases & Tasks
-- (e.g. "Rear Extension – Lean-to roof"). A template only remembers WHICH sub-phases are in it; every price, task and calculator
-- comes from Phases & Tasks, so changing a rate there changes every template and every new quote. Order follows Phases & Tasks.
-- Only the company's own login(s) can see or change them. Safe to run more than once. Staging first, then live.
-- (Without this table the app still works; the Templates screen just says it needs this update.)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.quote_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  base_job_type TEXT,
  sub_phase_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_templates_user ON public.quote_templates (user_id);

ALTER TABLE public.quote_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own quote templates" ON public.quote_templates;
CREATE POLICY "Own quote templates" ON public.quote_templates
  FOR ALL TO authenticated
  USING (user_id = get_effective_owner_id())
  WITH CHECK (user_id = get_effective_owner_id());
