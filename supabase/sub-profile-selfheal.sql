-- ============================================================
-- Subcontractor portal fix: a subcontractor who was signed in to the CLIENT portal by mistake (e.g. from an invite sent before the 2026-10-07
-- routing fix) was left with a client-type login, so the subcontractor portal said "Account not linked" even though their contact is fine.
--
-- Part 1 - repairs the logins already in that state: any login whose email belongs to a saved SUBCONTRACTOR contact (and to no client contact)
--          and whose profile says 'customer' is switched to 'subcontractor' and linked to the builder who saved them.
-- Part 2 - create_sub_profile() (runs every time the subcontractor portal opens) now does the same repair itself, so it can't happen again.
-- Builders (role 'admin') are never touched. Someone who is BOTH a client and a subcontractor is left alone.
-- Safe to run more than once. Staging first, then live.
-- ============================================================

-- Part 1: repair now
UPDATE profiles p
SET    role = 'subcontractor',
       admin_user_id = s.user_id
FROM (
  SELECT u.id AS auth_id, MIN(c.user_id::text)::uuid AS user_id
  FROM   auth.users u
  JOIN   clients c ON LOWER(BTRIM(c.email)) = LOWER(BTRIM(u.email)) AND c.client_type = 'subcontractor'
  WHERE  COALESCE(u.email, '') <> '' AND COALESCE(c.email, '') <> ''
    AND  NOT EXISTS (SELECT 1 FROM clients k
                     WHERE LOWER(BTRIM(k.email)) = LOWER(BTRIM(u.email)) AND k.client_type <> 'subcontractor')
  GROUP BY u.id
) s
WHERE  p.id = s.auth_id
  AND  p.role = 'customer';

-- Part 2: heal on every sign-in
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

  -- The saved subcontractor contact for this email (if any)
  SELECT c.user_id, c.id INTO v_admin_id, v_contact_id
  FROM clients c
  WHERE LOWER(BTRIM(c.email)) = LOWER(BTRIM(v_email))
    AND c.client_type  = 'subcontractor'
    AND c.email IS NOT NULL
    AND c.email <> ''
  LIMIT 1;

  SELECT * INTO v_existing FROM profiles WHERE id = auth.uid();
  IF FOUND THEN
    -- Signed in to the client portal by mistake: a 'customer' login whose email is a subcontractor contact (and not a client contact) becomes a subcontractor login
    IF v_existing.role = 'customer' AND v_admin_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM clients k
                       WHERE LOWER(BTRIM(k.email)) = LOWER(BTRIM(v_email)) AND k.client_type <> 'subcontractor') THEN
      UPDATE profiles SET role = 'subcontractor', admin_user_id = v_admin_id WHERE id = auth.uid();
      RETURN json_build_object('success', true, 'role', 'subcontractor', 'adminId', v_admin_id, 'contactId', v_contact_id);
    END IF;

    RETURN json_build_object(
      'success', true,
      'role',     v_existing.role,
      'adminId',  v_existing.admin_user_id
    );
  END IF;

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

REVOKE EXECUTE ON FUNCTION create_sub_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_sub_profile() TO authenticated, service_role;
