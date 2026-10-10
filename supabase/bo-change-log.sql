-- ============================================================
-- Back Office change history.
-- Every change made to a company's Phases & Tasks is recorded: what was added, renamed, moved, re-worded, changed or deleted (and restored),
-- the item and where it sits, what it was before and after, who did it, and the exact date and time. It is recorded by the database itself
-- (a trigger), so it happens whatever part of the app made the change and nobody can switch it off or edit it from the app.
--   • Standard items created by the automatic setup are not logged (they are not changes anyone made); items you add yourself are.
--   • Rapid repeats (typing a markup, for example) by the same person on the same item within two minutes are folded into one line.
--   • Read it in the Owner area: "Phase changes" (needs the owner-area SQL, which provides the owner checks).
-- Safe to run more than once. Staging first, then live.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bo_change_log (
  id           BIGSERIAL PRIMARY KEY,
  at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  owner_id     UUID NOT NULL,                 -- the company whose Phases & Tasks changed
  changed_by   UUID,                          -- who (auth.uid()); empty when the database itself did it
  table_name   TEXT NOT NULL,                 -- bo_phases | bo_sub_phases | bo_tasks | bo_deleted_items
  op           TEXT NOT NULL,                 -- insert | update | delete | restore
  row_id       UUID,
  canonical_id TEXT,
  item_name    TEXT,
  parent_name  TEXT,                          -- the main phase (for a sub-phase) or the sub-phase (for a task)
  changes      JSONB NOT NULL DEFAULT '{}'::jsonb   -- update: { column: { old, new } }; insert/delete: the item as it was
);

CREATE INDEX IF NOT EXISTS idx_bo_change_log_owner_at ON public.bo_change_log (owner_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_bo_change_log_row ON public.bo_change_log (row_id, at DESC);

ALTER TABLE public.bo_change_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own back office change log" ON public.bo_change_log;
CREATE POLICY "Own back office change log" ON public.bo_change_log
  FOR SELECT TO authenticated USING (owner_id = get_effective_owner_id());
-- no insert / update / delete policy: only the trigger below writes, and nobody can edit or remove a line
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.bo_change_log FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.bo_log_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_new     JSONB := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  v_old     JSONB := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  v_row     JSONB := COALESCE(v_new, v_old);
  v_skip    TEXT[] := ARRAY['updated_at', 'created_at', 'user_id', 'recipe_items'];
  v_changes JSONB := '{}'::jsonb;
  v_key     TEXT;
  v_parent  TEXT;
  v_last    RECORD;
  v_op      TEXT := lower(TG_OP);
BEGIN
  IF TG_TABLE_NAME = 'bo_deleted_items' THEN
    -- a standard item brought back: the line is the restore itself
    INSERT INTO bo_change_log (owner_id, changed_by, table_name, op, row_id, canonical_id, item_name, changes)
    VALUES ((v_old->>'user_id')::uuid, auth.uid(), TG_TABLE_NAME, 'restore', (v_old->>'id')::uuid, v_old->>'canonical_id', v_old->>'name',
            jsonb_build_object('kind', v_old->>'kind'));
    RETURN NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_new->>'canonical_id' IS NOT NULL THEN RETURN NULL; END IF;   -- standard rows made by the automatic setup are not changes anyone made
    v_changes := v_new - v_skip;
  ELSIF TG_OP = 'DELETE' THEN
    v_changes := v_old - v_skip;
  ELSE
    FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
      CONTINUE WHEN v_key = ANY(v_skip);
      IF v_new -> v_key IS DISTINCT FROM v_old -> v_key THEN
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('old', v_old -> v_key, 'new', v_new -> v_key));
      END IF;
    END LOOP;
    IF v_changes = '{}'::jsonb THEN RETURN NULL; END IF;   -- nothing that matters changed (for example only the time stamp)

    -- the same person changing the same thing again within two minutes: one line (first "old", latest "new")
    SELECT * INTO v_last FROM bo_change_log
      WHERE row_id = (v_row->>'id')::uuid AND op = 'update' AND changed_by IS NOT DISTINCT FROM auth.uid() AND at > now() - interval '2 minutes'
      ORDER BY id DESC LIMIT 1;
    IF FOUND
       AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v_last.changes) k) = (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v_changes) k) THEN
      UPDATE bo_change_log SET at = now(),
        changes = (SELECT jsonb_object_agg(k, jsonb_build_object('old', v_last.changes -> k -> 'old', 'new', v_changes -> k -> 'new')) FROM jsonb_object_keys(v_changes) k)
      WHERE id = v_last.id;
      RETURN NULL;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'bo_tasks' THEN
    SELECT name INTO v_parent FROM bo_sub_phases WHERE id = (v_row->>'sub_phase_id')::uuid;
  ELSIF TG_TABLE_NAME = 'bo_sub_phases' THEN
    SELECT name INTO v_parent FROM bo_phases WHERE id = (v_row->>'phase_id')::uuid;
  END IF;

  INSERT INTO bo_change_log (owner_id, changed_by, table_name, op, row_id, canonical_id, item_name, parent_name, changes)
  VALUES ((v_row->>'user_id')::uuid, auth.uid(), TG_TABLE_NAME, v_op, (v_row->>'id')::uuid, v_row->>'canonical_id', v_row->>'name', v_parent, v_changes);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS bo_phases_log ON public.bo_phases;
CREATE TRIGGER bo_phases_log AFTER INSERT OR UPDATE OR DELETE ON public.bo_phases FOR EACH ROW EXECUTE FUNCTION public.bo_log_change();
DROP TRIGGER IF EXISTS bo_sub_phases_log ON public.bo_sub_phases;
CREATE TRIGGER bo_sub_phases_log AFTER INSERT OR UPDATE OR DELETE ON public.bo_sub_phases FOR EACH ROW EXECUTE FUNCTION public.bo_log_change();
DROP TRIGGER IF EXISTS bo_tasks_log ON public.bo_tasks;
CREATE TRIGGER bo_tasks_log AFTER INSERT OR UPDATE OR DELETE ON public.bo_tasks FOR EACH ROW EXECUTE FUNCTION public.bo_log_change();

DO $$
BEGIN
  IF to_regclass('public.bo_deleted_items') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS bo_deleted_items_log ON public.bo_deleted_items;
    CREATE TRIGGER bo_deleted_items_log AFTER DELETE ON public.bo_deleted_items FOR EACH ROW EXECUTE FUNCTION public.bo_log_change();
  END IF;
END $$;

-- ── For the Owner area: the history across every company (owner checks come from owner-area.sql) ────────────────
CREATE OR REPLACE FUNCTION public.owner_bo_change_log(p_limit INTEGER DEFAULT 300)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
  PERFORM _owner_require();
  RETURN COALESCE((
    SELECT json_agg(a ORDER BY a.at DESC, a.id DESC) FROM (
      SELECT l.id, l.at, l.table_name, l.op, l.canonical_id, l.item_name, l.parent_name, l.changes,
             (SELECT email FROM auth.users u WHERE u.id = l.changed_by) AS by_email,
             (SELECT company_name FROM settings s WHERE s.user_id = l.owner_id) AS company
      FROM bo_change_log l ORDER BY l.at DESC, l.id DESC LIMIT LEAST(GREATEST(COALESCE(p_limit, 300), 1), 1000)
    ) a
  ), '[]'::json);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bo_log_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.owner_bo_change_log(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_bo_change_log(integer) TO authenticated, service_role;
