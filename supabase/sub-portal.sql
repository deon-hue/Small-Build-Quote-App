-- ============================================================
-- Sub Portal — Phase 1: Auth & Data Access
-- Run in Supabase SQL Editor
-- ============================================================

-- ── 1. Prepare sub_time_entries for Phase 2 (approval workflow) ──────────────
ALTER TABLE sub_time_entries
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS submitted_by TEXT NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS admin_notes TEXT,
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS finish_time TIME,
  ADD COLUMN IF NOT EXISTS break_mins INT NOT NULL DEFAULT 0;

-- ── 2. create_sub_profile() — called on sub portal sign-in ───────────────────
CREATE OR REPLACE FUNCTION create_sub_profile()
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email      TEXT;
  v_admin_id   UUID;
  v_contact_id UUID;
  v_existing   RECORD;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  -- Return existing profile if already set up
  SELECT * INTO v_existing FROM profiles WHERE id = auth.uid();
  IF FOUND THEN
    RETURN json_build_object(
      'success', true,
      'role',     v_existing.role,
      'adminId',  v_existing.admin_user_id
    );
  END IF;

  -- Find matching subcontractor record in clients table
  SELECT c.user_id, c.id INTO v_admin_id, v_contact_id
  FROM clients c
  WHERE LOWER(c.email) = LOWER(v_email)
    AND c.client_type  = 'subcontractor'
    AND c.email IS NOT NULL
    AND c.email <> ''
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'no_sub_linked');
  END IF;

  INSERT INTO profiles (id, role, admin_user_id)
  VALUES (auth.uid(), 'subcontractor', v_admin_id)
  ON CONFLICT (id) DO UPDATE
    SET role = 'subcontractor', admin_user_id = v_admin_id;

  RETURN json_build_object(
    'success',   true,
    'role',      'subcontractor',
    'adminId',   v_admin_id,
    'contactId', v_contact_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_sub_profile() TO authenticated;

-- ── 3. get_sub_portal_data() — main data fetch ───────────────────────────────
CREATE OR REPLACE FUNCTION get_sub_portal_data()
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email          TEXT;
  v_admin_id       UUID;
  v_contact_id     UUID;
  v_profile        RECORD;
  v_settings       RECORD;
  v_contracts      JSON;
  v_time_entries   JSON;
  v_payment_stages JSON;
  v_sub_name       TEXT;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
  IF NOT FOUND     THEN RETURN json_build_object('error', 'no_profile');     END IF;
  IF v_profile.role = 'admin'  THEN RETURN json_build_object('error', 'is_admin'); END IF;
  IF v_profile.role <> 'subcontractor' THEN RETURN json_build_object('error', 'not_subcontractor'); END IF;

  v_admin_id := v_profile.admin_user_id;
  IF v_admin_id IS NULL THEN RETURN json_build_object('error', 'no_admin_linked'); END IF;

  -- Resolve contact
  SELECT c.id, COALESCE(NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')), ''), c.name)
  INTO v_contact_id, v_sub_name
  FROM clients c
  WHERE c.user_id      = v_admin_id
    AND LOWER(c.email) = LOWER(v_email)
    AND c.client_type  = 'subcontractor'
  LIMIT 1;

  IF v_contact_id IS NULL THEN RETURN json_build_object('error', 'no_sub_linked'); END IF;

  -- Company settings
  SELECT * INTO v_settings FROM settings WHERE user_id = v_admin_id LIMIT 1;

  -- Contracts (active only)
  SELECT json_agg(row_to_json(sc)) INTO v_contracts
  FROM (
    SELECT
      sc.id, sc.job_id, sc.type, sc.description,
      sc.rate_type, sc.rate_amount, sc.quoted_amount, sc.status, sc.notes,
      sc.created_at,
      j.type        AS job_type,
      j.client      AS job_client,
      j.address     AS job_address,
      j.status      AS job_status,
      j.start_date,
      j.end_date
    FROM sub_contracts sc
    LEFT JOIN jobs j ON j.id = sc.job_id AND j.user_id = v_admin_id
    WHERE sc.user_id    = v_admin_id
      AND sc.contact_id = v_contact_id
      AND sc.status     = 'active'
    ORDER BY sc.created_at DESC
  ) sc;

  -- Time entries (most recent 200)
  SELECT json_agg(row_to_json(te)) INTO v_time_entries
  FROM (
    SELECT
      te.id, te.sub_contract_id, te.entry_date, te.units, te.notes,
      te.status, te.submitted_by, te.admin_notes,
      te.start_time, te.finish_time, te.break_mins,
      te.created_at
    FROM sub_time_entries te
    JOIN sub_contracts sc ON sc.id = te.sub_contract_id
    WHERE sc.user_id    = v_admin_id
      AND sc.contact_id = v_contact_id
    ORDER BY te.entry_date DESC
    LIMIT 200
  ) te;

  -- Payment stages
  SELECT json_agg(row_to_json(ps)) INTO v_payment_stages
  FROM (
    SELECT
      ps.id, ps.sub_contract_id, ps.description, ps.amount,
      ps.due_date, ps.paid_date, ps.xero_bill_id, ps.created_at
    FROM sub_payment_stages ps
    JOIN sub_contracts sc ON sc.id = ps.sub_contract_id
    WHERE sc.user_id    = v_admin_id
      AND sc.contact_id = v_contact_id
    ORDER BY ps.created_at DESC
  ) ps;

  RETURN json_build_object(
    'contracts',     COALESCE(v_contracts,      '[]'::json),
    'timeEntries',   COALESCE(v_time_entries,   '[]'::json),
    'paymentStages', COALESCE(v_payment_stages, '[]'::json),
    'subName',       COALESCE(v_sub_name, v_email),
    'settings', json_build_object(
      'name',    COALESCE(v_settings.company_name, 'The Small Build Company'),
      'tagline', COALESCE(v_settings.tagline, ''),
      'email',   COALESCE(v_settings.email,   ''),
      'phone',   COALESCE(v_settings.phone,   ''),
      'logo',    COALESCE(v_settings.logo,    '')
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_sub_portal_data() TO authenticated;

-- ── 4. mark_sub_portal_invite() — track when invite was sent ─────────────────
CREATE OR REPLACE FUNCTION mark_sub_portal_invite(p_client_id UUID)
RETURNS VOID
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE clients
  SET portal_invited_at = NOW()
  WHERE id = p_client_id AND user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION mark_sub_portal_invite(UUID) TO authenticated;
