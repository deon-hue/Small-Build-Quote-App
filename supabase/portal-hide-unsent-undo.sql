-- portal-hide-unsent-undo.sql: puts back how the portal behaved before portal-hide-unsent.sql (quotes shown whatever their status).
-- 1. Re-run supabase/phase44.sql in the SQL Editor (it re-creates get_portal_data() and get_portal_preview_for_admin()).
-- 2. Then run this file (approve_quote and the comments/attachments check as they were).
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

GRANT EXECUTE ON FUNCTION approve_quote(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION quote_belongs_to_portal_user(p_quote_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(auth.jwt() ->> 'email', '') <> ''
     AND EXISTS (
       SELECT 1 FROM quotes
       WHERE id = p_quote_id
         AND LOWER(customer ->> 'email') = LOWER(auth.jwt() ->> 'email')
     );
$$;

GRANT EXECUTE ON FUNCTION quote_belongs_to_portal_user(UUID) TO authenticated;
