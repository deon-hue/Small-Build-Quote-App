-- ============================================================
-- Phase 8: Variations / Change Orders
-- Run this in Supabase SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Variations table
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS variations (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID REFERENCES auth.users NOT NULL,
  job_id                  UUID NOT NULL,
  ref                     TEXT NOT NULL DEFAULT '',
  title                   TEXT NOT NULL DEFAULT '',
  description             TEXT NOT NULL DEFAULT '',
  status                  TEXT NOT NULL DEFAULT 'draft',
  -- status: draft | sent | approved | rejected | cancelled | invoiced | paid
  items                   JSONB NOT NULL DEFAULT '[]',
  markup                  NUMERIC NOT NULL DEFAULT 15,
  vat_included            BOOLEAN NOT NULL DEFAULT TRUE,
  total                   NUMERIC NOT NULL DEFAULT 0,
  notes                   TEXT NOT NULL DEFAULT '',
  locked                  BOOLEAN NOT NULL DEFAULT FALSE,
  client_approved_at      TIMESTAMPTZ DEFAULT NULL,
  client_approved_by      TEXT DEFAULT NULL,
  client_rejected_at      TIMESTAMPTZ DEFAULT NULL,
  client_rejection_reason TEXT DEFAULT NULL,
  sent_at                 TIMESTAMPTZ DEFAULT NULL,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE variations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own variations" ON variations;
CREATE POLICY "Own variations" ON variations FOR ALL USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- 2. Portal RPC: approve_variation
--    Called by an authenticated customer to approve a sent
--    variation.  Locks the record and records the signature.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION approve_variation(p_variation_id UUID, p_signature TEXT)
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile   RECORD;
  v_admin_id  UUID;
  v_variation RECORD;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
  IF NOT FOUND OR v_profile.role <> 'customer' THEN
    RETURN json_build_object('error', 'not_customer');
  END IF;
  v_admin_id := v_profile.admin_user_id;

  SELECT * INTO v_variation
  FROM variations WHERE id = p_variation_id AND user_id = v_admin_id;
  IF NOT FOUND THEN RETURN json_build_object('error', 'variation_not_found'); END IF;
  IF v_variation.status <> 'sent' THEN RETURN json_build_object('error', 'variation_not_sent'); END IF;

  UPDATE variations SET
    status             = 'approved',
    locked             = TRUE,
    client_approved_at = NOW(),
    client_approved_by = p_signature,
    updated_at         = NOW()
  WHERE id = p_variation_id;

  RETURN json_build_object('success', TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION approve_variation(UUID, TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 3. Portal RPC: reject_variation
--    Called by an authenticated customer to reject a sent
--    variation, optionally supplying a reason.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION reject_variation(p_variation_id UUID, p_reason TEXT)
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile   RECORD;
  v_admin_id  UUID;
  v_variation RECORD;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
  IF NOT FOUND OR v_profile.role <> 'customer' THEN
    RETURN json_build_object('error', 'not_customer');
  END IF;
  v_admin_id := v_profile.admin_user_id;

  SELECT * INTO v_variation
  FROM variations WHERE id = p_variation_id AND user_id = v_admin_id;
  IF NOT FOUND THEN RETURN json_build_object('error', 'variation_not_found'); END IF;
  IF v_variation.status <> 'sent' THEN RETURN json_build_object('error', 'variation_not_sent'); END IF;

  UPDATE variations SET
    status                  = 'rejected',
    client_rejected_at      = NOW(),
    client_rejection_reason = COALESCE(p_reason, ''),
    updated_at              = NOW()
  WHERE id = p_variation_id;

  RETURN json_build_object('success', TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION reject_variation(UUID, TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 4. Re-create get_portal_data with variations support
--    (full replacement — safe to run multiple times)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_portal_data()
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email      TEXT;
  v_admin_id   UUID;
  v_profile    RECORD;
  v_quotes     JSON;
  v_jobs       JSON;
  v_invoices   JSON;
  v_settings   JSON;
  v_variations JSON;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'no_profile'); END IF;
  IF v_profile.role <> 'customer' THEN RETURN json_build_object('error', 'not_customer'); END IF;
  v_admin_id := v_profile.admin_user_id;
  IF v_admin_id IS NULL THEN
    RETURN json_build_object('error', 'no_admin_linked', 'email', v_email);
  END IF;

  -- Quotes where customer.email matches
  SELECT json_agg(q ORDER BY q.created_at DESC) INTO v_quotes
  FROM quotes q
  WHERE q.user_id = v_admin_id
    AND LOWER((q.customer->>'email')::TEXT) = LOWER(v_email);

  -- Jobs (with gantt_state)
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
        SELECT gs.state FROM gantt_states gs
        WHERE gs.job_id = j.id AND gs.user_id = v_admin_id LIMIT 1
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
          OR (c.last_name IS NOT NULL AND c.last_name <> ''
              AND LOWER(j.client) LIKE '%' || LOWER(c.last_name) || '%')
        )
    );

  -- Invoices where client_email matches
  SELECT json_agg(i ORDER BY i.created_at DESC) INTO v_invoices
  FROM invoices i
  WHERE i.user_id = v_admin_id
    AND LOWER(i.client_email) = LOWER(v_email);

  -- Variations for this customer's jobs (exclude drafts)
  SELECT json_agg(v ORDER BY v.created_at ASC) INTO v_variations
  FROM variations v
  WHERE v.user_id = v_admin_id
    AND v.status <> 'draft'
    AND EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.id = v.job_id AND j.user_id = v_admin_id
        AND EXISTS (
          SELECT 1 FROM clients c
          WHERE c.user_id = v_admin_id
            AND LOWER(c.email) = LOWER(v_email)
            AND (
              LOWER(j.client) = LOWER(c.name)
              OR LOWER(j.client) = LOWER(
                   TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,''))
                 )
              OR (c.last_name IS NOT NULL AND c.last_name <> ''
                  AND LOWER(j.client) LIKE '%' || LOWER(c.last_name) || '%')
            )
        )
    );

  -- Company settings
  SELECT json_build_object(
    'name',    s.company_name,
    'tagline', s.tagline,
    'email',   s.email,
    'phone',   s.phone,
    'address', s.address,
    'logo',    s.logo
  ) INTO v_settings
  FROM settings s WHERE s.user_id = v_admin_id;

  RETURN json_build_object(
    'quotes',     COALESCE(v_quotes,     '[]'::json),
    'jobs',       COALESCE(v_jobs,       '[]'::json),
    'invoices',   COALESCE(v_invoices,   '[]'::json),
    'settings',   COALESCE(v_settings,   '{}'::json),
    'variations', COALESCE(v_variations, '[]'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_portal_data() TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 5. Re-create get_portal_preview_for_admin with variations
-- ────────────────────────────────────────────────────────────
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
  v_variations JSON;
BEGIN
  SELECT name INTO v_client_name
  FROM clients
  WHERE user_id = v_admin_id
    AND LOWER(TRIM(email)) = LOWER(TRIM(p_client_email))
  LIMIT 1;

  SELECT json_agg(q ORDER BY q.created_at DESC) INTO v_quotes
  FROM quotes q
  WHERE q.user_id = v_admin_id
    AND LOWER((q.customer->>'email')::TEXT) = LOWER(TRIM(p_client_email));

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
    AND EXISTS (
      SELECT 1 FROM clients c
      WHERE c.user_id = v_admin_id
        AND LOWER(TRIM(c.email)) = LOWER(TRIM(p_client_email))
        AND (
          LOWER(j.client) = LOWER(c.name)
          OR LOWER(j.client) = LOWER(
               TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,''))
             )
          OR (c.last_name IS NOT NULL AND c.last_name <> ''
              AND LOWER(j.client) LIKE '%' || LOWER(c.last_name) || '%')
        )
    );

  SELECT json_agg(i ORDER BY i.created_at DESC) INTO v_invoices
  FROM invoices i
  WHERE i.user_id = v_admin_id
    AND LOWER(TRIM(i.client_email)) = LOWER(TRIM(p_client_email));

  SELECT json_agg(v ORDER BY v.created_at ASC) INTO v_variations
  FROM variations v
  WHERE v.user_id = v_admin_id
    AND v.status <> 'draft'
    AND EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.id = v.job_id AND j.user_id = v_admin_id
        AND EXISTS (
          SELECT 1 FROM clients c
          WHERE c.user_id = v_admin_id
            AND LOWER(TRIM(c.email)) = LOWER(TRIM(p_client_email))
            AND (
              LOWER(j.client) = LOWER(c.name)
              OR LOWER(j.client) = LOWER(
                   TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,''))
                 )
              OR (c.last_name IS NOT NULL AND c.last_name <> ''
                  AND LOWER(j.client) LIKE '%' || LOWER(c.last_name) || '%')
            )
        )
    );

  SELECT json_build_object(
    'name',    s.company_name, 'tagline', s.tagline,
    'email',   s.email,        'phone',   s.phone,
    'address', s.address,      'logo',    s.logo
  ) INTO v_settings FROM settings s WHERE s.user_id = v_admin_id;

  RETURN json_build_object(
    'client_name', COALESCE(v_client_name, p_client_email),
    'quotes',      COALESCE(v_quotes,      '[]'::json),
    'jobs',        COALESCE(v_jobs,        '[]'::json),
    'invoices',    COALESCE(v_invoices,    '[]'::json),
    'settings',    COALESCE(v_settings,    '{}'::json),
    'variations',  COALESCE(v_variations,  '[]'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_portal_preview_for_admin(TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 6. Also refresh get_gantt_states_for_portal (from fix-gantt)
--    so it keeps working after this migration is applied.
-- ────────────────────────────────────────────────────────────
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
  IF NOT FOUND OR v_profile.role <> 'customer' THEN RETURN '[]'::json; END IF;
  v_admin_id := v_profile.admin_user_id;
  IF v_admin_id IS NULL THEN RETURN '[]'::json; END IF;

  RETURN (
    SELECT COALESCE(
      json_agg(json_build_object('job_id', gs.job_id, 'state', gs.state)),
      '[]'::json
    )
    FROM gantt_states gs WHERE gs.user_id = v_admin_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_gantt_states_for_portal() TO authenticated;
