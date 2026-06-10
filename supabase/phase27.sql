-- phase27.sql — Job attachments (client-visible files: plans, photos, documents)
-- Run in Supabase SQL Editor

-- ── 1. Table ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id        UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  file_name     TEXT NOT NULL DEFAULT '',
  storage_path  TEXT NOT NULL DEFAULT '',
  mime_type     TEXT NOT NULL DEFAULT '',
  file_size     BIGINT NOT NULL DEFAULT 0,
  category      TEXT NOT NULL DEFAULT 'document',  -- 'document' | 'plan' | 'photo'
  label         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE job_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own job_attachments" ON job_attachments;
CREATE POLICY "Own job_attachments" ON job_attachments
  FOR ALL USING (user_id = auth.uid());

-- ── 3. Index ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS job_attachments_job_id_idx ON job_attachments(job_id);

-- ── 4. Portal RPC — SECURITY DEFINER so customer can read their job's files ──
CREATE OR REPLACE FUNCTION get_job_attachments_for_portal(p_job_id UUID)
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email    TEXT;
  v_admin_id UUID;
  v_result   JSON;
BEGIN
  -- Identify the portal customer
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN RETURN '[]'::JSON; END IF;

  -- Verify this customer has access to the job (same logic as get_portal_data)
  SELECT j.user_id INTO v_admin_id
  FROM jobs j
  WHERE j.id = p_job_id
    AND EXISTS (
      SELECT 1 FROM clients c
      WHERE c.user_id = j.user_id
        AND LOWER(c.email) = LOWER(v_email)
        AND (
          LOWER(j.client) = LOWER(c.name)
          OR LOWER(j.client) = LOWER(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')))
          OR (c.last_name IS NOT NULL AND c.last_name <> ''
              AND LOWER(j.client) LIKE '%' || LOWER(c.last_name) || '%')
        )
    )
  LIMIT 1;

  IF v_admin_id IS NULL THEN RETURN '[]'::JSON; END IF;

  SELECT json_agg(
    json_build_object(
      'id',           a.id,
      'file_name',    a.file_name,
      'storage_path', a.storage_path,
      'mime_type',    a.mime_type,
      'file_size',    a.file_size,
      'category',     a.category,
      'label',        a.label,
      'created_at',   a.created_at
    )
    ORDER BY a.created_at ASC
  ) INTO v_result
  FROM job_attachments a
  WHERE a.job_id = p_job_id AND a.user_id = v_admin_id;

  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION get_job_attachments_for_portal(UUID) TO authenticated;
