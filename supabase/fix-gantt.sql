-- ============================================================
-- Fix: Portal Gantt Chart Updates
-- Run this in Supabase SQL Editor if the customer portal Gantt
-- chart is not reflecting changes made in the admin Gantt view.
--
-- This re-creates get_portal_data() with the gantt_state join.
-- Safe to run multiple times (CREATE OR REPLACE).
-- ============================================================

CREATE OR REPLACE FUNCTION get_portal_data()
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email    TEXT;
  v_admin_id UUID;
  v_profile  RECORD;
  v_quotes   JSON;
  v_jobs     JSON;
  v_invoices JSON;
  v_settings JSON;
BEGIN
  -- Get user email
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  -- Get profile
  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'no_profile');
  END IF;
  IF v_profile.role <> 'customer' THEN
    RETURN json_build_object('error', 'not_customer');
  END IF;

  v_admin_id := v_profile.admin_user_id;
  IF v_admin_id IS NULL THEN
    RETURN json_build_object('error', 'no_admin_linked', 'email', v_email);
  END IF;

  -- Quotes where customer.email matches
  SELECT json_agg(q ORDER BY q.created_at DESC) INTO v_quotes
  FROM quotes q
  WHERE q.user_id = v_admin_id
    AND LOWER((q.customer->>'email')::TEXT) = LOWER(v_email);

  -- Jobs (with embedded gantt_state) where client name matches a client record with this email
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
      'created_at',  j.created_at,
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
        AND LOWER(c.email) = LOWER(v_email)
        AND (
          LOWER(j.client) = LOWER(c.name)
          OR LOWER(j.client) = LOWER(
               TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,''))
             )
          OR (
               c.last_name IS NOT NULL
               AND c.last_name <> ''
               AND LOWER(j.client) LIKE '%' || LOWER(c.last_name) || '%'
             )
        )
    );

  -- Invoices where client_email matches
  SELECT json_agg(i ORDER BY i.created_at DESC) INTO v_invoices
  FROM invoices i
  WHERE i.user_id = v_admin_id
    AND LOWER(i.client_email) = LOWER(v_email);

  -- Company settings (public info only)
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
    'quotes',   COALESCE(v_quotes,   '[]'::json),
    'jobs',     COALESCE(v_jobs,     '[]'::json),
    'invoices', COALESCE(v_invoices, '[]'::json),
    'settings', COALESCE(v_settings, '{}'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_portal_data() TO authenticated;

-- ============================================================
-- Dedicated Gantt-state fetcher for the portal.
-- Returns ALL gantt states that belong to the customer's admin,
-- keyed by job_id.  Much simpler than get_portal_data() and
-- guaranteed to be up-to-date without re-running phase3.sql.
-- ============================================================
CREATE OR REPLACE FUNCTION get_gantt_states_for_portal()
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile  RECORD;
  v_admin_id UUID;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
  IF NOT FOUND OR v_profile.role <> 'customer' THEN
    RETURN '[]'::json;
  END IF;
  v_admin_id := v_profile.admin_user_id;
  IF v_admin_id IS NULL THEN RETURN '[]'::json; END IF;

  RETURN (
    SELECT COALESCE(
      json_agg(json_build_object(
        'job_id', gs.job_id,
        'state',  gs.state
      )),
      '[]'::json
    )
    FROM gantt_states gs
    WHERE gs.user_id = v_admin_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_gantt_states_for_portal() TO authenticated;
