-- portal-hide-unsent.sql
-- A client only sees a quote once it has been SENT (and afterwards once they have approved or rejected it), and never a draft invoice.
-- Until now the portal showed every quote and invoice that matched the client's email or name, whatever its status, so a quote you were still
-- working on (saved, in progress, for review) appeared in their portal, and could even be approved while "pending".
--
-- What it changes (run in the Supabase SQL Editor, staging first):
--   1. get_portal_data()               the real client portal: quotes must be sent / approved / accepted / rejected / declined; invoices not draft
--   2. get_portal_preview_for_admin()  your "preview what the client sees": the same rules
--   3. approve_quote()                 a client can only approve a quote that has been SENT (not "pending")
--   4. quote_belongs_to_portal_user()  comments and attachments on a quote follow the same rule (the files of an unsent quote are not readable by the client)
-- Everything else in these functions is exactly as in supabase/phase44.sql, phase4.sql and security-hardening-1.sql.
-- To undo: supabase/portal-hide-unsent-undo.sql.

-- ────────────────────────────────────────────────────────────
-- 1 and 2. get_portal_data() and get_portal_preview_for_admin()
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
    AND LOWER((q.customer->>'email')::TEXT) = LOWER(v_email)
    AND q.status IN ('sent', 'approved', 'accepted', 'rejected', 'declined');   -- never a quote that is still being worked on

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
    AND LOWER(i.client_email) = LOWER(v_email)
    AND i.status <> 'draft';   -- a draft invoice is not the client's to see yet

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
    )
    AND q.status IN ('sent', 'approved', 'accepted', 'rejected', 'declined');   -- the same rule as the real portal

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
    )
    AND i.status <> 'draft';

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

-- ────────────────────────────────────────────────────────────
-- 3. approve_quote: only a SENT quote can be approved
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION approve_quote(p_quote_id UUID, p_signature TEXT)
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email   TEXT;
  v_profile RECORD;
  v_quote   RECORD;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
  IF NOT FOUND OR v_profile.role <> 'customer' THEN
    RETURN json_build_object('error', 'not_authorized');
  END IF;

  SELECT * INTO v_quote
  FROM quotes
  WHERE id = p_quote_id
    AND user_id = v_profile.admin_user_id
    AND LOWER((customer->>'email')::TEXT) = LOWER(v_email);

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'quote_not_found');
  END IF;

  IF v_quote.status <> 'sent' THEN
    RETURN json_build_object('error', 'already_actioned', 'status', v_quote.status);
  END IF;

  UPDATE quotes
  SET status             = 'accepted',
      client_approved_at = NOW(),
      client_approved_by = p_signature
  WHERE id = p_quote_id;

  RETURN json_build_object('success', true, 'approved_at', NOW());
END;
$$;

GRANT EXECUTE ON FUNCTION approve_quote(UUID, TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 4. Comments and attachments: only on a quote the client can see
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION quote_belongs_to_portal_user(p_quote_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(auth.jwt() ->> 'email', '') <> ''
     AND EXISTS (
       SELECT 1 FROM quotes
       WHERE id = p_quote_id
         AND LOWER(customer ->> 'email') = LOWER(auth.jwt() ->> 'email')
         AND status IN ('sent', 'approved', 'accepted', 'rejected', 'declined')
     );
$$;

GRANT EXECUTE ON FUNCTION quote_belongs_to_portal_user(UUID) TO authenticated;
