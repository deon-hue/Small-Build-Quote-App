-- ============================================================
-- Subcontractor portal: JOB NOTES AND PHOTOS.
-- A subcontractor adds a note (and photos) against a job; it lands straight in that job's Activity Log (the job_notes table) for the builder,
-- marked with who wrote it. The subcontractor sees only THEIR OWN notes - never the builder's notes or anyone else's.
--
--   job_notes.author_name / author_contact_id   who wrote it (empty for the builder's own notes)
--   add_sub_job_note(job, text)                 the subcontractor adds a note (checked: signed-in subcontractor, job belongs to their builder, not finished)
--   get_my_job_notes()                          their own notes with their photo paths
--   sub_note_photo_target(note)                 used by the photo upload route: confirms the note is theirs and says where its photos go
-- Photos are uploaded by the server (api/sub-portal/note-photo) into the existing private job-documents bucket and listed in job_note_photos.
-- Safe to run more than once. Staging first, then live.
-- ============================================================

ALTER TABLE job_notes
  ADD COLUMN IF NOT EXISTS author_name       TEXT,
  ADD COLUMN IF NOT EXISTS author_contact_id UUID;

CREATE INDEX IF NOT EXISTS idx_job_notes_author_contact ON job_notes (author_contact_id) WHERE author_contact_id IS NOT NULL;

-- Who is the signed-in subcontractor? (builder, contact, name) - the same rule as the rest of the subcontractor portal. Internal only.
CREATE OR REPLACE FUNCTION _sub_note_context()
RETURNS TABLE (admin_id UUID, contact_id UUID, contact_name TEXT)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT p.admin_user_id, c.id,
         COALESCE(NULLIF(btrim(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), ''), c.name)
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  JOIN clients c ON c.user_id = p.admin_user_id AND lower(c.email) = lower(u.email) AND c.client_type = 'subcontractor'
  WHERE p.id = auth.uid() AND p.role = 'subcontractor' AND p.admin_user_id IS NOT NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION add_sub_job_note(p_job_id TEXT, p_note TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ctx  RECORD;
  v_text TEXT := btrim(COALESCE(p_note, ''));
  v_id   UUID;
BEGIN
  SELECT * INTO v_ctx FROM _sub_note_context();
  IF v_ctx.admin_id IS NULL THEN RAISE EXCEPTION 'Not a subcontractor account'; END IF;
  IF v_text = '' THEN RAISE EXCEPTION 'Please write a note'; END IF;
  IF length(v_text) > 4000 THEN RAISE EXCEPTION 'That note is too long'; END IF;
  -- the job must be one of their builder's current jobs
  IF NOT EXISTS (SELECT 1 FROM jobs j WHERE j.id::text = p_job_id AND j.user_id = v_ctx.admin_id AND j.stage <> 'complete' AND NOT COALESCE(j.archived, false)) THEN
    RAISE EXCEPTION 'That job is not available';
  END IF;
  -- a sensible daily limit
  IF (SELECT count(*) FROM job_notes n WHERE n.author_contact_id = v_ctx.contact_id AND n.created_at > now() - interval '1 day') >= 60 THEN
    RAISE EXCEPTION 'Too many notes today - please try again tomorrow';
  END IF;
  INSERT INTO job_notes (user_id, job_id, note, raw_note, source, author_name, author_contact_id)
  VALUES (v_ctx.admin_id, p_job_id, v_text, v_text, 'subcontractor', v_ctx.contact_name, v_ctx.contact_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION get_my_job_notes()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE v_ctx RECORD;
BEGIN
  SELECT * INTO v_ctx FROM _sub_note_context();
  IF v_ctx.admin_id IS NULL THEN RETURN json_build_object('error', 'not_subcontractor'); END IF;
  RETURN json_build_object('rows', COALESCE((
    SELECT json_agg(r ORDER BY r.created_at DESC) FROM (
      SELECT n.id, n.job_id, n.note, n.created_at,
             COALESCE((SELECT json_agg(json_build_object('id', ph.id, 'storage_path', ph.storage_path) ORDER BY ph.created_at)
                         FROM job_note_photos ph WHERE ph.note_id = n.id), '[]'::json) AS photos
      FROM job_notes n
      WHERE n.author_contact_id = v_ctx.contact_id AND n.user_id = v_ctx.admin_id
      ORDER BY n.created_at DESC
      LIMIT 200
    ) r
  ), '[]'::json));
END;
$$;

CREATE OR REPLACE FUNCTION sub_note_photo_target(p_note_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE
  v_ctx  RECORD;
  v_note RECORD;
BEGIN
  SELECT * INTO v_ctx FROM _sub_note_context();
  IF v_ctx.admin_id IS NULL THEN RETURN json_build_object('error', 'not_subcontractor'); END IF;
  SELECT n.id, n.job_id INTO v_note FROM job_notes n
   WHERE n.id = p_note_id AND n.author_contact_id = v_ctx.contact_id AND n.user_id = v_ctx.admin_id;
  IF NOT FOUND THEN RETURN json_build_object('error', 'not_found'); END IF;
  RETURN json_build_object('admin_id', v_ctx.admin_id, 'job_id', v_note.job_id,
                           'photo_count', (SELECT count(*) FROM job_note_photos ph WHERE ph.note_id = p_note_id));
END;
$$;

REVOKE EXECUTE ON FUNCTION _sub_note_context() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION add_sub_job_note(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_my_job_notes() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION sub_note_photo_target(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION add_sub_job_note(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_my_job_notes() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sub_note_photo_target(UUID) TO authenticated, service_role;
