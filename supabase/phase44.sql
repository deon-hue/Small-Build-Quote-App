-- ============================================================
-- Phase 44: Include manual/cash job payments in the portal
-- Run this in the Supabase SQL Editor.
--
-- Adds a `payments` array (from job_payments — cash / cheque /
-- bank transfer / other) to BOTH portal functions so the customer
-- portal can show every payment received, not just paid invoices,
-- and count them toward "Paid to Date" / "Balance Due".
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. get_portal_data  (the real customer portal)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_portal_data()
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email           TEXT;
  v_admin_id        UUID;
  v_profile         RECORD;
  v_quotes          JSON;
  v_jobs            JSON;
  v_invoices        JSON;
  v_settings        JSON;
  v_variations      JSON;
  v_payments        JSON;
  v_client_settings JSON;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'no_profile'); END IF;
  IF v_profile.role <> 'customer' THEN RETURN json_build_object('error', 'not_customer'); END IF;
  v_admin_id := v_profile.admin_user_id;
  IF v_admin_id IS NULL THEN
    RETURN json_build_object('error', 'no_admin_linked', 'email', v_email);
  END IF;

  SELECT COALESCE(portal_settings, '{}') INTO v_client_settings
  FROM clients
  WHERE user_id = v_admin_id
    AND LOWER(TRIM(email)) = LOWER(TRIM(v_email))
  LIMIT 1;

  SELECT json_agg(q ORDER BY q.created_at DESC) INTO v_quotes
  FROM quotes q
  WHERE q.user_id = v_admin_id
    AND LOWER((q.customer->>'email')::TEXT) = LOWER(v_email);

  SELECT json_agg(
    json_build_object(
      'id', j.id, 'client', j.client, 'type', j.type, 'address', j.address,
      'value', j.value, 'stage', j.stage, 'start_date', j.start_date,
      'weeks', j.weeks, 'done', j.done, 'notes', j.notes, 'quote_id', j.quote_id,
      'created_at', j.created_at,
      'gantt_state', (SELECT gs.state FROM gantt_states gs
                      WHERE gs.job_id = j.id AND gs.user_id = v_admin_id LIMIT 1)
    ) ORDER BY j.created_at ASC
  ) INTO v_jobs
  FROM jobs j
  WHERE j.user_id = v_admin_id
    AND EXISTS (
      SELECT 1 FROM clients c
      WHERE c.user_id = v_admin_id AND LOWER(c.email) = LOWER(v_email)
        AND (
          LOWER(j.client) = LOWER(c.name)
          OR LOWER(j.client) = LOWER(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')))
          OR (c.last_name IS NOT NULL AND c.last_name <> '' AND LOWER(j.client) LIKE '%' || LOWER(c.last_name) || '%')
        )
    );

  SELECT json_agg(i ORDER BY i.created_at DESC) INTO v_invoices
  FROM invoices i
  WHERE i.user_id = v_admin_id
    AND LOWER(i.client_email) = LOWER(v_email);

  SELECT json_agg(v ORDER BY v.created_at ASC) INTO v_variations
  FROM variations v
  WHERE v.user_id = v_admin_id
    AND v.status <> 'draft'
    AND EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.id = v.job_id AND j.user_id = v_admin_id
        AND EXISTS (
          SELECT 1 FROM clients c
          WHERE c.user_id = v_admin_id AND LOWER(c.email) = LOWER(v_email)
            AND (
              LOWER(j.client) = LOWER(c.name)
              OR LOWER(j.client) = LOWER(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')))
              OR (c.last_name IS NOT NULL AND c.last_name <> '' AND LOWER(j.client) LIKE '%' || LOWER(c.last_name) || '%')
            )
        )
    );

  -- Manual / cash payments recorded against this customer's jobs
  SELECT json_agg(
    json_build_object(
      'id', p.id, 'job_id', p.job_id, 'amount', p.amount,
      'payment_date', p.payment_date, 'method', p.method, 'notes', p.notes
    ) ORDER BY p.payment_date DESC
  ) INTO v_payments
  FROM job_payments p
  JOIN jobs j ON j.id = p.job_id AND j.user_id = v_admin_id
  WHERE p.user_id = v_admin_id
    AND EXISTS (
      SELECT 1 FROM clients c
      WHERE c.user_id = v_admin_id AND LOWER(c.email) = LOWER(v_email)
        AND (
          LOWER(j.client) = LOWER(c.name)
          OR LOWER(j.client) = LOWER(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')))
          OR (c.last_name IS NOT NULL AND c.last_name <> '' AND LOWER(j.client) LIKE '%' || LOWER(c.last_name) || '%')
        )
    );

  SELECT json_build_object(
    'name', s.company_name, 'tagline', s.tagline, 'email', s.email,
    'phone', s.phone, 'address', s.address, 'logo', s.logo
  ) INTO v_settings FROM settings s WHERE s.user_id = v_admin_id;

  RETURN json_build_object(
    'quotes',          COALESCE(v_quotes,          '[]'::json),
    'jobs',            COALESCE(v_jobs,            '[]'::json),
    'invoices',        COALESCE(v_invoices,        '[]'::json),
    'settings',        COALESCE(v_settings,        '{}'::json),
    'variations',      COALESCE(v_variations,      '[]'::json),
    'payments',        COALESCE(v_payments,        '[]'::json),
    'client_settings', COALESCE(v_client_settings, '{}'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_portal_data() TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 2. get_portal_preview_for_admin  (admin "View Portal")
-- ────────────────────────────────────────────────────────────
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
  v_payments        JSON;
BEGIN
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

  SELECT json_agg(q ORDER BY q.created_at DESC) INTO v_quotes
  FROM quotes q
  WHERE q.user_id = v_admin_id
    AND (
      (v_email <> '' AND LOWER(TRIM(q.customer->>'email')) = v_email)
      OR (v_name <> '' AND LOWER(TRIM(q.customer->>'name')) = v_name)
      OR (v_last <> '' AND LOWER(q.customer->>'name') LIKE '%' || v_last || '%')
    );

  SELECT json_agg(
    json_build_object(
      'id', j.id, 'client', j.client, 'type', j.type, 'address', j.address,
      'value', j.value, 'stage', j.stage, 'start_date', j.start_date,
      'weeks', j.weeks, 'done', j.done, 'notes', j.notes, 'quote_id', j.quote_id,
      'gantt_state', (SELECT gs.state FROM gantt_states gs
                      WHERE gs.job_id = j.id AND gs.user_id = v_admin_id LIMIT 1)
    ) ORDER BY j.created_at ASC
  ) INTO v_jobs
  FROM jobs j
  WHERE j.user_id = v_admin_id
    AND (
      (v_name <> '' AND LOWER(j.client) = v_name)
      OR (v_fullname <> '' AND LOWER(j.client) = v_fullname)
      OR (v_last <> '' AND LOWER(j.client) LIKE '%' || v_last || '%')
    );

  SELECT json_agg(i ORDER BY i.created_at DESC) INTO v_invoices
  FROM invoices i
  WHERE i.user_id = v_admin_id
    AND (
      (v_email <> '' AND LOWER(TRIM(i.client_email)) = v_email)
      OR (v_name <> '' AND LOWER(TRIM(i.client_name)) = v_name)
      OR (v_last <> '' AND LOWER(i.client_name) LIKE '%' || v_last || '%')
    );

  SELECT json_agg(v ORDER BY v.created_at ASC) INTO v_variations
  FROM variations v
  WHERE v.user_id = v_admin_id
    AND v.status <> 'draft'
    AND EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.id = v.job_id AND j.user_id = v_admin_id
        AND (
          (v_name <> '' AND LOWER(j.client) = v_name)
          OR (v_fullname <> '' AND LOWER(j.client) = v_fullname)
          OR (v_last <> '' AND LOWER(j.client) LIKE '%' || v_last || '%')
        )
    );

  -- Manual / cash payments recorded against this customer's jobs
  SELECT json_agg(
    json_build_object(
      'id', p.id, 'job_id', p.job_id, 'amount', p.amount,
      'payment_date', p.payment_date, 'method', p.method, 'notes', p.notes
    ) ORDER BY p.payment_date DESC
  ) INTO v_payments
  FROM job_payments p
  JOIN jobs j ON j.id = p.job_id AND j.user_id = v_admin_id
  WHERE p.user_id = v_admin_id
    AND (
      (v_name <> '' AND LOWER(j.client) = v_name)
      OR (v_fullname <> '' AND LOWER(j.client) = v_fullname)
      OR (v_last <> '' AND LOWER(j.client) LIKE '%' || v_last || '%')
    );

  SELECT json_build_object(
    'name', s.company_name, 'tagline', s.tagline, 'email', s.email,
    'phone', s.phone, 'address', s.address, 'logo', s.logo
  ) INTO v_settings FROM settings s WHERE s.user_id = v_admin_id;

  RETURN json_build_object(
    'client_name',     COALESCE(NULLIF(v_client.name, ''), v_client.email, 'Client'),
    'quotes',          COALESCE(v_quotes,          '[]'::json),
    'jobs',            COALESCE(v_jobs,            '[]'::json),
    'invoices',        COALESCE(v_invoices,        '[]'::json),
    'settings',        COALESCE(v_settings,        '{}'::json),
    'variations',      COALESCE(v_variations,      '[]'::json),
    'payments',        COALESCE(v_payments,        '[]'::json),
    'client_settings', COALESCE(v_client_settings, '{}'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_portal_preview_for_admin(UUID) TO authenticated;
