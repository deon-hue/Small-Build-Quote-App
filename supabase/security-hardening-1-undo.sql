-- security-hardening-1-undo.sql — puts everything security-hardening-1.sql changed back as it was.
-- Only run this if something stopped working after the hardening script. Running it re-opens the holes it closed,
-- so tell Claude what broke instead of leaving it undone.

BEGIN;

-- 1. team_members: back to the original owner rule and the member self-update rule
DROP TRIGGER IF EXISTS team_members_guard_trg ON team_members;
DROP FUNCTION IF EXISTS team_members_guard();

DROP POLICY IF EXISTS "team: owner select" ON team_members;
DROP POLICY IF EXISTS "team: owner insert" ON team_members;
DROP POLICY IF EXISTS "team: owner update" ON team_members;
DROP POLICY IF EXISTS "team: owner delete" ON team_members;
DROP POLICY IF EXISTS "team: owner full access"  ON team_members;
DROP POLICY IF EXISTS "team: member updates own" ON team_members;

CREATE POLICY "team: owner full access" ON team_members
  FOR ALL TO authenticated
  USING  (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "team: member updates own" ON team_members
  FOR UPDATE TO authenticated
  USING  (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- 2. sign-up link trigger: back to matching on the email alone
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
    AND status = 'invited';
  RETURN NEW;
END;
$$;

-- 3. profiles: restore self-insert
DROP POLICY IF EXISTS "profiles_self_insert" ON profiles;
CREATE POLICY "profiles_self_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- 4. portal comments: previous helper and policies
CREATE OR REPLACE FUNCTION quote_belongs_to_portal_user(p_quote_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM quotes
    WHERE id = p_quote_id
      AND LOWER(customer ->> 'email') = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
  );
$$;

DROP POLICY IF EXISTS "Portal clients see non-internal comments" ON quote_comments;
CREATE POLICY "Portal clients see non-internal comments" ON quote_comments
  FOR SELECT USING (
    NOT is_internal AND quote_belongs_to_portal_user(quote_id)
  );

DROP POLICY IF EXISTS "Portal clients can create comments" ON quote_comments;
CREATE POLICY "Portal clients can create comments" ON quote_comments
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    NOT is_internal AND
    quote_belongs_to_portal_user(quote_id)
  );

-- 5. quote_requests: restore the anonymous insert
DROP POLICY IF EXISTS "Public insert quote_requests" ON quote_requests;
CREATE POLICY "Public insert quote_requests" ON quote_requests
  FOR INSERT WITH CHECK (true);

-- 6. functions: give signed-out visitors their original access back, and the default for new functions
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
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC, anon, authenticated, service_role', r.sig);
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO PUBLIC, anon;

COMMIT;
