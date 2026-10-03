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


-- ═══════════════════════════════ schema.sql ═══════════════════════════════
-- ============================================================
-- Small Build Company — Supabase Schema
-- Run this entire file in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Jobs table
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  client TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  value NUMERIC NOT NULL DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'planning',
  start_date DATE,
  weeks INTEGER NOT NULL DEFAULT 8,
  done INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  quote_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quotes table (phases and customer stored as JSONB to mirror existing schema)
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  ref TEXT NOT NULL DEFAULT '',
  saved_date TEXT NOT NULL DEFAULT '',
  last_edited TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  job_type TEXT NOT NULL DEFAULT '',
  markup NUMERIC NOT NULL DEFAULT 15,
  vat_included BOOLEAN NOT NULL DEFAULT TRUE,
  scope TEXT NOT NULL DEFAULT '',
  photo TEXT NOT NULL DEFAULT '',
  converted_to_job BOOLEAN NOT NULL DEFAULT FALSE,
  customer JSONB NOT NULL DEFAULT '{}',
  phases JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clients table
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  added_from TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Settings table (one row per user)
CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
  company_name TEXT NOT NULL DEFAULT 'Small Build Company Ltd',
  tagline TEXT NOT NULL DEFAULT 'Building Extensions & Renovations',
  contact TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  terms TEXT NOT NULL DEFAULT 'A deposit of 25% is required prior to commencement of works. Stage payments are then due at agreed milestones throughout the project. Final payment is due upon practical completion.',
  extra TEXT NOT NULL DEFAULT 'All works are carried out in accordance with current Building Regulations. Any variations to the agreed scope of works will be priced and agreed in writing prior to proceeding.',
  logo TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Gantt states table
CREATE TABLE gantt_states (
  job_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,
  state JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (job_id, user_id)
);

-- ============================================================
-- Row Level Security (RLS) — users see ONLY their own data
-- ============================================================
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE gantt_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own jobs" ON jobs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Own quotes" ON quotes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Own clients" ON clients FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Own settings" ON settings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Own gantt states" ON gantt_states FOR ALL USING (auth.uid() = user_id);

-- ═══════════════════════════════ phase2.sql ═══════════════════════════════
-- Phase 2 migration — run this in Supabase SQL Editor

-- Invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  ref TEXT NOT NULL DEFAULT '',
  job_id TEXT DEFAULT '',
  quote_id TEXT DEFAULT '',
  client_name TEXT NOT NULL DEFAULT '',
  client_address TEXT DEFAULT '',
  client_email TEXT DEFAULT '',
  line_items JSONB NOT NULL DEFAULT '[]',
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_included BOOLEAN NOT NULL DEFAULT true,
  vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  issue_date TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own invoices" ON invoices;
CREATE POLICY "Users manage own invoices" ON invoices FOR ALL USING (auth.uid() = user_id);

-- Job notes / activity log table
CREATE TABLE IF NOT EXISTS job_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  job_id TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE job_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own job notes" ON job_notes;
CREATE POLICY "Users manage own job notes" ON job_notes FOR ALL USING (auth.uid() = user_id);

-- ═══════════════════════════════ phase3.sql ═══════════════════════════════
-- ============================================================
-- Phase 3: Customer Portal + Payment Plans
-- Run this in Supabase SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Profiles table (tracks admin vs customer role)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role           TEXT NOT NULL DEFAULT 'admin',   -- 'admin' | 'customer'
  admin_user_id  UUID,                             -- customers: which admin they belong to
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_self_select" ON profiles;
DROP POLICY IF EXISTS "profiles_self_insert" ON profiles;
CREATE POLICY "profiles_self_select" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_self_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- ────────────────────────────────────────────────────────────
-- 2. Add payment_plan column to invoices
-- ────────────────────────────────────────────────────────────
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_plan JSONB DEFAULT NULL;

-- ────────────────────────────────────────────────────────────
-- 3. Helper: get current user's role
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- ────────────────────────────────────────────────────────────
-- 4. RPC: create_customer_profile
--    Called after a customer signs up.
--    Looks up their email in the admin's clients table and
--    links their profile to that admin automatically.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_customer_profile()
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email    TEXT;
  v_admin_id UUID;
  v_existing RECORD;
BEGIN
  -- Get current user's email
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  -- Return existing profile if already set up
  SELECT * INTO v_existing FROM profiles WHERE id = auth.uid();
  IF FOUND THEN
    RETURN json_build_object(
      'success', true,
      'role',     v_existing.role,
      'admin_id', v_existing.admin_user_id
    );
  END IF;

  -- Find admin whose clients table contains this email
  SELECT c.user_id INTO v_admin_id
  FROM clients c
  WHERE LOWER(c.email) = LOWER(v_email)
    AND c.email IS NOT NULL
    AND c.email <> ''
  LIMIT 1;

  -- Create customer profile (admin_user_id may be NULL if email not found yet)
  INSERT INTO profiles (id, role, admin_user_id)
  VALUES (auth.uid(), 'customer', v_admin_id);

  RETURN json_build_object(
    'success', true,
    'role',     'customer',
    'admin_id', v_admin_id,
    'matched',  v_admin_id IS NOT NULL
  );
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 5. RPC: get_portal_data
--    Returns all quotes, jobs, invoices and company settings
--    belonging to the customer's linked admin, filtered to
--    show only records matching the customer's email.
-- ────────────────────────────────────────────────────────────
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
        WHERE gs.job_id = j.id
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

-- ────────────────────────────────────────────────────────────
-- 6. Grant execute permissions
-- ────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION create_customer_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION get_portal_data()          TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_role()              TO authenticated;

-- ═══════════════════════════════ phase4.sql ═══════════════════════════════
-- ============================================================
-- Phase 4: Quote Approval + Admin Profile Fix
-- Run this in Supabase SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Add approval columns to quotes table
-- ────────────────────────────────────────────────────────────
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS client_approved_at  TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS client_approved_by  TEXT        DEFAULT NULL;

-- ────────────────────────────────────────────────────────────
-- 2. Fix create_customer_profile() to detect admin users
--    Admins own rows in the settings/jobs/quotes tables.
--    If the user signing up is already an admin, mark them
--    as 'admin' in profiles — never 'customer'.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_customer_profile()
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email    TEXT;
  v_admin_id UUID;
  v_existing RECORD;
  v_is_admin BOOLEAN := FALSE;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  -- Return existing profile if already set up
  SELECT * INTO v_existing FROM profiles WHERE id = auth.uid();
  IF FOUND THEN
    RETURN json_build_object(
      'success', true,
      'role',    v_existing.role,
      'admin_id', v_existing.admin_user_id
    );
  END IF;

  -- Check if this user owns any admin data (settings, jobs, or quotes)
  v_is_admin := EXISTS (SELECT 1 FROM settings WHERE user_id = auth.uid())
             OR EXISTS (SELECT 1 FROM jobs     WHERE user_id = auth.uid())
             OR EXISTS (SELECT 1 FROM quotes   WHERE user_id = auth.uid());

  IF v_is_admin THEN
    INSERT INTO profiles (id, role, admin_user_id)
    VALUES (auth.uid(), 'admin', NULL)
    ON CONFLICT (id) DO UPDATE SET role = 'admin', admin_user_id = NULL;
    RETURN json_build_object('success', true, 'role', 'admin');
  END IF;

  -- Find admin whose clients table contains this email
  SELECT c.user_id INTO v_admin_id
  FROM clients c
  WHERE LOWER(c.email) = LOWER(v_email)
    AND c.email IS NOT NULL
    AND c.email <> ''
  LIMIT 1;

  INSERT INTO profiles (id, role, admin_user_id)
  VALUES (auth.uid(), 'customer', v_admin_id);

  RETURN json_build_object(
    'success', true,
    'role',    'customer',
    'admin_id', v_admin_id,
    'matched',  v_admin_id IS NOT NULL
  );
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 3. One-time fix: correct any admin accounts that were
--    accidentally given a 'customer' profile
-- ────────────────────────────────────────────────────────────
UPDATE profiles
SET role = 'admin', admin_user_id = NULL
WHERE role = 'customer'
  AND id IN (
    SELECT user_id FROM settings
    UNION
    SELECT DISTINCT user_id FROM jobs
    UNION
    SELECT DISTINCT user_id FROM quotes
  );

-- ────────────────────────────────────────────────────────────
-- 4. RPC: approve_quote
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

  IF v_quote.status NOT IN ('pending', 'sent') THEN
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

GRANT EXECUTE ON FUNCTION create_customer_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION approve_quote(UUID, TEXT)  TO authenticated;

-- ═══════════════════════════════ phase5.sql ═══════════════════════════════
-- 1. Add invite tracking column to clients
-- ────────────────────────────────────────────────────────────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_invited_at TIMESTAMPTZ DEFAULT NULL;

-- ────────────────────────────────────────────────────────────
-- 2. RPC: get_clients_with_portal_status
--    Returns all clients with portal status derived from
--    auth.users (last login) and profiles (active account).
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_clients_with_portal_status()
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_agg(
    json_build_object(
      'id',                 c.id,
      'name',               c.name,
      'first_name',         c.first_name,
      'last_name',          c.last_name,
      'email',              c.email,
      'phone',              c.phone,
      'address',            c.address,
      'notes',              c.notes,
      'added_from',         c.added_from,
      'portal_invited_at',  c.portal_invited_at,
      'portal_status',      CASE
                              WHEN c.email IS NULL OR TRIM(c.email) = '' THEN 'no_email'
                              WHEN p.id IS NOT NULL                       THEN 'active'
                              WHEN c.portal_invited_at IS NOT NULL        THEN 'invited'
                              ELSE 'not_invited'
                            END,
      'portal_last_login',  u.last_sign_in_at
    )
    ORDER BY c.name
  ) INTO v_result
  FROM clients c
  LEFT JOIN auth.users u
    ON  LOWER(TRIM(u.email)) = LOWER(TRIM(c.email))
    AND c.email IS NOT NULL
    AND TRIM(c.email) <> ''
  LEFT JOIN profiles p
    ON  p.id   = u.id
    AND p.role = 'customer'
  WHERE c.user_id = auth.uid();

  RETURN COALESCE(v_result, '[]'::json);
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 3. RPC: mark_portal_invite
--    Records that an invite was sent for a client.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mark_portal_invite(p_client_id UUID)
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE clients
  SET portal_invited_at = NOW()
  WHERE id = p_client_id
    AND user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'client_not_found');
  END IF;

  RETURN json_build_object('success', true, 'invited_at', NOW());
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 4. Grant permissions
-- ────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION get_clients_with_portal_status() TO authenticated;
GRANT EXECUTE ON FUNCTION mark_portal_invite(UUID)          TO authenticated;

-- ═══════════════════════════════ phase6.sql ═══════════════════════════════
-- phase6.sql: Per-user job type default templates
-- Run this in Supabase SQL editor

create table if not exists job_type_templates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade not null,
  job_type   text not null,
  template   jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, job_type)
);

alter table job_type_templates enable row level security;

create policy "Users manage own job type templates"
  on job_type_templates for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ═══════════════════════════════ fix-gantt.sql ═══════════════════════════════
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

-- ═══════════════════════════════ fix-profiles.sql ═══════════════════════════════
-- ============================================================
-- Fix: Customer profiles incorrectly classified as admin
-- Run this in Supabase SQL Editor if a customer sees
-- "Admin account detected" when signing into the portal.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. One-time repair: fix any existing misclassified profiles
--    Finds accounts marked 'admin' that have NO admin data
--    (no settings/jobs/quotes) but DO have their email in
--    a clients table — these are real customers, not admins.
-- ────────────────────────────────────────────────────────────
UPDATE profiles p
SET
  role          = 'customer',
  admin_user_id = (
    SELECT c.user_id
    FROM   clients c
    JOIN   auth.users u ON u.id = p.id
    WHERE  LOWER(c.email) = LOWER(u.email)
      AND  c.email IS NOT NULL
      AND  c.email <> ''
    LIMIT  1
  )
WHERE p.role = 'admin'
  AND NOT EXISTS (SELECT 1 FROM settings WHERE user_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM jobs     WHERE user_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM quotes   WHERE user_id = p.id)
  AND EXISTS (
    SELECT 1 FROM clients c
    JOIN   auth.users u ON u.id = p.id
    WHERE  LOWER(c.email) = LOWER(u.email)
      AND  c.email IS NOT NULL
      AND  c.email <> ''
  );

-- ────────────────────────────────────────────────────────────
-- 2. Replace create_customer_profile() with a self-healing
--    version that detects and fixes misclassified profiles
--    on every sign-in — so this can never get stuck again.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_customer_profile()
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email    TEXT;
  v_admin_id UUID;
  v_existing RECORD;
  v_is_admin BOOLEAN := FALSE;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  -- Check if a profile already exists
  SELECT * INTO v_existing FROM profiles WHERE id = auth.uid();
  IF FOUND THEN
    -- If flagged as admin, verify they actually own admin data
    IF v_existing.role = 'admin' THEN
      v_is_admin := EXISTS (SELECT 1 FROM settings WHERE user_id = auth.uid())
                 OR EXISTS (SELECT 1 FROM jobs     WHERE user_id = auth.uid())
                 OR EXISTS (SELECT 1 FROM quotes   WHERE user_id = auth.uid());

      -- No admin data = misclassified customer — fix it automatically
      IF NOT v_is_admin THEN
        SELECT c.user_id INTO v_admin_id
        FROM   clients c
        WHERE  LOWER(c.email) = LOWER(v_email)
          AND  c.email IS NOT NULL AND c.email <> ''
        LIMIT  1;

        UPDATE profiles
        SET    role = 'customer', admin_user_id = v_admin_id
        WHERE  id = auth.uid();

        RETURN json_build_object(
          'success', true,
          'role',    'customer',
          'admin_id', v_admin_id
        );
      END IF;
    END IF;

    -- Profile is correct — return as-is
    RETURN json_build_object(
      'success',  true,
      'role',     v_existing.role,
      'admin_id', v_existing.admin_user_id
    );
  END IF;

  -- ── No existing profile — create one ──────────────────────

  -- Check if this user owns any admin data
  v_is_admin := EXISTS (SELECT 1 FROM settings WHERE user_id = auth.uid())
             OR EXISTS (SELECT 1 FROM jobs     WHERE user_id = auth.uid())
             OR EXISTS (SELECT 1 FROM quotes   WHERE user_id = auth.uid());

  IF v_is_admin THEN
    INSERT INTO profiles (id, role, admin_user_id)
    VALUES (auth.uid(), 'admin', NULL)
    ON CONFLICT (id) DO UPDATE SET role = 'admin', admin_user_id = NULL;
    RETURN json_build_object('success', true, 'role', 'admin');
  END IF;

  -- It's a customer — find which admin they belong to
  SELECT c.user_id INTO v_admin_id
  FROM   clients c
  WHERE  LOWER(c.email) = LOWER(v_email)
    AND  c.email IS NOT NULL AND c.email <> ''
  LIMIT  1;

  INSERT INTO profiles (id, role, admin_user_id)
  VALUES (auth.uid(), 'customer', v_admin_id);

  RETURN json_build_object(
    'success',  true,
    'role',     'customer',
    'admin_id', v_admin_id,
    'matched',  v_admin_id IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_customer_profile() TO authenticated;

-- ═══════════════════════════════ phase7.sql ═══════════════════════════════
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

-- ═══════════════════════════════ phase8.sql ═══════════════════════════════
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

-- ═══════════════════════════════ phase9.sql ═══════════════════════════════
-- ============================================================
-- Phase 9: Quote Documents (plan / drawing attachments)
-- Run this in Supabase SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Storage bucket for uploaded plans and drawings
-- ────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'quote-documents',
  'quote-documents',
  false,
  10485760,   -- 10 MB per file
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
    'image/webp', 'image/tiff', 'image/bmp',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 2. Storage RLS — each user can only touch their own folder
--    Path structure: {user_id}/{quote_id}/{filename}
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Quote docs: users upload own" ON storage.objects;
CREATE POLICY "Quote docs: users upload own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'quote-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Quote docs: users read own" ON storage.objects;
CREATE POLICY "Quote docs: users read own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'quote-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Quote docs: users delete own" ON storage.objects;
CREATE POLICY "Quote docs: users delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'quote-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ────────────────────────────────────────────────────────────
-- 3. quote_documents table — tracks uploaded files per quote
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quote_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users NOT NULL,
  quote_id     TEXT NOT NULL,           -- quote UUID, or 'draft' for unsaved quotes
  filename     TEXT NOT NULL,
  storage_path TEXT NOT NULL,           -- path inside quote-documents bucket
  mime_type    TEXT NOT NULL DEFAULT '',
  file_size    INTEGER NOT NULL DEFAULT 0,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE quote_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own quote_documents" ON quote_documents;
CREATE POLICY "Own quote_documents" ON quote_documents
  FOR ALL USING (auth.uid() = user_id);

-- ═══════════════════════════════ phase10.sql ═══════════════════════════════
-- ============================================================
-- Phase 10: Team Members & Multi-User Access
-- Run this in Supabase SQL Editor
-- ============================================================
--
-- SETUP NOTES:
-- 1. Run this entire file in Supabase SQL Editor.
-- 2. Go to Supabase → Authentication → Settings and DISABLE
--    "Enable email confirmations" so invite acceptance works
--    seamlessly (users don't need to verify email separately).
-- 3. The invite acceptance page (/team/accept) works without
--    a service role key — it uses a SECURITY DEFINER function.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. team_members table
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_members (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  auth_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email          TEXT NOT NULL,
  name           TEXT NOT NULL DEFAULT '',
  role           TEXT NOT NULL DEFAULT 'staff',    -- admin | manager | staff | view_only
  status         TEXT NOT NULL DEFAULT 'invited',  -- invited | active | disabled
  permissions    JSONB NOT NULL DEFAULT '{}',
  invite_token   UUID DEFAULT gen_random_uuid(),
  invited_at     TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Owner can manage all their team members
DROP POLICY IF EXISTS "team: owner full access" ON team_members;
CREATE POLICY "team: owner full access" ON team_members
  FOR ALL TO authenticated
  USING  (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Team members can read their own record (to get permissions/status)
DROP POLICY IF EXISTS "team: member reads own" ON team_members;
CREATE POLICY "team: member reads own" ON team_members
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- Team members can update last_active_at on their own record
DROP POLICY IF EXISTS "team: member updates own" ON team_members;
CREATE POLICY "team: member updates own" ON team_members
  FOR UPDATE TO authenticated
  USING  (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- ──────────────────────────────────────────────────────────────
-- 2. get_effective_owner_id()
--    Returns the data-owner's UID for the current session.
--    • Sub-users  → their owner's UID
--    • Owner      → their own UID
--    All RLS policies use this so sub-users see owner's data.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_effective_owner_id()
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT owner_id
      FROM   team_members
      WHERE  auth_user_id = auth.uid()
        AND  status = 'active'
      LIMIT  1
    ),
    auth.uid()
  )
$$;

-- ──────────────────────────────────────────────────────────────
-- 3. Update all existing RLS policies
--    Replace auth.uid() = user_id with get_effective_owner_id()
--    so sub-users transparently access owner's data.
-- ──────────────────────────────────────────────────────────────

-- Jobs
DROP POLICY IF EXISTS "Own jobs" ON jobs;
CREATE POLICY "Own jobs" ON jobs FOR ALL
  USING     (user_id = get_effective_owner_id())
  WITH CHECK (user_id = get_effective_owner_id());

-- Quotes
DROP POLICY IF EXISTS "Own quotes" ON quotes;
CREATE POLICY "Own quotes" ON quotes FOR ALL
  USING     (user_id = get_effective_owner_id())
  WITH CHECK (user_id = get_effective_owner_id());

-- Clients
DROP POLICY IF EXISTS "Own clients" ON clients;
CREATE POLICY "Own clients" ON clients FOR ALL
  USING     (user_id = get_effective_owner_id())
  WITH CHECK (user_id = get_effective_owner_id());

-- Settings
DROP POLICY IF EXISTS "Own settings" ON settings;
CREATE POLICY "Own settings" ON settings FOR ALL
  USING     (user_id = get_effective_owner_id())
  WITH CHECK (user_id = get_effective_owner_id());

-- Gantt states
DROP POLICY IF EXISTS "Own gantt states" ON gantt_states;
CREATE POLICY "Own gantt states" ON gantt_states FOR ALL
  USING     (user_id = get_effective_owner_id())
  WITH CHECK (user_id = get_effective_owner_id());

-- Invoices
DROP POLICY IF EXISTS "Users manage own invoices" ON invoices;
DROP POLICY IF EXISTS "Own invoices" ON invoices;
CREATE POLICY "Own invoices" ON invoices FOR ALL
  USING     (user_id = get_effective_owner_id())
  WITH CHECK (user_id = get_effective_owner_id());

-- Job notes
DROP POLICY IF EXISTS "Users manage own job notes" ON job_notes;
DROP POLICY IF EXISTS "Own job notes" ON job_notes;
CREATE POLICY "Own job notes" ON job_notes FOR ALL
  USING     (user_id = get_effective_owner_id())
  WITH CHECK (user_id = get_effective_owner_id());

-- Variations
DROP POLICY IF EXISTS "Own variations" ON variations;
CREATE POLICY "Own variations" ON variations FOR ALL
  USING     (user_id = get_effective_owner_id())
  WITH CHECK (user_id = get_effective_owner_id());

-- Job type templates
DROP POLICY IF EXISTS "Users manage own job type templates" ON job_type_templates;
DROP POLICY IF EXISTS "Own job type templates" ON job_type_templates;
CREATE POLICY "Own job type templates" ON job_type_templates FOR ALL
  USING     (user_id = get_effective_owner_id())
  WITH CHECK (user_id = get_effective_owner_id());

-- ──────────────────────────────────────────────────────────────
-- 4. get_invite_details(token)
--    Callable by anon (no login required) so the accept page
--    can display invite details before the user signs up.
--    SECURITY DEFINER bypasses RLS — only returns safe fields.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_invite_details(p_token UUID)
RETURNS TABLE (
  member_id     UUID,
  email         TEXT,
  name          TEXT,
  owner_company TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    tm.id,
    tm.email,
    tm.name,
    COALESCE(s.company_name, 'Small Build Company') AS owner_company
  FROM   team_members tm
  LEFT   JOIN settings s ON s.user_id = tm.owner_id
  WHERE  tm.invite_token = p_token
    AND  tm.status = 'invited';
END;
$$;

-- Allow unauthenticated callers (anon key) to call this function
GRANT EXECUTE ON FUNCTION get_invite_details(UUID) TO anon, authenticated;

-- ──────────────────────────────────────────────────────────────
-- 5. Trigger: auto-link auth user → team_members on sign-up
--    When a new Supabase Auth user is created whose email
--    matches an invited team member, link them and activate.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION link_team_member_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE team_members
  SET
    auth_user_id   = NEW.id,
    status         = 'active',
    last_active_at = NOW()
  WHERE LOWER(email) = LOWER(NEW.email)
    AND status = 'invited';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_team_member_signup ON auth.users;
CREATE TRIGGER on_team_member_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION link_team_member_on_signup();
