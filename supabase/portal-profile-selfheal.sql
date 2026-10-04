-- ============================================================
-- Portal fix: a customer's portal must always link to the builder who actually has them as a client.
--
-- Problem found 2026-10-04: a customer's profile pointed at the WRONG builder (it pointed at the customer's own
-- login), so the portal opened but showed no quote, job or contract. create_customer_profile() trusted any saved
-- link on every sign-in and never re-checked it.
--
-- Fix: on every portal load, for a customer profile, check that the linked builder really has a client with this
-- email. If not, re-find the right builder and relink (preferring the builder who has a job for that client).
-- If no builder can be found, nothing is changed. Builders (role 'admin') and subcontractors are untouched.
-- Safe to run more than once. Run in the Supabase SQL Editor.
-- ============================================================

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
        WHERE  LOWER(TRIM(c.email)) = LOWER(TRIM(v_email))
          AND  c.email IS NOT NULL AND c.email <> ''
          AND  c.user_id <> auth.uid()
        ORDER  BY EXISTS (SELECT 1 FROM jobs j WHERE j.user_id = c.user_id AND LOWER(j.client) = LOWER(c.name)) DESC
        LIMIT  1;

        UPDATE profiles
        SET    role = 'customer', admin_user_id = v_admin_id
        WHERE  id = auth.uid();

        RETURN json_build_object('success', true, 'role', 'customer', 'admin_id', v_admin_id);
      END IF;
    END IF;

    -- A customer whose saved link is missing or wrong: the linked builder must really have this email as a client
    IF v_existing.role = 'customer' THEN
      IF v_existing.admin_user_id IS NULL
         OR v_existing.admin_user_id = auth.uid()
         OR NOT EXISTS (
              SELECT 1 FROM clients c
              WHERE c.user_id = v_existing.admin_user_id
                AND LOWER(TRIM(c.email)) = LOWER(TRIM(v_email))
            )
      THEN
        SELECT c.user_id INTO v_admin_id
        FROM   clients c
        WHERE  LOWER(TRIM(c.email)) = LOWER(TRIM(v_email))
          AND  c.email IS NOT NULL AND c.email <> ''
          AND  c.user_id <> auth.uid()
        ORDER  BY EXISTS (SELECT 1 FROM jobs j WHERE j.user_id = c.user_id AND LOWER(j.client) = LOWER(c.name)) DESC
        LIMIT  1;

        IF v_admin_id IS NOT NULL AND v_admin_id IS DISTINCT FROM v_existing.admin_user_id THEN
          UPDATE profiles SET admin_user_id = v_admin_id WHERE id = auth.uid();
          RETURN json_build_object('success', true, 'role', 'customer', 'admin_id', v_admin_id, 'relinked', true);
        END IF;
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
  WHERE  LOWER(TRIM(c.email)) = LOWER(TRIM(v_email))
    AND  c.email IS NOT NULL AND c.email <> ''
    AND  c.user_id <> auth.uid()
  ORDER  BY EXISTS (SELECT 1 FROM jobs j WHERE j.user_id = c.user_id AND LOWER(j.client) = LOWER(c.name)) DESC
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
