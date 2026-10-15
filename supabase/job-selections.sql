-- job-selections.sql — the client portal's "Selections" (an ideas board): a client adds the things they have chosen for their home (skirting, light fittings, tiles, taps…)
-- with photos, a link and notes, and the builder sees them on the job, sets a status and replies. It becomes the record of what was specified and installed.
--
--   job_selections       one row per item, for one job. user_id is the builder (the company owner), job_id the job.
--   job_selection_files  the photos / PDFs of an item (the files themselves are in the job-documents storage bucket, under <owner>/selections/…).
--
-- Builders (and their team) read and change these directly, protected by row security like everything else of theirs.
-- A CLIENT has no direct access to either table. Everything a client does goes through the portal_* functions below, which check that the signed-in portal customer
-- really is the client of that job (the same test the portal already uses for a job's files: their email on a Contact whose name matches the job's client), and only
-- ever let them add and change their OWN items while the item is still an idea or a choice. Files go through the app's server (portal routes), never straight to storage.
--
-- Needs the jobs and clients tables and get_effective_owner_id() (already there). Safe to run more than once. Staging first, then live.
-- (Until this has been run, the Selections tab and window say so and nothing else in the app changes.)

CREATE TABLE IF NOT EXISTS public.job_selections (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id              UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  title               TEXT NOT NULL DEFAULT '',
  room                TEXT NOT NULL DEFAULT '',
  category            TEXT NOT NULL DEFAULT 'other',
  details             TEXT NOT NULL DEFAULT '',
  link                TEXT NOT NULL DEFAULT '',
  supplied_by         TEXT NOT NULL DEFAULT 'unsure' CHECK (supplied_by IN ('client', 'builder', 'unsure')),
  needed_by           DATE,
  status              TEXT NOT NULL DEFAULT 'idea' CHECK (status IN ('idea', 'chosen', 'checked', 'ordered', 'delivered', 'installed')),
  builder_reply       TEXT NOT NULL DEFAULT '',
  builder_replied_at  TIMESTAMPTZ,
  added_by            TEXT NOT NULL DEFAULT 'client' CHECK (added_by IN ('client', 'builder')),
  client_updated_at   TIMESTAMPTZ,
  builder_seen_at     TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_job_selections_job  ON public.job_selections (job_id);
CREATE INDEX IF NOT EXISTS idx_job_selections_user ON public.job_selections (user_id);

CREATE TABLE IF NOT EXISTS public.job_selection_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  selection_id  UUID NOT NULL REFERENCES public.job_selections(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL,
  file_name     TEXT NOT NULL DEFAULT '',
  mime_type     TEXT NOT NULL DEFAULT '',
  file_size     INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_job_selection_files_sel ON public.job_selection_files (selection_id);

ALTER TABLE public.job_selections      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_selection_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own job selections" ON public.job_selections;
-- (An item can only be written against a job that belongs to the same builder: nobody can attach rows to someone else's job.)
CREATE POLICY "Own job selections" ON public.job_selections
  FOR ALL TO authenticated
  USING (user_id = get_effective_owner_id())
  WITH CHECK (user_id = get_effective_owner_id() AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.user_id = job_selections.user_id));

DROP POLICY IF EXISTS "Own job selection files" ON public.job_selection_files;
CREATE POLICY "Own job selection files" ON public.job_selection_files
  FOR ALL TO authenticated
  USING (user_id = get_effective_owner_id())
  WITH CHECK (user_id = get_effective_owner_id() AND EXISTS (SELECT 1 FROM public.job_selections s WHERE s.id = selection_id AND s.user_id = job_selection_files.user_id));

-- ── The portal client's side ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────

-- Is the signed-in portal customer the client of this job? Returns the builder (company owner) of the job, or NULL. Same test the portal uses for a job's files.
CREATE OR REPLACE FUNCTION public.portal_selection_job_owner(p_job_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_owner UUID;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN RETURN NULL; END IF;
  SELECT j.user_id INTO v_owner
  FROM jobs j
  WHERE j.id = p_job_id
    AND EXISTS (
      SELECT 1 FROM clients c
      WHERE c.user_id = j.user_id
        AND LOWER(c.email) = LOWER(v_email)
        AND (
          LOWER(j.client) = LOWER(c.name)
          OR LOWER(j.client) = LOWER(TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')))
          OR (c.last_name IS NOT NULL AND c.last_name <> '' AND LOWER(j.client) LIKE '%' || LOWER(c.last_name) || '%')
        )
    )
  LIMIT 1;
  RETURN v_owner;
END;
$$;

-- This client's items for one job, with their files (the paths are signed by the server before the client sees them).
CREATE OR REPLACE FUNCTION public.portal_list_selections(p_job_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_owner UUID := portal_selection_job_owner(p_job_id);
BEGIN
  IF v_owner IS NULL THEN RETURN '[]'::JSON; END IF;
  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'id', s.id, 'job_id', s.job_id, 'title', s.title, 'room', s.room, 'category', s.category, 'details', s.details, 'link', s.link,
      'supplied_by', s.supplied_by, 'needed_by', s.needed_by, 'status', s.status, 'builder_reply', s.builder_reply, 'builder_replied_at', s.builder_replied_at,
      'added_by', s.added_by, 'created_at', s.created_at,
      'files', COALESCE((
        SELECT json_agg(json_build_object('id', f.id, 'file_name', f.file_name, 'mime_type', f.mime_type, 'file_size', f.file_size, 'storage_path', f.storage_path) ORDER BY f.created_at)
        FROM job_selection_files f WHERE f.selection_id = s.id
      ), '[]'::json)
    ) ORDER BY s.created_at DESC)
    FROM job_selections s
    WHERE s.job_id = p_job_id AND s.user_id = v_owner
  ), '[]'::json);
END;
$$;

-- Add (p_id NULL) or change one of the client's own items. A change to an item the builder has already checked sends it back to "chosen" for another look.
CREATE OR REPLACE FUNCTION public.portal_save_selection(
  p_job_id UUID, p_id UUID, p_title TEXT, p_room TEXT, p_category TEXT, p_details TEXT, p_link TEXT, p_supplied_by TEXT, p_needed_by DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID := portal_selection_job_owner(p_job_id);
  v_title TEXT := LEFT(TRIM(COALESCE(p_title, '')), 120);
  v_link  TEXT := LEFT(TRIM(COALESCE(p_link, '')), 500);
  v_by    TEXT := CASE WHEN p_supplied_by IN ('client', 'builder', 'unsure') THEN p_supplied_by ELSE 'unsure' END;
  v_id    UUID;
BEGIN
  IF v_owner IS NULL THEN RAISE EXCEPTION 'You do not have access to this job.'; END IF;
  IF v_title = '' THEN RAISE EXCEPTION 'Please say what the item is.'; END IF;
  IF v_link <> '' AND v_link !~* '^https?://[^[:space:]]+$' THEN RAISE EXCEPTION 'The link must start with http:// or https://'; END IF;

  IF p_id IS NULL THEN
    IF (SELECT COUNT(*) FROM job_selections WHERE job_id = p_job_id AND user_id = v_owner) >= 300 THEN RAISE EXCEPTION 'There are too many items on this job already.'; END IF;
    INSERT INTO job_selections (user_id, job_id, title, room, category, details, link, supplied_by, needed_by, status, added_by, client_updated_at, builder_seen_at)
    VALUES (v_owner, p_job_id, v_title, LEFT(TRIM(COALESCE(p_room, '')), 60), LEFT(TRIM(COALESCE(p_category, 'other')), 40), LEFT(TRIM(COALESCE(p_details, '')), 2000), v_link, v_by, p_needed_by, 'idea', 'client', now(), NULL)
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  UPDATE job_selections s SET
    title = v_title, room = LEFT(TRIM(COALESCE(p_room, '')), 60), category = LEFT(TRIM(COALESCE(p_category, 'other')), 40),
    details = LEFT(TRIM(COALESCE(p_details, '')), 2000), link = v_link, supplied_by = v_by, needed_by = p_needed_by,
    status = CASE WHEN s.status = 'checked' THEN 'chosen' ELSE s.status END,
    client_updated_at = now(), builder_seen_at = NULL, updated_at = now()
  WHERE s.id = p_id AND s.job_id = p_job_id AND s.user_id = v_owner AND s.added_by = 'client' AND s.status IN ('idea', 'chosen', 'checked')
  RETURNING s.id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'This item cannot be changed any more.'; END IF;
  RETURN v_id;
END;
$$;

-- The client says "I have decided" (chosen) or "still an idea". Nothing past that is theirs to set.
CREATE OR REPLACE FUNCTION public.portal_set_selection_status(p_id UUID, p_status TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job UUID;
  v_uid UUID;
  v_n   INTEGER;
BEGIN
  IF p_status NOT IN ('idea', 'chosen') THEN RAISE EXCEPTION 'That status is set by your builder.'; END IF;
  SELECT job_id, user_id INTO v_job, v_uid FROM job_selections WHERE id = p_id;
  IF v_job IS NULL OR portal_selection_job_owner(v_job) IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'You do not have access to this item.'; END IF;
  UPDATE job_selections SET status = p_status, client_updated_at = now(), builder_seen_at = NULL, updated_at = now()
  WHERE id = p_id AND added_by = 'client' AND status IN ('idea', 'chosen');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'This item cannot be changed any more.'; END IF;
END;
$$;

-- Delete one of the client's own items while it is still an idea or a choice. Returns the storage paths of its files so the server can remove them.
CREATE OR REPLACE FUNCTION public.portal_delete_selection(p_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job   UUID;
  v_uid   UUID;
  v_paths JSON;
  v_n     INTEGER;
BEGIN
  SELECT job_id, user_id INTO v_job, v_uid FROM job_selections WHERE id = p_id;
  IF v_job IS NULL OR portal_selection_job_owner(v_job) IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'You do not have access to this item.'; END IF;
  SELECT COALESCE(json_agg(storage_path), '[]'::json) INTO v_paths FROM job_selection_files WHERE selection_id = p_id;
  DELETE FROM job_selections WHERE id = p_id AND added_by = 'client' AND status IN ('idea', 'chosen');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'This item cannot be deleted any more.'; END IF;
  RETURN v_paths;
END;
$$;

-- Before a file is uploaded: may this client add a file to this item? Returns where it belongs (the builder and job), or NULL.
CREATE OR REPLACE FUNCTION public.portal_selection_file_target(p_selection_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_job UUID;
  v_uid UUID;
  v_st  TEXT;
  v_by  TEXT;
BEGIN
  SELECT job_id, user_id, status, added_by INTO v_job, v_uid, v_st, v_by FROM job_selections WHERE id = p_selection_id;
  IF v_job IS NULL OR portal_selection_job_owner(v_job) IS DISTINCT FROM v_uid THEN RETURN NULL; END IF;
  IF v_by <> 'client' OR v_st NOT IN ('idea', 'chosen', 'checked') THEN RETURN NULL; END IF;
  IF (SELECT COUNT(*) FROM job_selection_files WHERE selection_id = p_selection_id) >= 8 THEN RETURN NULL; END IF;
  RETURN json_build_object('owner', v_uid, 'job_id', v_job);
END;
$$;

-- Record an uploaded file. The path must be exactly where the server put it for THIS item, so a client cannot point at someone else's file.
CREATE OR REPLACE FUNCTION public.portal_add_selection_file(p_selection_id UUID, p_path TEXT, p_name TEXT, p_mime TEXT, p_size INTEGER)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t  JSON := portal_selection_file_target(p_selection_id);
  v_id UUID;
BEGIN
  IF v_t IS NULL THEN RAISE EXCEPTION 'You cannot add a file to this item.'; END IF;
  IF p_path IS NULL OR LEFT(p_path, LENGTH((v_t->>'owner') || '/selections/' || (v_t->>'job_id') || '/' || p_selection_id::text || '/')) <> ((v_t->>'owner') || '/selections/' || (v_t->>'job_id') || '/' || p_selection_id::text || '/')
     OR p_path LIKE '%..%' THEN
    RAISE EXCEPTION 'That file is not in the right place.';
  END IF;
  INSERT INTO job_selection_files (selection_id, user_id, storage_path, file_name, mime_type, file_size)
  VALUES (p_selection_id, (v_t->>'owner')::uuid, p_path, LEFT(COALESCE(p_name, ''), 200), LEFT(COALESCE(p_mime, ''), 100), GREATEST(COALESCE(p_size, 0), 0))
  RETURNING id INTO v_id;
  UPDATE job_selections SET client_updated_at = now(), builder_seen_at = NULL, updated_at = now() WHERE id = p_selection_id;
  RETURN v_id;
END;
$$;

-- Remove one of the client's own files while the item is still theirs to change. Returns its storage path so the server can delete the file.
CREATE OR REPLACE FUNCTION public.portal_remove_selection_file(p_file_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sel  UUID;
  v_path TEXT;
BEGIN
  SELECT selection_id, storage_path INTO v_sel, v_path FROM job_selection_files WHERE id = p_file_id;
  IF v_sel IS NULL THEN RETURN NULL; END IF;
  -- the target check also needs room for one more file, so look at access and status directly
  IF NOT EXISTS (
    SELECT 1 FROM job_selections s
    WHERE s.id = v_sel AND portal_selection_job_owner(s.job_id) IS NOT DISTINCT FROM s.user_id AND s.user_id IS NOT NULL
      AND s.added_by = 'client' AND s.status IN ('idea', 'chosen', 'checked')
  ) THEN RAISE EXCEPTION 'You cannot change this item any more.'; END IF;
  DELETE FROM job_selection_files WHERE id = p_file_id;
  RETURN v_path;
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_selection_job_owner(UUID)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_list_selections(UUID)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_save_selection(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_set_selection_status(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_delete_selection(UUID)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_selection_file_target(UUID)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_add_selection_file(UUID, TEXT, TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_remove_selection_file(UUID)    TO authenticated;

-- ── Alerts: a new kind of notification the builder can switch on or off (Settings > Notifications) ─────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.notification_prefs') IS NOT NULL THEN
    ALTER TABLE public.notification_prefs ADD COLUMN IF NOT EXISTS selections BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;
