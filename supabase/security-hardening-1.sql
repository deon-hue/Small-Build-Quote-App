-- security-hardening-1.sql — closes the live security holes found in the multi-company review (2026-10-03).
-- Run in the Supabase SQL Editor AFTER the matching code is deployed (it is: /team/accept now sends the invite
-- token, the app now calls touch_team_member_activity()). Safe to run twice. To go back: security-hardening-1-undo.sql.
--
--  1. Team takeover      — nobody can add themselves to a company's team or change whose team a row is on
--  2. Invite takeover    — signing up only joins a team if the invite token from the link is presented
--  3. Forged profiles    — people can no longer write their own profile row (the portal functions do it)
--  4. Portal comments    — a session with no email can no longer match quotes that have a blank customer email
--  5. Public inbox spam  — the anonymous insert on quote_requests is removed (the real form uses the server)
--  6. Anonymous functions — database functions can no longer be run by signed-out visitors (except invite lookup)

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. team_members: owners manage their own rows, but only within strict limits
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "team: owner full access"  ON team_members;
DROP POLICY IF EXISTS "team: owner select"       ON team_members;
DROP POLICY IF EXISTS "team: owner insert"       ON team_members;
DROP POLICY IF EXISTS "team: owner update"       ON team_members;
DROP POLICY IF EXISTS "team: owner delete"       ON team_members;
DROP POLICY IF EXISTS "team: member updates own" ON team_members;

CREATE POLICY "team: owner select" ON team_members
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "team: owner insert" ON team_members
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND status = 'invited' AND auth_user_id IS NULL);
CREATE POLICY "team: owner update" ON team_members
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "team: owner delete" ON team_members
  FOR DELETE TO authenticated USING (owner_id = auth.uid());
-- ("team: member reads own" is left as it is: a member can read their own record.)

-- Policies can't say "this column must not change", so a trigger does. It only restrains people using the
-- app (signed in). The sign-up link trigger, the service role and this SQL editor have no signed-in user
-- (auth.uid() is NULL), so they are not affected.
CREATE OR REPLACE FUNCTION team_members_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- A new row is always just an invitation; only the sign-up trigger can link and activate it.
    NEW.status       := 'invited';
    NEW.auth_user_id := NULL;
  ELSE
    -- Whose team it is, and which login it is, can never be edited from the app.
    NEW.owner_id     := OLD.owner_id;
    NEW.auth_user_id := OLD.auth_user_id;
    -- An invitation nobody has accepted can't be flipped to active by hand.
    IF NEW.status = 'active' AND OLD.auth_user_id IS NULL THEN
      NEW.status := OLD.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_members_guard_trg ON team_members;
CREATE TRIGGER team_members_guard_trg
  BEFORE INSERT OR UPDATE ON team_members
  FOR EACH ROW EXECUTE FUNCTION team_members_guard();

-- Members record "last active" through this function instead of editing their own row.
CREATE OR REPLACE FUNCTION touch_team_member_activity()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE team_members SET last_active_at = NOW() WHERE auth_user_id = auth.uid();
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. Invite takeover: joining a team needs the invite token, not just the invited email address
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION link_team_member_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE team_members
  SET
    auth_user_id   = NEW.id,
    status         = 'active',
    last_active_at = NOW()
  WHERE LOWER(email) = LOWER(NEW.email)
    AND status = 'invited'
    AND invite_token::text = NEW.raw_user_meta_data ->> 'invite_token';
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. profiles: created only by create_customer_profile() / create_sub_profile() (SECURITY DEFINER)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles_self_insert" ON profiles;

-- ─────────────────────────────────────────────────────────────
-- 4. Portal comments / quote documents: an empty email must never match
-- ─────────────────────────────────────────────────────────────
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

DROP POLICY IF EXISTS "Portal clients see non-internal comments" ON quote_comments;
CREATE POLICY "Portal clients see non-internal comments" ON quote_comments
  FOR SELECT TO authenticated USING (
    NOT is_internal AND quote_belongs_to_portal_user(quote_id)
  );

DROP POLICY IF EXISTS "Portal clients can create comments" ON quote_comments;
CREATE POLICY "Portal clients can create comments" ON quote_comments
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid() AND
    NOT is_internal AND
    quote_belongs_to_portal_user(quote_id)
  );

-- ─────────────────────────────────────────────────────────────
-- 5. quote_requests: the public form inserts through the server (service role); no anonymous insert needed
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public insert quote_requests" ON quote_requests;

-- ─────────────────────────────────────────────────────────────
-- 6. Signed-out visitors can't run database functions — except the invite lookup the accept page needs.
--    (Trigger functions and extension functions are left alone.)
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prorettype <> 'trigger'::regtype
      AND p.proname NOT IN ('get_invite_details')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;

-- Functions created from now on are not runnable by signed-out visitors unless granted deliberately.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;

COMMIT;
