-- ============================================================
-- Builder dashboard: remembers each login's card layout (which cards, in what order, what size) so it follows them to every computer and phone.
-- One row per login. Only that login can read or write it. Safe to run more than once. Staging first, then live.
-- (The dashboard still works without this: the layout is then remembered on that device only.)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.dashboard_layouts (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  layout     JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dashboard_layouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own dashboard layout" ON public.dashboard_layouts;
CREATE POLICY "Own dashboard layout" ON public.dashboard_layouts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
