-- contractor-registration.sql — invite-code registration for contractors (friends beta). Run in the Supabase SQL Editor.
-- Undo: contractor-registration-undo.sql.
--
--  • beta_invites          the codes you give your friends (nobody can read or write this table from the app)
--  • settings.terms_accepted_at   when a contractor accepted the beta terms
--  • is_contractor()       true for a company owner or an active team member — false for customers / subcontractors / strangers
--  • redeem_beta_invite()  turns a verified, signed-in account into a contractor company, using a valid unused code
--
-- Adds one empty table, one column and two functions. Changes no existing data. Safe to run twice.

BEGIN;

-- ── Invite codes ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS beta_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL,
  label       TEXT NOT NULL DEFAULT '',          -- who it is for, e.g. "Dave (Dave Smith Building)"
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ,                       -- NULL = never expires
  redeemed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  redeemed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS beta_invites_code_uq ON beta_invites (upper(btrim(code)));

-- Row security ON with no policies = the app can never read or change it. Only this SQL editor (and the
-- redeem function below, which runs with the owner's rights) can.
ALTER TABLE beta_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON beta_invites FROM anon, authenticated;

-- ── Terms acceptance ─────────────────────────────────────────────────────────
ALTER TABLE settings ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

-- ── is_contractor() ──────────────────────────────────────────────────────────
-- A contractor is whoever owns a settings row, or is an active member of a team whose owner does
-- (get_effective_owner_id() already resolves a member to their owner).
CREATE OR REPLACE FUNCTION is_contractor()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM settings WHERE user_id = get_effective_owner_id());
$$;

-- ── redeem_beta_invite() ─────────────────────────────────────────────────────
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

-- Only signed-in users can call these (signed-out visitors cannot)
REVOKE EXECUTE ON FUNCTION is_contractor() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION redeem_beta_invite(TEXT, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION is_contractor() TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION redeem_beta_invite(TEXT, TEXT) TO authenticated, service_role;

COMMIT;
