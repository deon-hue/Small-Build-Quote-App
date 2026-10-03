-- ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
-- │ STAGING SETUP — run this ONLY on the "BuildOS Staging" Supabase project.                       │
-- │ The check below stops it if it is pasted into the live database by mistake.                    │
-- └──────────────────────────────────────────────────────────────────────────────────────────────┘
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = 'deon@smallbuildcompany.com') THEN
    RAISE EXCEPTION 'STOP: this looks like the LIVE database (it has the live owner account). Nothing was changed.';
  END IF;
END
$guard$;


-- ═══════════════════════════════ jobs-archive.sql ═══════════════════════════════
-- Archiving a completed job hides it from the Jobs list without deleting anything —
-- all related data (notes, documents, payments, variations, invoices, Gantt state)
-- stays exactly as it was, keyed off the same job id, for future reference.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;

-- ═══════════════════════════════ jobs-title.sql ═══════════════════════════════
-- A job's "title" is a free-text name the estimator types in (e.g. "Rear extension for
-- the Pattersons"), separate from its Type (the template category dropdown, e.g. "Rear
-- Extension"). Wherever the app used to show Type as the job's name, it now shows the
-- title instead, falling back to Type for jobs that don't have one set yet.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';

-- ═══════════════════════════════ quotes-title.sql ═══════════════════════════════
-- A quote's "title" is the same free-text job name introduced for jobs (see
-- jobs-title.sql) — captured right at the start of quoting so it's already set on the
-- Job when the quote is converted, instead of needing to be typed a second time.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';

-- ═══════════════════════════════ jobs-color.sql ═══════════════════════════════
-- An estimator can pick one of the 10 JOB_COLORS swatches for a job, overriding the
-- automatic per-id colour used everywhere a job is shown in colour (Jobs list, Gantt
-- chart, Calendar, Notes picker). Empty/null means "no manual pick" — falls back to the
-- automatic colour via resolveJobColor() in lib/utils.ts.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS color TEXT;

-- ═══════════════════════════════ quotes-expiry.sql ═══════════════════════════════
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS expiry_days INTEGER,
  ADD COLUMN IF NOT EXISTS pre_archive_status TEXT;

-- ═══════════════════════════════ contracts.sql ═══════════════════════════════
-- contracts.sql — FMB contract drafting, sending and digital signing per job
-- Run in Supabase SQL Editor

-- ── 1. Table ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contracts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id               UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  quote_id             UUID REFERENCES quotes(id),
  status               TEXT NOT NULL DEFAULT 'draft',        -- 'draft' | 'sent' | 'signed'
  fields               JSONB NOT NULL DEFAULT '{}'::jsonb,   -- every filled-in field, keyed by lib/fmb-contract.ts field names
  payment_mode         TEXT NOT NULL DEFAULT 'simple',       -- 'simple' | 'staged'
  payment_schedule     JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{date, amount}], staged mode only
  second_client_name   TEXT,
  draft_attachment_id  UUID REFERENCES job_attachments(id),
  signed_attachment_id UUID REFERENCES job_attachments(id),
  builder_signed_at    TIMESTAMPTZ,
  builder_signed_by    TEXT,
  client_signed_at     TIMESTAMPTZ,
  client_signed_by     TEXT,
  client2_signed_at    TIMESTAMPTZ,
  client2_signed_by    TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own contracts" ON contracts;
CREATE POLICY "Own contracts" ON contracts
  FOR ALL USING (user_id = auth.uid());

-- ── 3. Index ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS contracts_job_id_idx ON contracts(job_id);

-- ── 4. Portal RPC — SECURITY DEFINER so the customer can read their job's contracts ──
-- Mirrors get_job_attachments_for_portal (supabase/phase27.sql) exactly.
CREATE OR REPLACE FUNCTION get_job_contracts_for_portal(p_job_id UUID)
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email    TEXT;
  v_admin_id UUID;
  v_result   JSON;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN RETURN '[]'::JSON; END IF;

  SELECT j.user_id INTO v_admin_id
  FROM jobs j
  WHERE j.id = p_job_id
    AND EXISTS (
      SELECT 1 FROM clients c
      WHERE c.user_id = j.user_id
        AND LOWER(c.email) = LOWER(v_email)
        AND (
          LOWER(j.client) = LOWER(c.name)
          OR LOWER(j.client) = LOWER(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')))
          OR (c.last_name IS NOT NULL AND c.last_name <> ''
              AND LOWER(j.client) LIKE '%' || LOWER(c.last_name) || '%')
        )
    )
  LIMIT 1;

  IF v_admin_id IS NULL THEN RETURN '[]'::JSON; END IF;

  -- draft_storage_path/signed_storage_path are resolved here (SECURITY DEFINER,
  -- so it can read job_attachments regardless of that table's own RLS, which
  -- only allows the job's owner) rather than making the portal client do a
  -- second, RLS-blocked lookup — mirrors get_job_attachments_for_portal, which
  -- hands back storage_path directly for the same reason.
  SELECT json_agg(
    json_build_object(
      'id',                   c.id,
      'status',                c.status,
      'second_client_name',    c.second_client_name,
      'client_signed_at',      c.client_signed_at,
      'client_signed_by',      c.client_signed_by,
      'client2_signed_at',     c.client2_signed_at,
      'client2_signed_by',     c.client2_signed_by,
      'created_at',            c.created_at,
      'draft_storage_path',    da.storage_path,
      'signed_storage_path',   sa.storage_path
    )
    ORDER BY c.created_at ASC
  ) INTO v_result
  FROM contracts c
  LEFT JOIN job_attachments da ON da.id = c.draft_attachment_id
  LEFT JOIN job_attachments sa ON sa.id = c.signed_attachment_id
  WHERE c.job_id = p_job_id AND c.user_id = v_admin_id;

  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION get_job_contracts_for_portal(UUID) TO authenticated;

-- ── 5. Portal RPC — client signs a contract (mirrors approve_quote, supabase/phase4.sql) ──
CREATE OR REPLACE FUNCTION sign_contract(p_contract_id UUID, p_role TEXT, p_signature TEXT)
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email    TEXT;
  v_contract RECORD;
BEGIN
  IF p_role NOT IN ('client', 'client2') THEN
    RETURN json_build_object('error', 'invalid_role');
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN RETURN json_build_object('error', 'not_authorized'); END IF;

  -- Verify this portal customer has access to the contract's job (same check as
  -- get_job_contracts_for_portal, inlined here so this RPC checks access itself).
  SELECT c.* INTO v_contract
  FROM contracts c
  JOIN jobs j ON j.id = c.job_id
  WHERE c.id = p_contract_id
    AND EXISTS (
      SELECT 1 FROM clients cl
      WHERE cl.user_id = j.user_id
        AND LOWER(cl.email) = LOWER(v_email)
        AND (
          LOWER(j.client) = LOWER(cl.name)
          OR LOWER(j.client) = LOWER(TRIM(COALESCE(cl.first_name,'') || ' ' || COALESCE(cl.last_name,'')))
          OR (cl.last_name IS NOT NULL AND cl.last_name <> ''
              AND LOWER(j.client) LIKE '%' || LOWER(cl.last_name) || '%')
        )
    );

  IF NOT FOUND THEN RETURN json_build_object('error', 'contract_not_found'); END IF;
  IF v_contract.status <> 'sent' THEN
    RETURN json_build_object('error', 'already_actioned', 'status', v_contract.status);
  END IF;

  IF p_role = 'client' THEN
    v_contract.client_signed_at := NOW();
  ELSE
    v_contract.client2_signed_at := NOW();
  END IF;

  -- Fully signed once the client has signed, and the second client too if this
  -- contract has one — the app-side finalize step (flattening + storing the
  -- signed PDF) is triggered by the caller when this comes back 'signed'.
  IF v_contract.client_signed_at IS NOT NULL
     AND (v_contract.second_client_name IS NULL OR v_contract.client2_signed_at IS NOT NULL) THEN
    v_contract.status := 'signed';
  END IF;

  UPDATE contracts SET
    client_signed_at  = v_contract.client_signed_at,
    client_signed_by  = CASE WHEN p_role = 'client' THEN p_signature ELSE client_signed_by END,
    client2_signed_at = v_contract.client2_signed_at,
    client2_signed_by = CASE WHEN p_role = 'client2' THEN p_signature ELSE client2_signed_by END,
    status             = v_contract.status,
    updated_at         = NOW()
  WHERE id = p_contract_id;

  RETURN json_build_object('success', true, 'signed_at', NOW(), 'status', v_contract.status);
END;
$$;

GRANT EXECUTE ON FUNCTION sign_contract(UUID, TEXT, TEXT) TO authenticated;

-- ═══════════════════════════════ quote-documents-category.sql ═══════════════════════════════
-- quote-documents-category.sql — lets a quote attachment carry the same
-- document/plan/photo category a job attachment has, so copy-quote-plans
-- (app/api/copy-quote-plans/route.ts) can preserve it on conversion instead
-- of always labelling every carried-over file 'plan'.
ALTER TABLE quote_documents
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS label TEXT;

-- ═══════════════════════════════ quote-documents-portal.sql ═══════════════════════════════
-- quote-documents-portal.sql — exposes a quote's attachments (New Quote/Quick Quote's
-- Attachments section) to the client portal. Until this runs, files attached to a quote
-- are invisible to the client — the portal has never had any way to read quote_documents.
-- Run in Supabase SQL Editor.

CREATE OR REPLACE FUNCTION get_quote_documents_for_portal(p_quote_id UUID)
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_result   JSON;
BEGIN
  -- Reuses the same ownership check quote_comments already relies on (supabase/
  -- phase50-quote-comments-portal-client.sql) — does this quote belong to the
  -- currently logged-in portal user's email.
  IF NOT quote_belongs_to_portal_user(p_quote_id) THEN
    RETURN '[]'::JSON;
  END IF;

  SELECT user_id INTO v_owner_id FROM quotes WHERE id = p_quote_id;
  IF v_owner_id IS NULL THEN RETURN '[]'::JSON; END IF;

  SELECT json_agg(
    json_build_object(
      'id',           d.id,
      'file_name',    d.filename,
      'storage_path', d.storage_path,
      'mime_type',    d.mime_type,
      'file_size',    d.file_size,
      'category',     COALESCE(d.category, 'document'),
      'label',        d.label,
      'created_at',   d.uploaded_at
    )
    ORDER BY d.uploaded_at ASC
  ) INTO v_result
  FROM quote_documents d
  WHERE d.quote_id = p_quote_id::text AND d.user_id = v_owner_id;

  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION get_quote_documents_for_portal(UUID) TO authenticated;

-- Storage RLS: quote-documents bucket currently only lets the owning contractor
-- read their own folder ("Quote docs: users read own", supabase/phase9.sql) —
-- createSignedUrl still needs to work for the portal customer's session too.
-- A signed URL is generated server-side by the app's own service/authenticated
-- client the same way app/api/portal/job-attachments does it, so no additional
-- storage policy is required here; this file only adds the RPC above.

-- ═══════════════════════════════ time-log-paid-method.sql ═══════════════════════════════
-- How a PAYE worker's day was paid: 'cash' or 'paye' (through payroll). NULL means it was paid
-- before this was recorded, and shows as just "Paid". Run in the Supabase SQL Editor.
ALTER TABLE sub_admin_time_logs ADD COLUMN IF NOT EXISTS paid_method TEXT;

-- ═══════════════════════════════ performance-indexes.sql ═══════════════════════════════
-- performance-indexes.sql — indexes on the columns the app filters by on almost every request.
-- Almost every query is "WHERE user_id = ..." (and every row-level-security policy checks it too),
-- and most tables had no index on it, so Postgres read the whole table each time. Harmless now,
-- noticeably slower as jobs, quotes, time logs etc. build up.
--
-- Safe to run more than once, and safe if a table or column doesn't exist in your database: each
-- index is only created if its table and column are really there. Run in the Supabase SQL Editor.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('jobs',                 'user_id'),
      ('quotes',               'user_id'),
      ('invoices',             'user_id'),
      ('variations',           'user_id'),
      ('job_notes',            'user_id'),
      ('bills',                'user_id'),
      ('job_payments',         'user_id'),
      ('gantt_states',         'user_id'),
      ('gantt_states',         'job_id'),
      ('sub_contracts',        'user_id'),
      ('sub_contracts',        'contact_id'),
      ('sub_time_entries',     'user_id'),
      ('sub_time_entries',     'contact_id'),
      ('sub_payment_stages',   'user_id'),
      ('sub_admin_time_logs',  'user_id'),
      ('sub_admin_time_logs',  'contact_id'),
      ('sub_admin_time_logs',  'job_id'),
      ('quote_documents',      'user_id'),
      ('quote_documents',      'quote_id'),
      ('invoices',             'job_id'),
      ('variations',           'job_id'),
      ('job_notes',            'job_id'),
      ('job_payments',         'job_id'),
      ('team_members',         'auth_user_id')
    ) AS v(tbl, col)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
      WHERE c.table_schema = 'public' AND c.table_name = r.tbl AND c.column_name = r.col
    ) THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%I)', 'idx_' || r.tbl || '_' || r.col, r.tbl, r.col);
      RAISE NOTICE 'index ensured: %(%)', r.tbl, r.col;
    ELSE
      RAISE NOTICE 'skipped (not found): %(%)', r.tbl, r.col;
    END IF;
  END LOOP;
END $$;

-- ═══════════════════════════════ company-details.sql ═══════════════════════════════
-- Company registration details printed on quotes and invoices (Company Details on the Settings page).
-- vat_number and company_number were also in phase11.sql; IF NOT EXISTS makes this safe to run either way.
-- Run in the Supabase SQL editor. Until it is run, these three fields simply don't save (everything else does).

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS vat_number     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS company_number TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS website        TEXT NOT NULL DEFAULT '';

-- ═══════════════════════════════ security-hardening-1.sql ═══════════════════════════════
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
