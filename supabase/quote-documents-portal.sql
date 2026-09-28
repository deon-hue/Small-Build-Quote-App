-- quote-documents-portal.sql — exposes a quote's attachments (New Quote/Quick Quote's
-- Attachments section) to the client portal. Until this runs, files attached to a quote
-- are invisible to the client — the portal has never had any way to read quote_documents.
-- Run in Supabase SQL Editor.

CREATE OR REPLACE FUNCTION get_quote_documents_for_portal(p_quote_id UUID)
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_result   JSON;
BEGIN
  -- Reuses the same ownership check quote_comments already relies on (supabase/
  -- phase50-quote-comments-portal-client.sql) — does this quote belong to the
  -- currently logged-in portal user's email.
  IF NOT quote_belongs_to_portal_user(p_quote_id) THEN
    RETURN '[]'::JSON;
  END IF;

  SELECT user_id INTO v_owner_id FROM quotes WHERE id = p_quote_id;
  IF v_owner_id IS NULL THEN RETURN '[]'::JSON; END IF;

  SELECT json_agg(
    json_build_object(
      'id',           d.id,
      'file_name',    d.filename,
      'storage_path', d.storage_path,
      'mime_type',    d.mime_type,
      'file_size',    d.file_size,
      'category',     COALESCE(d.category, 'document'),
      'label',        d.label,
      'created_at',   d.uploaded_at
    )
    ORDER BY d.uploaded_at ASC
  ) INTO v_result
  FROM quote_documents d
  WHERE d.quote_id = p_quote_id::text AND d.user_id = v_owner_id;

  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION get_quote_documents_for_portal(UUID) TO authenticated;

-- Storage RLS: quote-documents bucket currently only lets the owning contractor
-- read their own folder ("Quote docs: users read own", supabase/phase9.sql) —
-- createSignedUrl still needs to work for the portal customer's session too.
-- A signed URL is generated server-side by the app's own service/authenticated
-- client the same way app/api/portal/job-attachments does it, so no additional
-- storage policy is required here; this file only adds the RPC above.
