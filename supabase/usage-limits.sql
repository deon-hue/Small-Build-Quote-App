-- usage-limits.sql — daily limits so one company (or a stranger) can't run up the platform's AI / email bills.
-- Run in the Supabase SQL Editor (staging first). Undo: usage-limits-undo.sql. Adds empty tables, two columns and three functions;
-- changes no existing data. Safe to run twice.
--
--  • ai_usage / consume_usage()     per-company daily counter for signed-in features. 'ai' = AI features, 'send' = emails/WhatsApp.
--                                   Default 40 AI uses and 60 messages a day per company; override per company with
--                                   settings.ai_daily_limit / settings.send_daily_limit.
--  • public_usage / consume_public_use()   per-visitor (hashed IP) and whole-site daily counters for the public, signed-out pages.
--
-- Contractors are charged to their own company. A subcontractor using an allowed feature (timesheet parsing) is charged to
-- the contractor they work for. Customers and strangers are refused. The day rolls over at midnight UK time.

BEGIN;

ALTER TABLE settings ADD COLUMN IF NOT EXISTS ai_daily_limit   INTEGER;   -- NULL = platform default (40)
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

  SELECT CASE WHEN p_kind = 'ai' THEN COALESCE(ai_daily_limit, 40) ELSE COALESCE(send_daily_limit, 60) END
    INTO v_limit FROM settings WHERE user_id = v_owner;
  v_limit := COALESCE(v_limit, CASE WHEN p_kind = 'ai' THEN 40 ELSE 60 END);

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
