-- ============================================================
-- Phase 10: Team Members & Multi-User Access
-- Run this in Supabase SQL Editor
-- ============================================================
--
-- SETUP NOTES:
-- 1. Run this entire file in Supabase SQL Editor.
-- 2. Go to Supabase → Authentication → Settings and DISABLE
--    "Enable email confirmations" so invite acceptance works
--    seamlessly (users don't need to verify email separately).
-- 3. The invite acceptance page (/team/accept) works without
--    a service role key — it uses a SECURITY DEFINER function.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. team_members table
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_members (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  auth_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email          TEXT NOT NULL,
  name           TEXT NOT NULL DEFAULT '',
  role           TEXT NOT NULL DEFAULT 'staff',    -- admin | manager | staff | view_only
  status         TEXT NOT NULL DEFAULT 'invited',  -- invited | active | disabled
  permissions    JSONB NOT NULL DEFAULT '{}',
  invite_token   UUID DEFAULT gen_random_uuid(),
  invited_at     TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Owner can manage all their team members
DROP POLICY IF EXISTS "team: owner full access" ON team_members;
CREATE POLICY "team: owner full access" ON team_members
  FOR ALL TO authenticated
  USING  (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Team members can read their own record (to get permissions/status)
DROP POLICY IF EXISTS "team: member reads own" ON team_members;
CREATE POLICY "team: member reads own" ON team_members
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- Team members can update last_active_at on their own record
DROP POLICY IF EXISTS "team: member updates own" ON team_members;
CREATE POLICY "team: member updates own" ON team_members
  FOR UPDATE TO authenticated
  USING  (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- ──────────────────────────────────────────────────────────────
-- 2. get_effective_owner_id()
--    Returns the data-owner's UID for the current session.
--    • Sub-users  → their owner's UID
--    • Owner      → their own UID
--    All RLS policies use this so sub-users see owner's data.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_effective_owner_id()
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT owner_id
      FROM   team_members
      WHERE  auth_user_id = auth.uid()
        AND  status = 'active'
      LIMIT  1
    ),
    auth.uid()
  )
$$;

-- ──────────────────────────────────────────────────────────────
-- 3. Update all existing RLS policies
--    Replace auth.uid() = user_id with get_effective_owner_id()
--    so sub-users transparently access owner's data.
-- ──────────────────────────────────────────────────────────────

-- Jobs
DROP POLICY IF EXISTS "Own jobs" ON jobs;
CREATE POLICY "Own jobs" ON jobs FOR ALL
  USING     (user_id = get_effective_owner_id())
  WITH CHECK (user_id = get_effective_owner_id());

-- Quotes
DROP POLICY IF EXISTS "Own quotes" ON quotes;
CREATE POLICY "Own quotes" ON quotes FOR ALL
  USING     (user_id = get_effective_owner_id())
  WITH CHECK (user_id = get_effective_owner_id());

-- Clients
DROP POLICY IF EXISTS "Own clients" ON clients;
CREATE POLICY "Own clients" ON clients FOR ALL
  USING     (user_id = get_effective_owner_id())
  WITH CHECK (user_id = get_effective_owner_id());

-- Settings
DROP POLICY IF EXISTS "Own settings" ON settings;
CREATE POLICY "Own settings" ON settings FOR ALL
  USING     (user_id = get_effective_owner_id())
  WITH CHECK (user_id = get_effective_owner_id());

-- Gantt states
DROP POLICY IF EXISTS "Own gantt states" ON gantt_states;
CREATE POLICY "Own gantt states" ON gantt_states FOR ALL
  USING     (user_id = get_effective_owner_id())
  WITH CHECK (user_id = get_effective_owner_id());

-- Invoices
DROP POLICY IF EXISTS "Users manage own invoices" ON invoices;
DROP POLICY IF EXISTS "Own invoices" ON invoices;
CREATE POLICY "Own invoices" ON invoices FOR ALL
  USING     (user_id = get_effective_owner_id())
  WITH CHECK (user_id = get_effective_owner_id());

-- Job notes
DROP POLICY IF EXISTS "Users manage own job notes" ON job_notes;
DROP POLICY IF EXISTS "Own job notes" ON job_notes;
CREATE POLICY "Own job notes" ON job_notes FOR ALL
  USING     (user_id = get_effective_owner_id())
  WITH CHECK (user_id = get_effective_owner_id());

-- Variations
DROP POLICY IF EXISTS "Own variations" ON variations;
CREATE POLICY "Own variations" ON variations FOR ALL
  USING     (user_id = get_effective_owner_id())
  WITH CHECK (user_id = get_effective_owner_id());

-- Job type templates
DROP POLICY IF EXISTS "Users manage own job type templates" ON job_type_templates;
DROP POLICY IF EXISTS "Own job type templates" ON job_type_templates;
CREATE POLICY "Own job type templates" ON job_type_templates FOR ALL
  USING     (user_id = get_effective_owner_id())
  WITH CHECK (user_id = get_effective_owner_id());

-- ──────────────────────────────────────────────────────────────
-- 4. get_invite_details(token)
--    Callable by anon (no login required) so the accept page
--    can display invite details before the user signs up.
--    SECURITY DEFINER bypasses RLS — only returns safe fields.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_invite_details(p_token UUID)
RETURNS TABLE (
  member_id     UUID,
  email         TEXT,
  name          TEXT,
  owner_company TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    tm.id,
    tm.email,
    tm.name,
    COALESCE(s.company_name, 'Small Build Company') AS owner_company
  FROM   team_members tm
  LEFT   JOIN settings s ON s.user_id = tm.owner_id
  WHERE  tm.invite_token = p_token
    AND  tm.status = 'invited';
END;
$$;

-- Allow unauthenticated callers (anon key) to call this function
GRANT EXECUTE ON FUNCTION get_invite_details(UUID) TO anon, authenticated;

-- ──────────────────────────────────────────────────────────────
-- 5. Trigger: auto-link auth user → team_members on sign-up
--    When a new Supabase Auth user is created whose email
--    matches an invited team member, link them and activate.
-- ──────────────────────────────────────────────────────────────
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

DROP TRIGGER IF EXISTS on_team_member_signup ON auth.users;
CREATE TRIGGER on_team_member_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION link_team_member_on_signup();
