-- ============================================================
-- Phase 43: Admin portal preview by client id (show everything)
-- Run this in the Supabase SQL Editor.
--
-- Why: the old preview matched a customer's data only by an exact
-- email match (quotes by customer.email, invoices by client_email,
-- jobs gated on the client email matching). Any mismatch — or a
-- client with no email — produced an empty portal.
--
-- This version is keyed on the CLIENT ID and matches their jobs /
-- quotes / invoices / variations by email OR name, so an admin can
-- always see everything that belongs to that customer.
-- ============================================================

-- Remove the old email-keyed version (replaced by the id-keyed one)
DROP FUNCTION IF EXISTS get_portal_preview_for_admin(TEXT);

CREATE OR REPLACE FUNCTION get_portal_preview_for_admin(p_client_id UUID)
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id        UUID := auth.uid();
  v_client          RECORD;
  v_email           TEXT;
  v_name            TEXT;
  v_last            TEXT;
  v_fullname        TEXT;
  v_client_settings JSON;
  v_quotes          JSON;
  v_jobs            JSON;
  v_invoices        JSON;
  v_settings        JSON;
  v_variations      JSON;
BEGIN
  -- Resolve the client (scoped to the calling admin for safety)
  SELECT * INTO v_client
  FROM clients
  WHERE id = p_client_id AND user_id = v_admin_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'client_not_found');
  END IF;

  v_email    := LOWER(TRIM(COALESCE(v_client.email, '')));
  v_name     := LOWER(TRIM(COALESCE(v_client.name, '')));
  v_last     := LOWER(TRIM(COALESCE(v_client.last_name, '')));
  v_fullname := LOWER(TRIM(COALESCE(v_client.first_name,'') || ' ' || COALESCE(v_client.last_name,'')));
  v_client_settings := COALESCE(v_client.portal_settings, '{}');

  -- Quotes: match on customer email OR customer name
  SELECT json_agg(q ORDER BY q.created_at DESC) INTO v_quotes
  FROM quotes q
  WHERE q.user_id = v_admin_id
    AND (
      (v_email <> '' AND LOWER(TRIM(q.customer->>'email')) = v_email)
      OR (v_name <> '' AND LOWER(TRIM(q.customer->>'name')) = v_name)
      OR (v_last <> '' AND LOWER(q.customer->>'name') LIKE '%' || v_last || '%')
    );

  -- Jobs: match on the job's client name
  SELECT json_agg(
    json_build_object(
      'id',          j.id,   'client',   j.client,
      'type',        j.type, 'address',  j.address,
      'value',       j.value,'stage',    j.stage,
      'start_date',  j.start_date,       'weeks',    j.weeks,
      'done',        j.done, 'notes',    j.notes,
      'quote_id',    j.quote_id,
      'gantt_state', (SELECT gs.state FROM gantt_states gs
                      WHERE gs.job_id = j.id AND gs.user_id = v_admin_id LIMIT 1)
    ) ORDER BY j.created_at ASC
  ) INTO v_jobs
  FROM jobs j
  WHERE j.user_id = v_admin_id
    AND (
      (v_name     <> '' AND LOWER(j.client) = v_name)
      OR (v_fullname <> '' AND LOWER(j.client) = v_fullname)
      OR (v_last   <> '' AND LOWER(j.client) LIKE '%' || v_last || '%')
    );

  -- Invoices: match on client email OR client name
  SELECT json_agg(i ORDER BY i.created_at DESC) INTO v_invoices
  FROM invoices i
  WHERE i.user_id = v_admin_id
    AND (
      (v_email <> '' AND LOWER(TRIM(i.client_email)) = v_email)
      OR (v_name <> '' AND LOWER(TRIM(i.client_name)) = v_name)
      OR (v_last <> '' AND LOWER(i.client_name) LIKE '%' || v_last || '%')
    );

  -- Variations for this customer's jobs (exclude drafts)
  SELECT json_agg(v ORDER BY v.created_at ASC) INTO v_variations
  FROM variations v
  WHERE v.user_id = v_admin_id
    AND v.status <> 'draft'
    AND EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.id = v.job_id AND j.user_id = v_admin_id
        AND (
          (v_name     <> '' AND LOWER(j.client) = v_name)
          OR (v_fullname <> '' AND LOWER(j.client) = v_fullname)
          OR (v_last   <> '' AND LOWER(j.client) LIKE '%' || v_last || '%')
        )
    );

  -- Company settings
  SELECT json_build_object(
    'name',    s.company_name, 'tagline', s.tagline,
    'email',   s.email,        'phone',   s.phone,
    'address', s.address,      'logo',    s.logo
  ) INTO v_settings FROM settings s WHERE s.user_id = v_admin_id;

  RETURN json_build_object(
    'client_name',     COALESCE(NULLIF(v_client.name, ''), v_client.email, 'Client'),
    'quotes',          COALESCE(v_quotes,          '[]'::json),
    'jobs',            COALESCE(v_jobs,            '[]'::json),
    'invoices',        COALESCE(v_invoices,        '[]'::json),
    'settings',        COALESCE(v_settings,        '{}'::json),
    'variations',      COALESCE(v_variations,      '[]'::json),
    'client_settings', COALESCE(v_client_settings, '{}'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_portal_preview_for_admin(UUID) TO authenticated;
