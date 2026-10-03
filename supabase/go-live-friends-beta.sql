-- go-live-friends-beta.sql — everything the LIVE database needs for the friends beta, in one paste. Run in the Supabase SQL Editor
-- on the LIVE project (Small Build Quote App), BEFORE the new code is deployed. It is the two scripts below plus one line that raises
-- YOUR OWN daily AI/message limits so your own quoting is never capped. Safe to run twice. Undo: usage-limits-undo.sql and
-- contractor-registration-undo.sql (in that order).
--   1. contractor-registration.sql   invite codes, is_contractor(), redeem_beta_invite()
--   2. usage-limits.sql              daily AI / message limits (default 100 AI + 60 messages per company per day)
--   3. your own limits               1000 AI + 500 messages a day for the owner account

-- ═══ 1. contractor-registration.sql ═══
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

-- ═══ 2. usage-limits.sql ═══
-- usage-limits.sql — daily limits so one company (or a stranger) can't run up the platform's AI / email bills.
-- Run in the Supabase SQL Editor (staging first). Undo: usage-limits-undo.sql. Adds empty tables, two columns and three functions;
-- changes no existing data. Safe to run twice.
--
--  • ai_usage / consume_usage()     per-company daily counter for signed-in features. 'ai' = AI features, 'send' = emails/WhatsApp.
--                                   Default 100 AI uses and 60 messages a day per company; override per company with
--                                   settings.ai_daily_limit / settings.send_daily_limit.
--  • public_usage / consume_public_use()   per-visitor (hashed IP) and whole-site daily counters for the public, signed-out pages.
--
-- Contractors are charged to their own company. A subcontractor using an allowed feature (timesheet parsing) is charged to
-- the contractor they work for. Customers and strangers are refused. The day rolls over at midnight UK time.

BEGIN;

ALTER TABLE settings ADD COLUMN IF NOT EXISTS ai_daily_limit   INTEGER;   -- NULL = platform default (100)
ALTER TABLE settings ADD COLUMN IF NOT EXISTS send_daily_limit INTEGER;   -- NULL = platform default (60)

-- ── Signed-in usage ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_usage (
  owner_id UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day      DATE    NOT NULL,
  kind     TEXT    NOT NULL,            -- 'ai' | 'send'
  route    TEXT    NOT NULL,
  count    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_id, day, kind, route)
);
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;      -- no policies: only the functions below can touch it
REVOKE ALL ON ai_usage FROM anon, authenticated;

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

-- ── Public (signed-out) usage ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public_usage (
  day   DATE    NOT NULL,
  kind  TEXT    NOT NULL,               -- e.g. 'ai', 'upload'
  key   TEXT    NOT NULL,               -- a salted hash of the visitor's IP, or 'GLOBAL' for the whole site
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind, key)
);
ALTER TABLE public_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public_usage FROM anon, authenticated;

-- Called only by the server (service role) from the public API routes.
CREATE OR REPLACE FUNCTION consume_public_use(p_ip_hash TEXT, p_kind TEXT, p_ip_limit INTEGER, p_global_limit INTEGER)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day    DATE := (NOW() AT TIME ZONE 'Europe/London')::DATE;
  v_ip     INTEGER;
  v_global INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('public_usage:' || COALESCE(p_kind, ''), 0));

  SELECT COALESCE(count, 0) INTO v_global FROM public_usage WHERE day = v_day AND kind = p_kind AND key = 'GLOBAL';
  v_global := COALESCE(v_global, 0);
  IF v_global >= p_global_limit THEN
    RETURN json_build_object('allowed', false, 'reason', 'site_limit');
  END IF;

  SELECT COALESCE(count, 0) INTO v_ip FROM public_usage WHERE day = v_day AND kind = p_kind AND key = p_ip_hash;
  v_ip := COALESCE(v_ip, 0);
  IF v_ip >= p_ip_limit THEN
    RETURN json_build_object('allowed', false, 'reason', 'ip_limit');
  END IF;

  INSERT INTO public_usage (day, kind, key, count) VALUES (v_day, p_kind, p_ip_hash, 1)
  ON CONFLICT (day, kind, key) DO UPDATE SET count = public_usage.count + 1;
  INSERT INTO public_usage (day, kind, key, count) VALUES (v_day, p_kind, 'GLOBAL', 1)
  ON CONFLICT (day, kind, key) DO UPDATE SET count = public_usage.count + 1;

  DELETE FROM public_usage WHERE day < v_day - 7;      -- keep the table tiny
  RETURN json_build_object('allowed', true);
END;
$$;

-- Who may call what
REVOKE EXECUTE ON FUNCTION consume_usage(TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION consume_usage(TEXT, TEXT, BOOLEAN) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION consume_public_use(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION consume_public_use(TEXT, TEXT, INTEGER, INTEGER) TO service_role;

COMMIT;


-- ── 3. Your own limits (the owner account is never capped by the friends' defaults) ────────────────────────────────
UPDATE settings SET ai_daily_limit = 1000, send_daily_limit = 500
WHERE user_id = (SELECT id FROM auth.users WHERE lower(email) = 'deon@smallbuildcompany.com');
