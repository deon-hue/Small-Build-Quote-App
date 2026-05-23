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

  -- Jobs where client name matches a client record with this email
  SELECT json_agg(j ORDER BY j.created_at ASC) INTO v_jobs
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
