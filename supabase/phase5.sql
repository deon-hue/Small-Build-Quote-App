-- ============================================================
-- Phase 5: Portal Invite Tracking & Status
-- Run this in Supabase SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
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
