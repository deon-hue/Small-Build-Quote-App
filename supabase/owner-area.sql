-- owner-area.sql — the platform owner's private area (companies, usage, limits, invite codes, feedback, audit log).
-- Run in the Supabase SQL Editor (staging first). Undo: owner-area-undo.sql. Adds tables, columns and functions; changes no existing
-- customer data. Safe to run twice.
--
-- SECURITY MODEL: the checks live HERE, not in the web pages. Every owner_* function starts by requiring is_platform_admin():
-- the caller must be listed in platform_admins AND signed in with two-step verification (the session's "aal" must be aal2).
-- The owner functions return account details and COUNTS only — never a company's quotes, clients, prices or documents.
-- Run after: contractor-registration.sql and usage-limits.sql.

BEGIN;

-- ── Owner accounts ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_admins (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;      -- no policies: only this SQL editor can add an owner
REVOKE ALL ON platform_admins FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS owner_audit_log (
  id           BIGSERIAL PRIMARY KEY,
  at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  admin_id     UUID,
  admin_email  TEXT NOT NULL DEFAULT '',
  action       TEXT NOT NULL,
  target_owner UUID,
  details      JSONB NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE owner_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON owner_audit_log FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS feedback (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  owner_id     UUID,
  user_id      UUID,
  email        TEXT NOT NULL DEFAULT '',
  company_name TEXT NOT NULL DEFAULT '',
  page         TEXT NOT NULL DEFAULT '',
  message      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'new',            -- new | seen | done
  note         TEXT NOT NULL DEFAULT ''
);
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON feedback FROM anon, authenticated;

-- ── Company record: paused flag and the terms version they accepted ──────────
ALTER TABLE settings ADD COLUMN IF NOT EXISTS paused BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS terms_version TEXT;
-- Everyone registered so far accepted (or wrote) the first beta terms
UPDATE settings SET terms_version = 'beta-1' WHERE terms_version IS NULL;

-- ── Who is an owner? ─────────────────────────────────────────────────────────
-- Listed as an owner (used only to route the owner to the right page / the two-step set-up page)
CREATE OR REPLACE FUNCTION is_platform_admin_listed()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid());
$$;

-- Listed AND signed in with two-step verification: the only check that opens any owner data
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
     AND COALESCE(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

CREATE OR REPLACE FUNCTION _owner_require()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION _owner_audit(p_action TEXT, p_target UUID, p_details JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO owner_audit_log (admin_id, admin_email, action, target_owner, details)
  VALUES (auth.uid(), COALESCE((SELECT email FROM platform_admins WHERE user_id = auth.uid()), ''), p_action, p_target, COALESCE(p_details, '{}'::jsonb));
END;
$$;

-- ── Overview numbers ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION owner_overview()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE v_day DATE := (NOW() AT TIME ZONE 'Europe/London')::DATE;
BEGIN
  PERFORM _owner_require();
  RETURN json_build_object(
    'companies',       (SELECT COUNT(*) FROM settings),
    'active_7d',       (SELECT COUNT(*) FROM settings s JOIN auth.users u ON u.id = s.user_id WHERE u.last_sign_in_at > NOW() - INTERVAL '7 days'),
    'paused',          (SELECT COUNT(*) FROM settings WHERE paused),
    'ai_today',        (SELECT COALESCE(SUM(count), 0) FROM ai_usage WHERE day = v_day AND kind = 'ai'),
    'messages_today',  (SELECT COALESCE(SUM(count), 0) FROM ai_usage WHERE day = v_day AND kind = 'send'),
    'unused_invites',  (SELECT COUNT(*) FROM beta_invites WHERE redeemed_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())),
    'new_feedback',    (SELECT COUNT(*) FROM feedback WHERE status = 'new')
  );
END;
$$;

-- ── Companies (details and counts only) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION owner_companies()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE v_day DATE := (NOW() AT TIME ZONE 'Europe/London')::DATE;
BEGIN
  PERFORM _owner_require();
  RETURN COALESCE((
    SELECT json_agg(c ORDER BY c.joined DESC) FROM (
      SELECT
        s.user_id                                   AS owner_id,
        s.company_name,
        u.email                                     AS owner_email,
        u.created_at                                AS joined,
        u.last_sign_in_at,
        s.terms_version,
        s.terms_accepted_at,
        s.paused,
        COALESCE(s.ai_daily_limit, 100)             AS ai_limit,
        s.ai_daily_limit                            AS ai_limit_override,
        COALESCE(s.send_daily_limit, 60)            AS send_limit,
        s.send_daily_limit                          AS send_limit_override,
        (SELECT COUNT(*) FROM quotes  WHERE user_id = s.user_id) AS quotes,
        (SELECT COUNT(*) FROM jobs    WHERE user_id = s.user_id) AS jobs,
        (SELECT COUNT(*) FROM clients WHERE user_id = s.user_id) AS clients,
        (SELECT COALESCE(SUM(count), 0) FROM ai_usage WHERE owner_id = s.user_id AND kind = 'ai'   AND day = v_day)                 AS ai_today,
        (SELECT COALESCE(SUM(count), 0) FROM ai_usage WHERE owner_id = s.user_id AND kind = 'ai'   AND day > v_day - 7)             AS ai_7d,
        (SELECT COALESCE(SUM(count), 0) FROM ai_usage WHERE owner_id = s.user_id AND kind = 'ai'   AND day > v_day - 30)            AS ai_30d,
        (SELECT COALESCE(SUM(count), 0) FROM ai_usage WHERE owner_id = s.user_id AND kind = 'send' AND day = v_day)                 AS send_today,
        (SELECT COALESCE(SUM(count), 0) FROM ai_usage WHERE owner_id = s.user_id AND kind = 'send' AND day > v_day - 7)             AS send_7d,
        (SELECT COALESCE(SUM(count), 0) FROM ai_usage WHERE owner_id = s.user_id AND kind = 'send' AND day > v_day - 30)            AS send_30d,
        (SELECT label FROM beta_invites WHERE redeemed_by = s.user_id LIMIT 1)                                                     AS invite_label
      FROM settings s
      LEFT JOIN auth.users u ON u.id = s.user_id
    ) c
  ), '[]'::json);
END;
$$;

CREATE OR REPLACE FUNCTION owner_company_usage(p_owner UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE v_day DATE := (NOW() AT TIME ZONE 'Europe/London')::DATE;
BEGIN
  PERFORM _owner_require();
  RETURN COALESCE((
    SELECT json_agg(r ORDER BY r.day DESC) FROM (
      SELECT d::DATE AS day,
             COALESCE((SELECT SUM(count) FROM ai_usage WHERE owner_id = p_owner AND kind = 'ai'   AND day = d::DATE), 0) AS ai,
             COALESCE((SELECT SUM(count) FROM ai_usage WHERE owner_id = p_owner AND kind = 'send' AND day = d::DATE), 0) AS send
      FROM generate_series(v_day - 13, v_day, INTERVAL '1 day') AS d
    ) r
  ), '[]'::json);
END;
$$;

-- ── Limits and pausing ───────────────────────────────────────────────────────
-- NULL = go back to the platform default (100 AI, 60 messages a day)
CREATE OR REPLACE FUNCTION owner_set_limits(p_owner UUID, p_ai INTEGER, p_send INTEGER)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM _owner_require();
  IF (p_ai IS NOT NULL AND (p_ai < 0 OR p_ai > 100000)) OR (p_send IS NOT NULL AND (p_send < 0 OR p_send > 100000)) THEN
    RETURN json_build_object('error', 'out_of_range');
  END IF;
  UPDATE settings SET ai_daily_limit = p_ai, send_daily_limit = p_send WHERE user_id = p_owner;
  IF NOT FOUND THEN RETURN json_build_object('error', 'not_found'); END IF;
  PERFORM _owner_audit('set_limits', p_owner, jsonb_build_object('ai', p_ai, 'send', p_send));
  RETURN json_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION owner_set_paused(p_owner UUID, p_paused BOOLEAN)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM _owner_require();
  UPDATE settings SET paused = COALESCE(p_paused, FALSE) WHERE user_id = p_owner;
  IF NOT FOUND THEN RETURN json_build_object('error', 'not_found'); END IF;
  PERFORM _owner_audit(CASE WHEN p_paused THEN 'pause' ELSE 'resume' END, p_owner, '{}'::jsonb);
  RETURN json_build_object('ok', true);
END;
$$;

-- ── Invite codes ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION owner_list_invites()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
  PERFORM _owner_require();
  RETURN COALESCE((
    SELECT json_agg(i ORDER BY i.created_at DESC) FROM (
      SELECT b.id, b.code, b.label, b.created_at, b.expires_at, b.redeemed_at,
             (SELECT company_name FROM settings WHERE user_id = b.redeemed_by) AS redeemed_by_company,
             CASE WHEN b.redeemed_at IS NOT NULL THEN 'used'
                  WHEN b.expires_at IS NOT NULL AND b.expires_at < NOW() THEN 'expired'
                  ELSE 'unused' END AS status
      FROM beta_invites b
    ) i
  ), '[]'::json);
END;
$$;

CREATE OR REPLACE FUNCTION owner_create_invite(p_label TEXT, p_days INTEGER)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code TEXT;
  v_row  beta_invites%ROWTYPE;
BEGIN
  PERFORM _owner_require();
  v_code := 'BOS-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4)) || '-' ||
                      upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4)) || '-' ||
                      upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
  INSERT INTO beta_invites (code, label, expires_at)
  VALUES (v_code, left(btrim(COALESCE(p_label, '')), 120),
          CASE WHEN p_days IS NULL OR p_days <= 0 THEN NULL ELSE NOW() + (LEAST(p_days, 365) || ' days')::INTERVAL END)
  RETURNING * INTO v_row;
  PERFORM _owner_audit('create_invite', NULL, jsonb_build_object('label', v_row.label));
  RETURN json_build_object('ok', true, 'id', v_row.id, 'code', v_row.code, 'label', v_row.label, 'expires_at', v_row.expires_at);
END;
$$;

CREATE OR REPLACE FUNCTION owner_delete_invite(p_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_label TEXT;
BEGIN
  PERFORM _owner_require();
  DELETE FROM beta_invites WHERE id = p_id AND redeemed_at IS NULL RETURNING label INTO v_label;
  IF NOT FOUND THEN RETURN json_build_object('error', 'not_found_or_used'); END IF;
  PERFORM _owner_audit('delete_invite', NULL, jsonb_build_object('label', v_label));
  RETURN json_build_object('ok', true);
END;
$$;

-- ── Feedback ─────────────────────────────────────────────────────────────────
-- Called by signed-in contractors from the "Report a problem" button. 20 a day per person.
CREATE OR REPLACE FUNCTION submit_feedback(p_page TEXT, p_message TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_owner UUID;
  v_msg   TEXT := btrim(COALESCE(p_message, ''));
BEGIN
  IF v_uid IS NULL OR NOT is_contractor() THEN RETURN json_build_object('error', 'not_allowed'); END IF;
  IF v_msg = '' THEN RETURN json_build_object('error', 'empty'); END IF;
  IF length(v_msg) > 4000 THEN RETURN json_build_object('error', 'too_long'); END IF;
  IF (SELECT COUNT(*) FROM feedback WHERE user_id = v_uid AND created_at > NOW() - INTERVAL '1 day') >= 20 THEN
    RETURN json_build_object('error', 'limit');
  END IF;
  v_owner := get_effective_owner_id();
  INSERT INTO feedback (owner_id, user_id, email, company_name, page, message)
  VALUES (v_owner, v_uid,
          COALESCE((SELECT email FROM auth.users WHERE id = v_uid), ''),
          COALESCE((SELECT company_name FROM settings WHERE user_id = v_owner), ''),
          left(COALESCE(p_page, ''), 300), v_msg);
  RETURN json_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION owner_list_feedback()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
  PERFORM _owner_require();
  RETURN COALESCE((SELECT json_agg(f ORDER BY f.created_at DESC) FROM (SELECT * FROM feedback ORDER BY created_at DESC LIMIT 300) f), '[]'::json);
END;
$$;

CREATE OR REPLACE FUNCTION owner_update_feedback(p_id UUID, p_status TEXT, p_note TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM _owner_require();
  IF p_status NOT IN ('new', 'seen', 'done') THEN RETURN json_build_object('error', 'bad_status'); END IF;
  UPDATE feedback SET status = p_status, note = left(COALESCE(p_note, ''), 2000) WHERE id = p_id;
  IF NOT FOUND THEN RETURN json_build_object('error', 'not_found'); END IF;
  PERFORM _owner_audit('update_feedback', NULL, jsonb_build_object('status', p_status));
  RETURN json_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION owner_audit_list()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
  PERFORM _owner_require();
  RETURN COALESCE((
    SELECT json_agg(a ORDER BY a.at DESC) FROM (
      SELECT l.id, l.at, l.admin_email, l.action, l.target_owner, l.details,
             (SELECT company_name FROM settings WHERE user_id = l.target_owner) AS target_company
      FROM owner_audit_log l ORDER BY l.at DESC LIMIT 200
    ) a
  ), '[]'::json);
END;
$$;

-- ── Pausing is enforced by the usage check (replaces the version in usage-limits.sql; adds the paused test) ─────
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

  IF is_contractor() THEN
    v_owner := get_effective_owner_id();
  ELSIF p_allow_portal THEN
    SELECT admin_user_id INTO v_owner FROM profiles WHERE id = v_uid AND role = 'subcontractor';
  END IF;
  IF v_owner IS NULL THEN
    RETURN json_build_object('allowed', false, 'reason', 'not_allowed');
  END IF;

  IF EXISTS (SELECT 1 FROM settings WHERE user_id = v_owner AND paused) THEN
    RETURN json_build_object('allowed', false, 'reason', 'paused');
  END IF;

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

-- ── Registration also records the terms version the person accepted (read from their sign-up details) ────────────
CREATE OR REPLACE FUNCTION redeem_beta_invite(p_code TEXT, p_company_name TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_email TEXT;
  v_meta  JSONB;
  v_name  TEXT := btrim(COALESCE(p_company_name, ''));
  v_inv   beta_invites%ROWTYPE;
  v_when  TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('error', 'not_signed_in');
  END IF;

  SELECT email, raw_user_meta_data INTO v_email, v_meta FROM auth.users WHERE id = v_uid AND email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN
    RETURN json_build_object('error', 'not_verified');
  END IF;

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

  BEGIN
    v_when := NULLIF(v_meta ->> 'terms_accepted_at', '')::TIMESTAMPTZ;
  EXCEPTION WHEN OTHERS THEN
    v_when := NULL;
  END;

  UPDATE beta_invites SET redeemed_by = v_uid, redeemed_at = NOW() WHERE id = v_inv.id;

  INSERT INTO profiles (id, role, admin_user_id) VALUES (v_uid, 'admin', NULL)
  ON CONFLICT (id) DO UPDATE SET role = 'admin', admin_user_id = NULL;

  INSERT INTO settings (user_id, company_name, tagline, contact, phone, email, address, logo, terms_accepted_at, terms_version)
  VALUES (v_uid, v_name, '', '', '', v_email, '', '', v_when, NULLIF(btrim(COALESCE(v_meta ->> 'terms_version', '')), ''))
  ON CONFLICT (user_id) DO NOTHING;

  RETURN json_build_object('ok', true);
END;
$$;

-- ── Who may call what ────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION _owner_require()                         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION _owner_audit(TEXT, UUID, JSONB)          FROM PUBLIC, anon, authenticated;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'is_platform_admin()', 'is_platform_admin_listed()', 'owner_overview()', 'owner_companies()', 'owner_company_usage(uuid)',
    'owner_set_limits(uuid,integer,integer)', 'owner_set_paused(uuid,boolean)', 'owner_list_invites()',
    'owner_create_invite(text,integer)', 'owner_delete_invite(uuid)', 'submit_feedback(text,text)', 'owner_list_feedback()',
    'owner_update_feedback(uuid,text,text)', 'owner_audit_list()', 'consume_usage(text,text,boolean)', 'redeem_beta_invite(text,text)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;

COMMIT;
