-- owner-area-undo.sql — removes the owner area and puts consume_usage() and redeem_beta_invite() back to their earlier versions.
-- Companies, quotes and usage history are not touched. Terms-version and paused flags are dropped (the paused flag stops being enforced).

BEGIN;

-- Earlier versions of the two functions that owner-area.sql replaced (they must go back BEFORE the paused / terms_version columns are dropped)
CREATE OR REPLACE FUNCTION consume_usage(p_kind TEXT, p_route TEXT, p_allow_portal BOOLEAN DEFAULT FALSE)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_owner UUID;
  v_limit INTEGER;
  v_used  INTEGER;
  v_day   DATE := (NOW() AT TIME ZONE 'Europe/London')::DATE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('allowed', false, 'reason', 'not_signed_in');
  END IF;
  IF p_kind NOT IN ('ai', 'send') THEN
    RETURN json_build_object('allowed', false, 'reason', 'bad_kind');
  END IF;

  -- Whose allowance is this? A contractor's own; or (only where the feature allows it) the contractor a subcontractor works for.
  IF is_contractor() THEN
    v_owner := get_effective_owner_id();
  ELSIF p_allow_portal THEN
    SELECT admin_user_id INTO v_owner FROM profiles WHERE id = v_uid AND role = 'subcontractor';
  END IF;
  IF v_owner IS NULL THEN
    RETURN json_build_object('allowed', false, 'reason', 'not_allowed');
  END IF;

  -- One request at a time per company, so two quick clicks can't both slip under the limit
  PERFORM pg_advisory_xact_lock(hashtextextended('usage:' || v_owner::text, 0));

  SELECT CASE WHEN p_kind = 'ai' THEN COALESCE(ai_daily_limit, 100) ELSE COALESCE(send_daily_limit, 60) END
    INTO v_limit FROM settings WHERE user_id = v_owner;
  v_limit := COALESCE(v_limit, CASE WHEN p_kind = 'ai' THEN 100 ELSE 60 END);

  SELECT COALESCE(SUM(count), 0) INTO v_used FROM ai_usage WHERE owner_id = v_owner AND day = v_day AND kind = p_kind;
  IF v_used >= v_limit THEN
    RETURN json_build_object('allowed', false, 'reason', 'limit', 'used', v_used, 'limit', v_limit);
  END IF;

  INSERT INTO ai_usage (owner_id, day, kind, route, count) VALUES (v_owner, v_day, p_kind, left(COALESCE(p_route, ''), 80), 1)
  ON CONFLICT (owner_id, day, kind, route) DO UPDATE SET count = ai_usage.count + 1;

  RETURN json_build_object('allowed', true, 'used', v_used + 1, 'limit', v_limit);
END;
$$;

CREATE OR REPLACE FUNCTION redeem_beta_invite(p_code TEXT, p_company_name TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_email TEXT;
  v_name  TEXT := btrim(COALESCE(p_company_name, ''));
  v_inv   beta_invites%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('error', 'not_signed_in');
  END IF;

  -- The email must be confirmed: portal access elsewhere is matched on email, so an unconfirmed address is never trusted.
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid AND email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN
    RETURN json_build_object('error', 'not_verified');
  END IF;

  -- Already a company owner: nothing to do (lets the page be safely refreshed or re-run)
  IF EXISTS (SELECT 1 FROM settings WHERE user_id = v_uid) THEN
    RETURN json_build_object('ok', true, 'already', true);
  END IF;

  IF v_name = '' THEN
    RETURN json_build_object('error', 'company_name_required');
  END IF;

  SELECT * INTO v_inv FROM beta_invites WHERE upper(btrim(code)) = upper(btrim(COALESCE(p_code, ''))) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'invalid_code');
  END IF;
  IF v_inv.redeemed_at IS NOT NULL THEN
    RETURN json_build_object('error', 'used');
  END IF;
  IF v_inv.expires_at IS NOT NULL AND v_inv.expires_at < NOW() THEN
    RETURN json_build_object('error', 'expired');
  END IF;

  UPDATE beta_invites SET redeemed_by = v_uid, redeemed_at = NOW() WHERE id = v_inv.id;

  -- Explicitly a contractor, so the portal/customer logic never reclassifies them
  INSERT INTO profiles (id, role, admin_user_id) VALUES (v_uid, 'admin', NULL)
  ON CONFLICT (id) DO UPDATE SET role = 'admin', admin_user_id = NULL;

  -- Their own company record, with the name they gave (never another company's defaults)
  INSERT INTO settings (user_id, company_name, tagline, contact, phone, email, address, logo)
  VALUES (v_uid, v_name, '', '', '', v_email, '', '')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION consume_usage(TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION consume_usage(TEXT, TEXT, BOOLEAN) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION redeem_beta_invite(TEXT, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION redeem_beta_invite(TEXT, TEXT) TO authenticated, service_role;

DROP FUNCTION IF EXISTS owner_audit_list();
DROP FUNCTION IF EXISTS owner_update_feedback(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS owner_list_feedback();
DROP FUNCTION IF EXISTS submit_feedback(TEXT, TEXT);
DROP FUNCTION IF EXISTS owner_delete_invite(UUID);
DROP FUNCTION IF EXISTS owner_create_invite(TEXT, INTEGER);
DROP FUNCTION IF EXISTS owner_list_invites();
DROP FUNCTION IF EXISTS owner_set_paused(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS owner_set_limits(UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS owner_company_usage(UUID);
DROP FUNCTION IF EXISTS owner_companies();
DROP FUNCTION IF EXISTS owner_overview();
DROP FUNCTION IF EXISTS _owner_audit(TEXT, UUID, JSONB);
DROP FUNCTION IF EXISTS _owner_require();
DROP FUNCTION IF EXISTS is_platform_admin();
DROP FUNCTION IF EXISTS is_platform_admin_listed();

DROP TABLE IF EXISTS feedback;
DROP TABLE IF EXISTS owner_audit_log;
DROP TABLE IF EXISTS platform_admins;
ALTER TABLE settings DROP COLUMN IF EXISTS terms_version;
ALTER TABLE settings DROP COLUMN IF EXISTS paused;

COMMIT;
