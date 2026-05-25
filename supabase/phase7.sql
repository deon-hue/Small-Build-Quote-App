-- ============================================================
-- Phase 7: Admin Portal Preview
-- Run this in Supabase SQL Editor
-- ============================================================

-- Returns portal data for a specific client email, called by
-- an authenticated admin.  Lets the admin preview exactly what
-- a customer would see in their portal without needing to sign
-- in as that customer.
CREATE OR REPLACE FUNCTION get_portal_preview_for_admin(p_client_email TEXT)
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id   UUID := auth.uid();
  v_client_name TEXT;
  v_quotes     JSON;
  v_jobs       JSON;
  v_invoices   JSON;
  v_settings   JSON;
BEGIN
  -- Resolve the client's display name
  SELECT name INTO v_client_name
  FROM clients
  WHERE user_id = v_admin_id
    AND LOWER(TRIM(email)) = LOWER(TRIM(p_client_email))
  LIMIT 1;

  -- Quotes where customer.email matches
  SELECT json_agg(q ORDER BY q.created_at DESC) INTO v_quotes
  FROM quotes q
  WHERE q.user_id = v_admin_id
    AND LOWER((q.customer->>'email')::TEXT) = LOWER(TRIM(p_client_email));

  -- Jobs linked to this client (with embedded gantt_state)
  SELECT json_agg(
    json_build_object(
      'id',          j.id,
      'client',      j.client,
      'type',        j.type,
      'address',     j.address,
      'value',       j.value,
      'stage',       j.stage,
      'start_date',  j.start_date,
      'weeks',       j.weeks,
      'done',        j.done,
      'notes',       j.notes,
      'quote_id',    j.quote_id,
      'gantt_state', (
        SELECT gs.state
        FROM gantt_states gs
        WHERE gs.job_id  = j.id
          AND gs.user_id = v_admin_id
        LIMIT 1
      )
    ) ORDER BY j.created_at ASC
  ) INTO v_jobs
  FROM jobs j
  WHERE j.user_id = v_admin_id
    AND EXISTS (
      SELECT 1 FROM clients c
      WHERE c.user_id = v_admin_id
        AND LOWER(TRIM(c.email)) = LOWER(TRIM(p_client_email))
        AND (
          LOWER(j.client) = LOWER(c.name)
          OR LOWER(j.client) = LOWER(
               TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,''))
             )
          OR (c.last_name IS NOT NULL
              AND c.last_name <> ''
              AND LOWER(j.client) LIKE '%' || LOWER(c.last_name) || '%')
        )
    );

  -- Invoices where client_email matches
  SELECT json_agg(i ORDER BY i.created_at DESC) INTO v_invoices
  FROM invoices i
  WHERE i.user_id = v_admin_id
    AND LOWER(TRIM(i.client_email)) = LOWER(TRIM(p_client_email));

  -- Company settings
  SELECT json_build_object(
    'name',    s.company_name,
    'tagline', s.tagline,
    'email',   s.email,
    'phone',   s.phone,
    'address', s.address,
    'logo',    s.logo
  ) INTO v_settings
  FROM settings s
  WHERE s.user_id = v_admin_id;

  RETURN json_build_object(
    'client_name', COALESCE(v_client_name, p_client_email),
    'quotes',      COALESCE(v_quotes,   '[]'::json),
    'jobs',        COALESCE(v_jobs,     '[]'::json),
    'invoices',    COALESCE(v_invoices, '[]'::json),
    'settings',    COALESCE(v_settings, '{}'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_portal_preview_for_admin(TEXT) TO authenticated;
