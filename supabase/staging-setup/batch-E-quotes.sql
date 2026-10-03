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


-- ═══════════════════════════════ phase46.sql ═══════════════════════════════
-- ============================================================
-- Phase 46: Show admin-logged time in sub-portal
-- The sub-portal was only reading sub_time_entries (sub-submitted).
-- Admin weekly timesheets write to sub_admin_time_logs — this
-- update unions both tables so subs see all their recorded time.
-- Run in Supabase SQL Editor.
-- ============================================================

CREATE OR REPLACE FUNCTION get_sub_portal_data()
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email          TEXT;
  v_admin_id       UUID;
  v_contact_id     UUID;
  v_profile        RECORD;
  v_contact        RECORD;
  v_settings       RECORD;
  v_contracts      JSON;
  v_time_entries   JSON;
  v_payment_stages JSON;
  v_sub_name       TEXT;
  v_jobs           JSON;
  v_sub_rates      JSON;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
  IF NOT FOUND                         THEN RETURN json_build_object('error', 'no_profile');        END IF;
  IF v_profile.role = 'admin'          THEN RETURN json_build_object('error', 'is_admin');          END IF;
  IF v_profile.role <> 'subcontractor' THEN RETURN json_build_object('error', 'not_subcontractor'); END IF;

  v_admin_id := v_profile.admin_user_id;
  IF v_admin_id IS NULL THEN RETURN json_build_object('error', 'no_admin_linked'); END IF;

  -- Resolve contact + rates
  SELECT
    c.id,
    COALESCE(NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')), ''), c.name),
    c.sub_hourly_rate,
    c.sub_day_rate,
    c.sub_half_day_rate,
    c.sub_payment_type
  INTO v_contact_id, v_sub_name,
       v_contact.sub_hourly_rate, v_contact.sub_day_rate,
       v_contact.sub_half_day_rate, v_contact.sub_payment_type
  FROM clients c
  WHERE c.user_id      = v_admin_id
    AND LOWER(c.email) = LOWER(v_email)
    AND c.client_type  = 'subcontractor'
  LIMIT 1;

  IF v_contact_id IS NULL THEN RETURN json_build_object('error', 'no_sub_linked'); END IF;

  SELECT * INTO v_contact FROM clients WHERE id = v_contact_id;

  -- Company settings
  SELECT * INTO v_settings FROM settings WHERE user_id = v_admin_id LIMIT 1;

  -- Contracts (active only)
  SELECT json_agg(row_to_json(sc)) INTO v_contracts
  FROM (
    SELECT
      sc.id, sc.job_id, sc.type, sc.description,
      sc.rate_type, sc.rate_amount, sc.quoted_amount, sc.status, sc.notes,
      sc.created_at,
      j.type        AS job_type,
      j.client      AS job_client,
      j.address     AS job_address,
      j.stage       AS job_status,
      j.start_date,
      NULL::date AS end_date
    FROM sub_contracts sc
    LEFT JOIN jobs j ON j.id::text = sc.job_id AND j.user_id = v_admin_id
    WHERE sc.user_id    = v_admin_id
      AND sc.contact_id = v_contact_id
      AND sc.status     = 'active'
    ORDER BY sc.created_at DESC
  ) sc;

  -- Time entries: sub-submitted (sub_time_entries) UNION admin-logged (sub_admin_time_logs)
  SELECT json_agg(row_to_json(te)) INTO v_time_entries
  FROM (
    SELECT
      te.id::text,
      te.sub_contract_id::text,
      te.entry_date::text,
      te.units::numeric,
      COALESCE(te.notes, '')::text        AS notes,
      te.status::text,
      COALESCE(te.submitted_by, '')::text AS submitted_by,
      te.admin_notes::text,
      te.start_time::text,
      te.finish_time::text,
      COALESCE(te.break_mins, 0)::int     AS break_mins,
      te.created_at::text,
      te.job_id::text,
      te.rate_type::text,
      te.rate_amount::numeric,
      NULL::numeric                        AS amount,
      'portal'::text                       AS source,
      NULL::date                           AS paid_date,
      NULL::text                           AS payment_method
    FROM sub_time_entries te
    WHERE te.user_id = v_admin_id
      AND (
        (te.sub_contract_id IS NOT NULL AND te.sub_contract_id IN (
          SELECT id FROM sub_contracts
          WHERE contact_id = v_contact_id AND user_id = v_admin_id
        ))
        OR
        (te.sub_contract_id IS NULL AND te.contact_id = v_contact_id)
      )

    UNION ALL

    SELECT
      atl.id::text,
      NULL::text                           AS sub_contract_id,
      atl.entry_date::text,
      COALESCE(
        atl.total_hours,
        CASE atl.rate_type
          WHEN 'day'      THEN 1.0
          WHEN 'half_day' THEN 0.5
          ELSE                 0.0
        END
      )::numeric                           AS units,
      COALESCE(atl.notes, '')::text        AS notes,
      atl.status::text,
      'admin'::text                        AS submitted_by,
      NULL::text                           AS admin_notes,
      atl.start_time::text,
      atl.finish_time::text,
      0::int                               AS break_mins,
      atl.created_at::text,
      atl.job_id::text,
      atl.rate_type::text,
      atl.rate_amount::numeric,
      atl.amount::numeric,
      'admin'::text                        AS source,
      atl.paid_date::date                  AS paid_date,
      CASE
        WHEN atl.status = 'paid'        THEN 'cash'
        WHEN jc.payment_status = 'paid' THEN 'bill'
        ELSE NULL
      END::text                            AS payment_method
    FROM sub_admin_time_logs atl
    LEFT JOIN job_costs jc ON jc.id = atl.job_cost_id
    WHERE atl.user_id    = v_admin_id
      AND atl.contact_id = v_contact_id
      AND atl.entry_type = 'payable'

    ORDER BY entry_date DESC
    LIMIT 200
  ) te;

  -- Payment stages
  SELECT json_agg(row_to_json(ps)) INTO v_payment_stages
  FROM (
    SELECT
      ps.id, ps.sub_contract_id, ps.description, ps.amount,
      ps.due_date, ps.paid_date, ps.xero_bill_id, ps.created_at
    FROM sub_payment_stages ps
    JOIN sub_contracts sc ON sc.id = ps.sub_contract_id
    WHERE sc.user_id    = v_admin_id
      AND sc.contact_id = v_contact_id
    ORDER BY ps.created_at DESC
  ) ps;

  -- Active jobs (for the job picker in the portal)
  SELECT json_agg(row_to_json(j)) INTO v_jobs
  FROM (
    SELECT id, client, type, address, stage
    FROM jobs
    WHERE user_id = v_admin_id AND (done = 0 OR done IS NULL)
    ORDER BY client
  ) j;

  -- Sub's rate profile
  v_sub_rates := json_build_object(
    'hourlyRate',   v_contact.sub_hourly_rate,
    'dayRate',      v_contact.sub_day_rate,
    'halfDayRate',  v_contact.sub_half_day_rate,
    'paymentType',  v_contact.sub_payment_type
  );

  RETURN json_build_object(
    'contracts',     COALESCE(v_contracts,      '[]'::json),
    'timeEntries',   COALESCE(v_time_entries,   '[]'::json),
    'paymentStages', COALESCE(v_payment_stages, '[]'::json),
    'subName',       COALESCE(v_sub_name, v_email),
    'jobs',          COALESCE(v_jobs, '[]'::json),
    'subRates',      v_sub_rates,
    'settings', json_build_object(
      'name',    COALESCE(v_settings.company_name, 'The Small Build Company'),
      'tagline', COALESCE(v_settings.tagline, ''),
      'email',   COALESCE(v_settings.email,   ''),
      'phone',   COALESCE(v_settings.phone,   ''),
      'logo',    COALESCE(v_settings.logo,    '')
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_sub_portal_data() TO authenticated;

-- ═══════════════════════════════ phase47.sql ═══════════════════════════════
-- ============================================================
-- Phase 47: Admin preview of the sub-portal for any subcontractor
-- Mirrors get_sub_portal_data but takes a contact_id instead of
-- using auth.uid() — so the admin can view what a sub sees.
-- Run in Supabase SQL Editor.
-- ============================================================

CREATE OR REPLACE FUNCTION get_sub_portal_preview_for_admin(p_contact_id UUID)
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id       UUID;
  v_contact        RECORD;
  v_settings       RECORD;
  v_contracts      JSON;
  v_time_entries   JSON;
  v_payment_stages JSON;
  v_sub_name       TEXT;
  v_jobs           JSON;
  v_sub_rates      JSON;
BEGIN
  -- Caller must be an admin
  SELECT id INTO v_admin_id FROM profiles WHERE id = auth.uid() AND role = 'admin';
  IF NOT FOUND THEN RETURN json_build_object('error', 'not_admin'); END IF;

  -- Load the contact and verify it belongs to this admin
  SELECT * INTO v_contact FROM clients
  WHERE id = p_contact_id AND user_id = v_admin_id AND client_type = 'subcontractor';
  IF NOT FOUND THEN RETURN json_build_object('error', 'contact_not_found'); END IF;

  v_sub_name := COALESCE(
    NULLIF(TRIM(COALESCE(v_contact.first_name,'') || ' ' || COALESCE(v_contact.last_name,'')), ''),
    v_contact.name
  );

  -- Company settings
  SELECT * INTO v_settings FROM settings WHERE user_id = v_admin_id LIMIT 1;

  -- Contracts (active only)
  SELECT json_agg(row_to_json(sc)) INTO v_contracts
  FROM (
    SELECT
      sc.id, sc.job_id, sc.type, sc.description,
      sc.rate_type, sc.rate_amount, sc.quoted_amount, sc.status, sc.notes,
      sc.created_at,
      j.type        AS job_type,
      j.client      AS job_client,
      j.address     AS job_address,
      j.stage       AS job_status,
      j.start_date,
      NULL::date AS end_date
    FROM sub_contracts sc
    LEFT JOIN jobs j ON j.id::text = sc.job_id AND j.user_id = v_admin_id
    WHERE sc.user_id    = v_admin_id
      AND sc.contact_id = p_contact_id
      AND sc.status     = 'active'
    ORDER BY sc.created_at DESC
  ) sc;

  -- Time entries: sub-submitted UNION admin-logged
  -- Explicit casts on all columns to prevent UNION type-mismatch errors
  SELECT json_agg(row_to_json(te)) INTO v_time_entries
  FROM (
    SELECT
      te.id::text,
      te.sub_contract_id::text,
      te.entry_date::text,
      te.units::numeric,
      COALESCE(te.notes, '')::text        AS notes,
      te.status::text,
      COALESCE(te.submitted_by, '')::text AS submitted_by,
      te.admin_notes::text,
      te.start_time::text,
      te.finish_time::text,
      COALESCE(te.break_mins, 0)::int     AS break_mins,
      te.created_at::text,
      te.job_id::text,
      te.rate_type::text,
      te.rate_amount::numeric,
      NULL::numeric                        AS amount,
      'portal'::text                       AS source,
      NULL::date                           AS paid_date,
      NULL::text                           AS payment_method
    FROM sub_time_entries te
    WHERE te.user_id = v_admin_id
      AND (
        (te.sub_contract_id IS NOT NULL AND te.sub_contract_id IN (
          SELECT id FROM sub_contracts WHERE contact_id = p_contact_id AND user_id = v_admin_id
        ))
        OR
        (te.sub_contract_id IS NULL AND te.contact_id = p_contact_id)
      )

    UNION ALL

    SELECT
      atl.id::text,
      NULL::text                           AS sub_contract_id,
      atl.entry_date::text,
      COALESCE(
        atl.total_hours,
        CASE atl.rate_type WHEN 'day' THEN 1.0 WHEN 'half_day' THEN 0.5 ELSE 0.0 END
      )::numeric                           AS units,
      COALESCE(atl.notes, '')::text        AS notes,
      atl.status::text,
      'admin'::text                        AS submitted_by,
      NULL::text                           AS admin_notes,
      atl.start_time::text,
      atl.finish_time::text,
      0::int                               AS break_mins,
      atl.created_at::text,
      atl.job_id::text,
      atl.rate_type::text,
      atl.rate_amount::numeric,
      atl.amount::numeric,
      'admin'::text                        AS source,
      atl.paid_date::date                  AS paid_date,
      CASE
        WHEN atl.status = 'paid'        THEN 'cash'
        WHEN jc.payment_status = 'paid' THEN 'bill'
        ELSE NULL
      END::text                            AS payment_method
    FROM sub_admin_time_logs atl
    LEFT JOIN job_costs jc ON jc.id = atl.job_cost_id
    WHERE atl.user_id    = v_admin_id
      AND atl.contact_id = p_contact_id
      AND atl.entry_type = 'payable'

    ORDER BY entry_date DESC
    LIMIT 200
  ) te;

  -- Payment stages
  SELECT json_agg(row_to_json(ps)) INTO v_payment_stages
  FROM (
    SELECT
      ps.id, ps.sub_contract_id, ps.description, ps.amount,
      ps.due_date, ps.paid_date, ps.xero_bill_id, ps.created_at
    FROM sub_payment_stages ps
    JOIN sub_contracts sc ON sc.id = ps.sub_contract_id
    WHERE sc.user_id    = v_admin_id
      AND sc.contact_id = p_contact_id
    ORDER BY ps.created_at DESC
  ) ps;

  -- Active jobs
  SELECT json_agg(row_to_json(j)) INTO v_jobs
  FROM (
    SELECT id, client, type, address, stage
    FROM jobs
    WHERE user_id = v_admin_id AND (done = 0 OR done IS NULL)
    ORDER BY client
  ) j;

  v_sub_rates := json_build_object(
    'hourlyRate',  v_contact.sub_hourly_rate,
    'dayRate',     v_contact.sub_day_rate,
    'halfDayRate', v_contact.sub_half_day_rate,
    'paymentType', v_contact.sub_payment_type
  );

  RETURN json_build_object(
    'subName',       COALESCE(v_sub_name, ''),
    'contracts',     COALESCE(v_contracts,      '[]'::json),
    'timeEntries',   COALESCE(v_time_entries,   '[]'::json),
    'paymentStages', COALESCE(v_payment_stages, '[]'::json),
    'jobs',          COALESCE(v_jobs, '[]'::json),
    'subRates',      v_sub_rates,
    'settings', json_build_object(
      'name',    COALESCE(v_settings.company_name, 'The Small Build Company'),
      'tagline', COALESCE(v_settings.tagline, ''),
      'email',   COALESCE(v_settings.email,   ''),
      'phone',   COALESCE(v_settings.phone,   ''),
      'logo',    COALESCE(v_settings.logo,    '')
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_sub_portal_preview_for_admin(UUID) TO authenticated;

-- ═══════════════════════════════ phase48.sql ═══════════════════════════════
-- ============================================================
-- Phase 48: Add paid_date to sub_admin_time_logs
-- Run in Supabase SQL Editor.
-- ============================================================

ALTER TABLE sub_admin_time_logs
  ADD COLUMN IF NOT EXISTS paid_date DATE;

-- ═══════════════════════════════ variations-resend.sql ═══════════════════════════════
-- Add resent_at column to variations table to track when variations are resent to clients
ALTER TABLE variations ADD COLUMN IF NOT EXISTS resent_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN variations.resent_at IS 'When the variation was last resent to the client after updates';

-- ═══════════════════════════════ quote-comments.sql ═══════════════════════════════
-- Quote Comments table — for client/contractor communication on quotes

CREATE TABLE IF NOT EXISTS quote_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  author_name TEXT NOT NULL DEFAULT '', -- "You" for contractor, client name for clients
  message TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE, -- Only visible to contractor if true
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE quote_comments ENABLE ROW LEVEL SECURITY;

-- Contractor can see all comments on their quotes
DROP POLICY IF EXISTS "Contractor sees all comments on own quotes" ON quote_comments;
CREATE POLICY "Contractor sees all comments on own quotes" ON quote_comments
  FOR SELECT USING (
    quote_id IN (SELECT id FROM quotes WHERE user_id = auth.uid())
  );

-- Contractor can create comments
DROP POLICY IF EXISTS "Contractor can create comments" ON quote_comments;
CREATE POLICY "Contractor can create comments" ON quote_comments
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    quote_id IN (SELECT id FROM quotes WHERE user_id = auth.uid())
  );

-- Contractor can update/delete their own comments
DROP POLICY IF EXISTS "Contractor can update own comments" ON quote_comments;
CREATE POLICY "Contractor can update own comments" ON quote_comments
  FOR UPDATE USING (user_id = auth.uid());

-- Portal: Clients can see non-internal comments on their quotes
DROP POLICY IF EXISTS "Portal clients see non-internal comments" ON quote_comments;
CREATE POLICY "Portal clients see non-internal comments" ON quote_comments
  FOR SELECT USING (
    NOT is_internal AND
    quote_id IN (SELECT id FROM quotes WHERE customer ->> 'email' = auth.jwt() ->> 'email')
  );

-- ═══════════════════════════════ quote-versioning.sql ═══════════════════════════════
-- ============================================================
-- Quote Versioning System
-- Run this in Supabase SQL Editor
-- ============================================================

-- Add versioning columns to quotes table
ALTER TABLE quotes
ADD COLUMN IF NOT EXISTS version_number INT DEFAULT 1,
ADD COLUMN IF NOT EXISTS parent_quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS created_from_version_id UUID REFERENCES quotes(id) ON DELETE SET NULL;

-- Create index for version lookups
CREATE INDEX IF NOT EXISTS idx_quotes_parent ON quotes(parent_quote_id);
CREATE INDEX IF NOT EXISTS idx_quotes_version ON quotes(parent_quote_id, version_number);

-- Add comment explaining version fields
COMMENT ON COLUMN quotes.version_number IS 'Version number within this quote series (1, 2, 3, etc)';
COMMENT ON COLUMN quotes.parent_quote_id IS 'Parent quote ID if this is a version; NULL if this is the original';
COMMENT ON COLUMN quotes.created_from_version_id IS 'Which version this was created from when making a new version';

-- ═══════════════════════════════ migrations/add_quote_versioning_audit.sql ═══════════════════════════════
-- Quote Versioning and Approval System
-- Extends quotes table with approval/status fields
-- Creates audit log table to track all version events
-- ALSO: Re-enables RLS on quotes and clients tables (was disabled during debugging)

-- ============================================================================
-- 0. RE-ENABLE RLS on quotes and clients (critical security fix)
-- ============================================================================

ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 1. Add new columns to quotes table
-- ============================================================================

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'draft'
  CHECK (status IN ('draft', 'sent', 'current', 'superseded', 'accepted', 'confirmed'));

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS changes_summary TEXT;

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP;

-- ============================================================================
-- 2. Create audit log table
-- ============================================================================

CREATE TABLE IF NOT EXISTS quote_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  event_type VARCHAR NOT NULL CHECK (event_type IN ('sent', 'viewed', 'superseded', 'accepted', 'confirmed')),
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT now(),
  details JSONB DEFAULT NULL
);

-- ============================================================================
-- 3. Create indexes for efficient querying
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_quote_audit_log_quote_id ON quote_audit_log(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_audit_log_event_type ON quote_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_quote_audit_log_created_at ON quote_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_approved_at ON quotes(approved_at);

-- ============================================================================
-- 4. Enable Row-Level Security on audit_log
-- ============================================================================

ALTER TABLE quote_audit_log ENABLE ROW LEVEL SECURITY;

-- Admin (quote owner) can view all audit logs for their quotes
CREATE POLICY "audit_log_select_own_quotes" ON quote_audit_log
  FOR SELECT USING (
    quote_id IN (
      SELECT id FROM quotes WHERE user_id = auth.uid()
    )
  );

-- Admin can insert audit events for their quotes
CREATE POLICY "audit_log_insert_own_quotes" ON quote_audit_log
  FOR INSERT WITH CHECK (
    quote_id IN (
      SELECT id FROM quotes WHERE user_id = auth.uid()
    )
  );

-- Clients (from portal) can view sent versions of quotes (view-only audit trail)
-- This will be implemented in the client portal logic

-- ============================================================================
-- 5. Add comment for clarity
-- ============================================================================

COMMENT ON TABLE quote_audit_log IS 'Tracks all events for quote versions: sent, viewed, superseded, accepted, confirmed. Each row is one event.';
COMMENT ON COLUMN quotes.status IS 'Current lifecycle status of the quote version: draft (internal only), sent (shared with client), current (active version), superseded (replaced by newer version), accepted (client approved), confirmed (locked and accepted)';
COMMENT ON COLUMN quotes.is_locked IS 'If true, quote cannot be edited after client approval';
COMMENT ON COLUMN quotes.changes_summary IS 'Brief summary of changes from previous version (e.g., "Kitchen removed, Total £500 less")';

-- ═══════════════════════════════ phase49-fix-quote-requests-rls.sql ═══════════════════════════════
-- phase49-fix-quote-requests-rls.sql
-- Fixes Supabase Security Advisor warning "sensitive_columns_exposed" on quote_requests.
--
-- Problem: quote_requests had no owner column, and its SELECT/UPDATE/DELETE policies
-- only checked "is the caller logged in" (auth.uid() IS NOT NULL) rather than
-- "does the caller own this data". Any authenticated user — including client-portal
-- and subcontractor-portal accounts, which are real auth.users rows — could read,
-- edit, or delete every prospect's name/email/phone/address in this table.
--
-- Fix: add a user_id column, backfill existing rows to the app owner's account,
-- and scope SELECT/UPDATE/DELETE to auth.uid() = user_id. The public submission
-- form is unaffected — it inserts via the service-role key in
-- app/api/public/submit-quote-request/route.ts, which bypasses RLS entirely.
--
-- Run this in the Supabase SQL Editor.

-- 1. Add the owner column (nullable for now, so the backfill can run)
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 2. Backfill every existing row to the app owner's account
--    (single-tenant today — replace the UUID below if you ever add more owner accounts)
UPDATE quote_requests
SET user_id = 'c1d9fdaf-5f12-4b1d-b6f5-6318be733d71'
WHERE user_id IS NULL;

-- 3. Lock the column going forward
ALTER TABLE quote_requests ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE quote_requests ALTER COLUMN user_id SET DEFAULT 'c1d9fdaf-5f12-4b1d-b6f5-6318be733d71';

CREATE INDEX IF NOT EXISTS quote_requests_user_id_idx ON quote_requests(user_id);

-- 4. Replace the overly-broad policies with owner-scoped ones.
--    INSERT stays public (WITH CHECK true) — that's the intentional client-facing
--    submission path — but the server route now sets user_id explicitly on insert.

DROP POLICY IF EXISTS "Auth select quote_requests" ON quote_requests;
CREATE POLICY "Owner select quote_requests" ON quote_requests
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Auth update quote_requests" ON quote_requests;
CREATE POLICY "Owner update quote_requests" ON quote_requests
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Auth delete quote_requests" ON quote_requests;
CREATE POLICY "Owner delete quote_requests" ON quote_requests
  FOR DELETE USING (auth.uid() = user_id);

-- "Public insert quote_requests" (FOR INSERT WITH CHECK (true)) is left as-is.

-- ═══════════════════════════════ phase50-quote-comments-portal-client.sql ═══════════════════════════════
-- phase50-quote-comments-portal-client.sql
-- Finishes the quote_comments feature so a portal client can actually post a
-- question, and fixes two silent gaps found while doing that:
--
-- 1. The existing "portal client can read comments" policy referenced the
--    quotes table directly in a subquery. quotes only has an owner-scoped
--    policy ("Own quotes": auth.uid() = user_id) — there is no policy letting
--    a portal client read quotes directly at all (the portal instead reads
--    everything through the SECURITY DEFINER get_portal_data() function,
--    which bypasses RLS internally). So that subquery has always evaluated
--    against zero visible rows for a portal client, meaning the "read your
--    own quote's comments" policy has likely never actually worked — it just
--    always looked like "no comments yet" instead of erroring.
-- 2. No DELETE policy existed at all, so the existing delete button in the
--    app silently did nothing (RLS defaults to deny when no policy matches),
--    even though the app-layer ownership check was correct.
--
-- Run this in the Supabase SQL Editor.

-- 1. Optional phase tag — which phase a message is about, stored as a plain
--    text label (not a foreign key) since phases live inside the quote's own
--    JSON data and don't have stable database-level IDs.
ALTER TABLE quote_comments ADD COLUMN IF NOT EXISTS phase_label TEXT;

-- 2. Security-definer helper — checks "does this quote belong to the
--    currently logged-in portal user's email" without needing the caller to
--    have direct SELECT rights on quotes. Same pattern already used by
--    get_portal_data() / get_invite_details() elsewhere in this schema.
--    Returns only a boolean — never exposes quote content.
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

GRANT EXECUTE ON FUNCTION quote_belongs_to_portal_user(UUID) TO authenticated;

-- 3. Re-create the portal client SELECT policy using the helper (fixes the
--    always-empty read described above).
DROP POLICY IF EXISTS "Portal clients see non-internal comments" ON quote_comments;
CREATE POLICY "Portal clients see non-internal comments" ON quote_comments
  FOR SELECT USING (
    NOT is_internal AND quote_belongs_to_portal_user(quote_id)
  );

-- 4. Portal clients can create non-internal comments on their own quote.
DROP POLICY IF EXISTS "Portal clients can create comments" ON quote_comments;
CREATE POLICY "Portal clients can create comments" ON quote_comments
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    NOT is_internal AND
    quote_belongs_to_portal_user(quote_id)
  );

-- 5. Contractor can delete their own comments — was missing entirely.
DROP POLICY IF EXISTS "Contractor can delete own comments" ON quote_comments;
CREATE POLICY "Contractor can delete own comments" ON quote_comments
  FOR DELETE USING (user_id = auth.uid());

-- ═══════════════════════════════ phase51-sub-payment-stage-method.sql ═══════════════════════════════
-- phase51-sub-payment-stage-method.sql
-- Adds a payment method to subcontractor Fixed Quote payment stages, so a
-- stage paid in cash can be recorded as such (rather than just a paid date
-- with no record of how it was actually paid).
--
-- Run this in the Supabase SQL Editor.

ALTER TABLE sub_payment_stages ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- ═══════════════════════════════ phase52-sub-payment-stage-job-cost.sql ═══════════════════════════════
-- phase52-sub-payment-stage-job-cost.sql
-- Links a Fixed Quote payment stage to a job_costs row once it's marked
-- paid, so it actually counts toward that job's Actual Cost / margin on
-- the Dashboard — previously stage payments never touched job_costs at
-- all (unlike the day-rate/timesheet subcontractor flow, which already
-- does this via sub_admin_time_logs.job_cost_id).
--
-- Run this in the Supabase SQL Editor.

ALTER TABLE sub_payment_stages ADD COLUMN IF NOT EXISTS job_cost_id UUID;

-- ═══════════════════════════════ job-notes-ai.sql ═══════════════════════════════
-- AI-powered Job Notes: voice dictation, photos, auto-tagging, action items.
-- Extends the existing job_notes table (raw text preserved separately from the
-- AI-cleaned text) and adds a small note-scoped photo table reusing the existing
-- job-documents storage bucket.

ALTER TABLE job_notes
  ADD COLUMN IF NOT EXISTS raw_note TEXT,
  ADD COLUMN IF NOT EXISTS tag TEXT,
  ADD COLUMN IF NOT EXISTS action_items JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'typed';

CREATE TABLE IF NOT EXISTS job_note_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  note_id UUID NOT NULL REFERENCES job_notes(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE job_note_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own job note photos" ON job_note_photos
  FOR ALL USING (user_id = get_effective_owner_id()) WITH CHECK (user_id = get_effective_owner_id());

-- ═══════════════════════════════ bo-subphase-allowance.sql ═══════════════════════════════
-- Lets a Back Office sub-phase be marked as a simple flat allowance (a single
-- description + £ figure, no Labour/Materials/Plant/Subcontractors breakdown) —
-- for General Preliminaries roles like Project Manager, QS, Foreman, etc.
ALTER TABLE bo_sub_phases ADD COLUMN IF NOT EXISTS is_allowance BOOLEAN NOT NULL DEFAULT false;
