-- ============================================================
-- Back Office: standard phases, sub-phases and tasks that were deleted on purpose.
-- Back Office checks its built-in list every time it opens and puts back anything that is missing. This remembers the standard items you deleted so
-- they are not put back. They can be restored from the "Deleted standard items" list at the bottom of Phases & Tasks.
-- Only the company's own login(s) can see or change them. Safe to run more than once. Staging first, then live.
-- (Without this table the app still works, but deleted standard items can come back when Back Office opens.)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bo_deleted_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('phase', 'sub_phase', 'task')),
  canonical_id TEXT NOT NULL,
  name         TEXT,
  deleted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, canonical_id)
);

CREATE INDEX IF NOT EXISTS idx_bo_deleted_items_user ON public.bo_deleted_items (user_id);

ALTER TABLE public.bo_deleted_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own deleted back office items" ON public.bo_deleted_items;
CREATE POLICY "Own deleted back office items" ON public.bo_deleted_items
  FOR ALL TO authenticated
  USING (user_id = get_effective_owner_id())
  WITH CHECK (user_id = get_effective_owner_id());
