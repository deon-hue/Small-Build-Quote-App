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
