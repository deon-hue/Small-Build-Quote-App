-- ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
-- │ STAGING SETUP — run this ONLY on the "BuildOS Staging" Supabase project.                       │
-- │ The check below stops it if it is pasted into the live database by mistake.                    │
-- └──────────────────────────────────────────────────────────────────────────────────────────────┘
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = 'deon@smallbuildcompany.com') THEN
    RAISE EXCEPTION 'STOP: this looks like the LIVE database (it has the live owner account). Nothing was changed.';
  END IF;
END
$guard$;


-- ═══════════════════════════════ subcontractors.sql ═══════════════════════════════
-- Subcontractor contracts (both rate-based and fixed-price)
CREATE TABLE IF NOT EXISTS public.sub_contracts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id        TEXT,
  contact_id    UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  type          TEXT NOT NULL CHECK (type IN ('rate', 'fixed')),
  description   TEXT NOT NULL DEFAULT '',
  rate_type     TEXT CHECK (rate_type IN ('hourly', 'daily')),
  rate_amount   NUMERIC(10,2),
  quoted_amount NUMERIC(10,2),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  notes         TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sub_contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users manage own sub_contracts" ON public.sub_contracts;
CREATE POLICY "users manage own sub_contracts" ON public.sub_contracts
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Time entries for day/hourly rate subs
CREATE TABLE IF NOT EXISTS public.sub_time_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_contract_id UUID NOT NULL REFERENCES public.sub_contracts(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date      DATE NOT NULL,
  units           NUMERIC(10,2) NOT NULL,
  notes           TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sub_time_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users manage own sub_time_entries" ON public.sub_time_entries;
CREATE POLICY "users manage own sub_time_entries" ON public.sub_time_entries
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Payment stages for fixed-price subs (each can be pushed to Xero)
CREATE TABLE IF NOT EXISTS public.sub_payment_stages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_contract_id UUID NOT NULL REFERENCES public.sub_contracts(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description     TEXT NOT NULL DEFAULT '',
  amount          NUMERIC(10,2) NOT NULL,
  due_date        DATE,
  paid_date       DATE,
  xero_bill_id    TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sub_payment_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users manage own sub_payment_stages" ON public.sub_payment_stages;
CREATE POLICY "users manage own sub_payment_stages" ON public.sub_payment_stages
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ═══════════════════════════════ sub_contracts_quote_doc.sql ═══════════════════════════════
-- Add quote document link to sub contracts
ALTER TABLE public.sub_contracts
  ADD COLUMN IF NOT EXISTS quote_document_id UUID REFERENCES public.job_documents(id) ON DELETE SET NULL;

-- ═══════════════════════════════ phase43.sql ═══════════════════════════════
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

-- ═══════════════════════════════ phase44.sql ═══════════════════════════════
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

-- ═══════════════════════════════ payment_requests.sql ═══════════════════════════════
CREATE TABLE IF NOT EXISTS public.payment_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id          UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  amount          NUMERIC(10,2) NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  due_date        DATE,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'sent', 'received', 'cancelled')),
  sent_at         TIMESTAMPTZ,
  received_at     TIMESTAMPTZ,
  received_method TEXT DEFAULT '',
  notes           TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users manage own payment_requests" ON public.payment_requests;
CREATE POLICY "users manage own payment_requests" ON public.payment_requests
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ═══════════════════════════════ sub-portal.sql ═══════════════════════════════
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

-- ═══════════════════════════════ sub-portal-phase2.sql ═══════════════════════════════
-- ============================================================
-- Sub Portal — Phase 2: Timesheet Submission & Approval
-- Run AFTER sub-portal.sql
-- ============================================================

-- ── 1. Add updated_at to sub_time_entries ─────────────────────────────────────
ALTER TABLE sub_time_entries
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- ── 2. submit_sub_timesheet() — called from subcontractor portal ──────────────
CREATE OR REPLACE FUNCTION submit_sub_timesheet(
  p_sub_contract_id UUID,
  p_entry_date      DATE,
  p_units           NUMERIC,
  p_notes           TEXT    DEFAULT '',
  p_start_time      TIME    DEFAULT NULL,
  p_finish_time     TIME    DEFAULT NULL,
  p_break_mins      INT     DEFAULT 0
)
RETURNS UUID
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile    RECORD;
  v_email      TEXT;
  v_contact_id UUID;
  v_admin_id   UUID;
  v_entry_id   UUID;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
  IF NOT FOUND OR v_profile.role <> 'subcontractor' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_admin_id := v_profile.admin_user_id;
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  SELECT id INTO v_contact_id
  FROM clients
  WHERE user_id    = v_admin_id
    AND LOWER(email) = LOWER(v_email)
    AND client_type  = 'subcontractor'
  LIMIT 1;

  IF v_contact_id IS NULL THEN RAISE EXCEPTION 'Subcontractor record not found'; END IF;

  -- Verify the contract belongs to this subcontractor
  PERFORM 1 FROM sub_contracts
  WHERE id = p_sub_contract_id AND user_id = v_admin_id AND contact_id = v_contact_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Contract not found or access denied'; END IF;

  INSERT INTO sub_time_entries (
    sub_contract_id, user_id,
    entry_date, units, notes,
    status, submitted_by,
    start_time, finish_time, break_mins
  ) VALUES (
    p_sub_contract_id, v_admin_id,
    p_entry_date, p_units, COALESCE(p_notes, ''),
    'submitted', 'subcontractor',
    p_start_time, p_finish_time, p_break_mins
  )
  RETURNING id INTO v_entry_id;

  RETURN v_entry_id;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_sub_timesheet(UUID, DATE, NUMERIC, TEXT, TIME, TIME, INT) TO authenticated;

-- ═══════════════════════════════ phase-sub-rates.sql ═══════════════════════════════
-- Phase: Sub rate profiles on contacts + Admin time log table
-- Run this in Supabase SQL editor

-- Add sub rate profile columns to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sub_hourly_rate NUMERIC(10,2);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sub_day_rate    NUMERIC(10,2);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sub_half_day_rate NUMERIC(10,2);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS cis_registered  BOOLEAN DEFAULT FALSE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS cis_percentage  NUMERIC(5,2) DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sub_payment_type TEXT DEFAULT 'invoice';

-- Admin-driven sub time log table (not tied to contracts)
CREATE TABLE IF NOT EXISTS sub_admin_time_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users NOT NULL,
  contact_id      UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  job_id          TEXT,
  entry_date      DATE NOT NULL,
  start_time      TEXT,
  finish_time     TEXT,
  total_hours     NUMERIC(5,2),
  rate_type       TEXT CHECK (rate_type IN ('hourly','day','half_day','custom')) DEFAULT 'day',
  rate_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount          NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount_overridden BOOLEAN DEFAULT FALSE,
  notes           TEXT DEFAULT '',
  entry_type      TEXT CHECK (entry_type IN ('payable','billable','internal')) DEFAULT 'payable',
  status          TEXT CHECK (status IN ('pending','approved','paid')) DEFAULT 'pending',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sub_admin_time_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own time logs" ON sub_admin_time_logs;
CREATE POLICY "Users manage own time logs" ON sub_admin_time_logs
  FOR ALL USING (auth.uid() = user_id);

-- ═══════════════════════════════ portal-activity-logs.sql ═══════════════════════════════
-- Portal activity log table
-- Run this in Supabase SQL editor

CREATE TABLE IF NOT EXISTS portal_activity_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL,
  client_id     UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_email  TEXT,
  event_type    TEXT NOT NULL CHECK (event_type IN (
    'sign_in', 'sign_in_failed', 'magic_link_sent', 'magic_link_rate_limit'
  )),
  details       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE portal_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read own logs" ON portal_activity_logs;
CREATE POLICY "Admins read own logs" ON portal_activity_logs
  FOR SELECT USING (auth.uid() = owner_user_id);

-- ═══════════════════════════════ phase-time-log-xero.sql ═══════════════════════════════
-- Phase 3: add tracking columns to sub_admin_time_logs
-- Run this in Supabase SQL editor

ALTER TABLE sub_admin_time_logs ADD COLUMN IF NOT EXISTS xero_bill_id TEXT;
ALTER TABLE sub_admin_time_logs ADD COLUMN IF NOT EXISTS job_cost_id  UUID;

-- ═══════════════════════════════ add-week-start-to-time-logs.sql ═══════════════════════════════
-- Add week_start column to group daily entries by pay week
ALTER TABLE sub_admin_time_logs ADD COLUMN IF NOT EXISTS week_start DATE;

-- Backfill existing entries (set week_start to Monday of their entry_date)
UPDATE sub_admin_time_logs
SET week_start = date_trunc('week', entry_date::date)::date
WHERE week_start IS NULL AND entry_date IS NOT NULL;

-- ═══════════════════════════════ phase45.sql ═══════════════════════════════
-- Phase 45: Add is_paye flag to clients for PAYE staff time tracking
-- PAYE staff use the same subcontractor portal to log times, but their
-- job costs are recorded as 'labour' (not 'subcontractors') and Xero
-- push is suppressed — payroll goes through PAYE/RTI, not Xero bills.
-- Run in Supabase → SQL Editor

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS is_paye BOOLEAN NOT NULL DEFAULT false;

-- ═══════════════════════════════ sub-portal-phase3.sql ═══════════════════════════════
-- ============================================================
-- Sub Portal Phase 3: Direct job time entries (no contract required)
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Make sub_contract_id optional and add direct-job columns
ALTER TABLE public.sub_time_entries
  ALTER COLUMN sub_contract_id DROP NOT NULL;

ALTER TABLE public.sub_time_entries
  ADD COLUMN IF NOT EXISTS job_id      UUID REFERENCES public.jobs(id),
  ADD COLUMN IF NOT EXISTS contact_id  UUID REFERENCES public.clients(id),
  ADD COLUMN IF NOT EXISTS rate_type   TEXT CHECK (rate_type IN ('hourly', 'daily', 'half_day')),
  ADD COLUMN IF NOT EXISTS rate_amount NUMERIC(10,2);

-- 2. Update get_sub_portal_data to return direct entries + active jobs + sub rates
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
  v_contact        RECORD;
  v_settings       RECORD;
  v_contracts      JSON;
  v_time_entries   JSON;
  v_payment_stages JSON;
  v_sub_name       TEXT;
  v_jobs           JSON;
  v_sub_rates      JSON;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
  IF NOT FOUND                        THEN RETURN json_build_object('error', 'no_profile');       END IF;
  IF v_profile.role = 'admin'         THEN RETURN json_build_object('error', 'is_admin');         END IF;
  IF v_profile.role <> 'subcontractor' THEN RETURN json_build_object('error', 'not_subcontractor'); END IF;

  v_admin_id := v_profile.admin_user_id;
  IF v_admin_id IS NULL THEN RETURN json_build_object('error', 'no_admin_linked'); END IF;

  -- Resolve contact + rates
  SELECT
    c.id,
    COALESCE(NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')), ''), c.name),
    c.sub_hourly_rate,
    c.sub_day_rate,
    c.sub_half_day_rate,
    c.sub_payment_type
  INTO v_contact_id, v_sub_name,
       v_contact.sub_hourly_rate, v_contact.sub_day_rate,
       v_contact.sub_half_day_rate, v_contact.sub_payment_type
  FROM clients c
  WHERE c.user_id      = v_admin_id
    AND LOWER(c.email) = LOWER(v_email)
    AND c.client_type  = 'subcontractor'
  LIMIT 1;

  IF v_contact_id IS NULL THEN RETURN json_build_object('error', 'no_sub_linked'); END IF;

  -- Re-fetch contact row cleanly for rate fields
  SELECT * INTO v_contact FROM clients WHERE id = v_contact_id;

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

  -- Time entries: both contract-based and direct-job entries
  SELECT json_agg(row_to_json(te)) INTO v_time_entries
  FROM (
    SELECT
      te.id, te.sub_contract_id, te.entry_date, te.units, te.notes,
      te.status, te.submitted_by, te.admin_notes,
      te.start_time, te.finish_time, te.break_mins,
      te.created_at, te.job_id, te.rate_type, te.rate_amount
    FROM sub_time_entries te
    WHERE te.user_id = v_admin_id
      AND (
        -- Contract-based entries belonging to this sub
        (te.sub_contract_id IS NOT NULL AND te.sub_contract_id IN (
          SELECT id FROM sub_contracts
          WHERE contact_id = v_contact_id AND user_id = v_admin_id
        ))
        OR
        -- Direct job entries submitted by this sub
        (te.sub_contract_id IS NULL AND te.contact_id = v_contact_id)
      )
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

  -- Active jobs (for the job picker in the portal)
  SELECT json_agg(row_to_json(j)) INTO v_jobs
  FROM (
    SELECT id, client, type, address, stage
    FROM jobs
    WHERE user_id = v_admin_id AND (done = false OR done IS NULL)
    ORDER BY client
  ) j;

  -- Sub's rate profile
  v_sub_rates := json_build_object(
    'hourlyRate',   v_contact.sub_hourly_rate,
    'dayRate',      v_contact.sub_day_rate,
    'halfDayRate',  v_contact.sub_half_day_rate,
    'paymentType',  v_contact.sub_payment_type
  );

  RETURN json_build_object(
    'contracts',     COALESCE(v_contracts,      '[]'::json),
    'timeEntries',   COALESCE(v_time_entries,   '[]'::json),
    'paymentStages', COALESCE(v_payment_stages, '[]'::json),
    'subName',       COALESCE(v_sub_name, v_email),
    'jobs',          COALESCE(v_jobs, '[]'::json),
    'subRates',      v_sub_rates,
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

-- 3. New function: submit timesheet directly against a job (no contract needed)
CREATE OR REPLACE FUNCTION submit_sub_timesheet_direct(
  p_job_id      UUID,
  p_entry_date  DATE,
  p_units       NUMERIC,
  p_notes       TEXT    DEFAULT '',
  p_start_time  TIME    DEFAULT NULL,
  p_finish_time TIME    DEFAULT NULL,
  p_break_mins  INT     DEFAULT 0,
  p_rate_type   TEXT    DEFAULT 'daily',
  p_rate_amount NUMERIC DEFAULT 0
)
RETURNS UUID
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile    RECORD;
  v_admin_id   UUID;
  v_contact_id UUID;
  v_entry_id   UUID;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid() AND role = 'subcontractor';
  IF NOT FOUND THEN RAISE EXCEPTION 'Not a subcontractor'; END IF;

  v_admin_id := v_profile.admin_user_id;

  -- Resolve contact
  SELECT id INTO v_contact_id
  FROM clients
  WHERE user_id     = v_admin_id
    AND LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))
    AND client_type  = 'subcontractor'
  LIMIT 1;

  IF v_contact_id IS NULL THEN RAISE EXCEPTION 'Contact not found'; END IF;

  -- Verify job belongs to this admin
  IF NOT EXISTS (SELECT 1 FROM jobs WHERE id = p_job_id AND user_id = v_admin_id) THEN
    RAISE EXCEPTION 'Job not found';
  END IF;

  INSERT INTO sub_time_entries (
    sub_contract_id, contact_id, job_id, user_id,
    entry_date, units, notes, status, submitted_by,
    start_time, finish_time, break_mins,
    rate_type, rate_amount
  ) VALUES (
    NULL, v_contact_id, p_job_id, v_admin_id,
    p_entry_date, p_units, p_notes, 'submitted', 'subcontractor',
    p_start_time, p_finish_time, p_break_mins,
    p_rate_type, p_rate_amount
  )
  RETURNING id INTO v_entry_id;

  RETURN v_entry_id;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_sub_timesheet_direct(UUID, DATE, NUMERIC, TEXT, TIME, TIME, INT, TEXT, NUMERIC) TO authenticated;
