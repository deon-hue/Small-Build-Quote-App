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
  SELECT EXISTS (
    SELECT 1 FROM settings WHERE user_id = auth.uid()
    UNION ALL
    SELECT 1 FROM jobs    WHERE user_id = auth.uid() LIMIT 1
    UNION ALL
    SELECT 1 FROM quotes  WHERE user_id = auth.uid() LIMIT 1
  ) INTO v_is_admin;

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
