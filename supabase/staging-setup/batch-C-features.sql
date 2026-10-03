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


-- ═══════════════════════════════ phase22.sql ═══════════════════════════════
-- ============================================================
-- Phase 22: Per-client portal & quote settings
-- Run this in Supabase SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Add portal_settings column to clients
-- ────────────────────────────────────────────────────────────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_settings JSONB DEFAULT '{}';

-- ────────────────────────────────────────────────────────────
-- 2. Re-create get_portal_data — adds client_settings to response
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_portal_data()
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email           TEXT;
  v_admin_id        UUID;
  v_profile         RECORD;
  v_quotes          JSON;
  v_jobs            JSON;
  v_invoices        JSON;
  v_settings        JSON;
  v_variations      JSON;
  v_client_settings JSON;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'no_profile'); END IF;
  IF v_profile.role <> 'customer' THEN RETURN json_build_object('error', 'not_customer'); END IF;
  v_admin_id := v_profile.admin_user_id;
  IF v_admin_id IS NULL THEN
    RETURN json_build_object('error', 'no_admin_linked', 'email', v_email);
  END IF;

  -- Per-client portal settings
  SELECT COALESCE(portal_settings, '{}') INTO v_client_settings
  FROM clients
  WHERE user_id = v_admin_id
    AND LOWER(TRIM(email)) = LOWER(TRIM(v_email))
  LIMIT 1;

  -- Quotes where customer.email matches
  SELECT json_agg(q ORDER BY q.created_at DESC) INTO v_quotes
  FROM quotes q
  WHERE q.user_id = v_admin_id
    AND LOWER((q.customer->>'email')::TEXT) = LOWER(v_email);

  -- Jobs (with gantt_state)
  SELECT json_agg(
    json_build_object(
      'id',          j.id,
      'client',      j.client,
      'type',        j.type,
      'address',     j.address,
      'value',       j.value,
      'stage',       j.stage,
      'start_date',  j.start_date,
      'weeks',       j.weeks,
      'done',        j.done,
      'notes',       j.notes,
      'quote_id',    j.quote_id,
      'created_at',  j.created_at,
      'gantt_state', (
        SELECT gs.state FROM gantt_states gs
        WHERE gs.job_id = j.id AND gs.user_id = v_admin_id LIMIT 1
      )
    ) ORDER BY j.created_at ASC
  ) INTO v_jobs
  FROM jobs j
  WHERE j.user_id = v_admin_id
    AND EXISTS (
      SELECT 1 FROM clients c
      WHERE c.user_id = v_admin_id
        AND LOWER(c.email) = LOWER(v_email)
        AND (
          LOWER(j.client) = LOWER(c.name)
          OR LOWER(j.client) = LOWER(
               TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,''))
             )
          OR (c.last_name IS NOT NULL AND c.last_name <> ''
              AND LOWER(j.client) LIKE '%' || LOWER(c.last_name) || '%')
        )
    );

  -- Invoices where client_email matches
  SELECT json_agg(i ORDER BY i.created_at DESC) INTO v_invoices
  FROM invoices i
  WHERE i.user_id = v_admin_id
    AND LOWER(i.client_email) = LOWER(v_email);

  -- Variations for this customer's jobs (exclude drafts)
  SELECT json_agg(v ORDER BY v.created_at ASC) INTO v_variations
  FROM variations v
  WHERE v.user_id = v_admin_id
    AND v.status <> 'draft'
    AND EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.id = v.job_id AND j.user_id = v_admin_id
        AND EXISTS (
          SELECT 1 FROM clients c
          WHERE c.user_id = v_admin_id
            AND LOWER(c.email) = LOWER(v_email)
            AND (
              LOWER(j.client) = LOWER(c.name)
              OR LOWER(j.client) = LOWER(
                   TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,''))
                 )
              OR (c.last_name IS NOT NULL AND c.last_name <> ''
                  AND LOWER(j.client) LIKE '%' || LOWER(c.last_name) || '%')
            )
        )
    );

  -- Company settings
  SELECT json_build_object(
    'name',    s.company_name,
    'tagline', s.tagline,
    'email',   s.email,
    'phone',   s.phone,
    'address', s.address,
    'logo',    s.logo
  ) INTO v_settings
  FROM settings s WHERE s.user_id = v_admin_id;

  RETURN json_build_object(
    'quotes',          COALESCE(v_quotes,          '[]'::json),
    'jobs',            COALESCE(v_jobs,            '[]'::json),
    'invoices',        COALESCE(v_invoices,        '[]'::json),
    'settings',        COALESCE(v_settings,        '{}'::json),
    'variations',      COALESCE(v_variations,      '[]'::json),
    'client_settings', COALESCE(v_client_settings, '{}'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_portal_data() TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 3. Re-create get_portal_preview_for_admin — adds client_settings
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_portal_preview_for_admin(p_client_email TEXT)
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id        UUID := auth.uid();
  v_client_name     TEXT;
  v_client_settings JSON;
  v_quotes          JSON;
  v_jobs            JSON;
  v_invoices        JSON;
  v_settings        JSON;
  v_variations      JSON;
BEGIN
  SELECT name, COALESCE(portal_settings, '{}')
  INTO v_client_name, v_client_settings
  FROM clients
  WHERE user_id = v_admin_id
    AND LOWER(TRIM(email)) = LOWER(TRIM(p_client_email))
  LIMIT 1;

  SELECT json_agg(q ORDER BY q.created_at DESC) INTO v_quotes
  FROM quotes q
  WHERE q.user_id = v_admin_id
    AND LOWER((q.customer->>'email')::TEXT) = LOWER(TRIM(p_client_email));

  SELECT json_agg(
    json_build_object(
      'id',          j.id,   'client',   j.client,
      'type',        j.type, 'address',  j.address,
      'value',       j.value,'stage',    j.stage,
      'start_date',  j.start_date,       'weeks',    j.weeks,
      'done',        j.done, 'notes',    j.notes,
      'quote_id',    j.quote_id,
      'gantt_state', (SELECT gs.state FROM gantt_states gs
                      WHERE gs.job_id = j.id AND gs.user_id = v_admin_id LIMIT 1)
    ) ORDER BY j.created_at ASC
  ) INTO v_jobs
  FROM jobs j
  WHERE j.user_id = v_admin_id
    AND EXISTS (
      SELECT 1 FROM clients c
      WHERE c.user_id = v_admin_id
        AND LOWER(TRIM(c.email)) = LOWER(TRIM(p_client_email))
        AND (
          LOWER(j.client) = LOWER(c.name)
          OR LOWER(j.client) = LOWER(
               TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,''))
             )
          OR (c.last_name IS NOT NULL AND c.last_name <> ''
              AND LOWER(j.client) LIKE '%' || LOWER(c.last_name) || '%')
        )
    );

  SELECT json_agg(i ORDER BY i.created_at DESC) INTO v_invoices
  FROM invoices i
  WHERE i.user_id = v_admin_id
    AND LOWER(TRIM(i.client_email)) = LOWER(TRIM(p_client_email));

  SELECT json_agg(v ORDER BY v.created_at ASC) INTO v_variations
  FROM variations v
  WHERE v.user_id = v_admin_id
    AND v.status <> 'draft'
    AND EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.id = v.job_id AND j.user_id = v_admin_id
        AND EXISTS (
          SELECT 1 FROM clients c
          WHERE c.user_id = v_admin_id
            AND LOWER(TRIM(c.email)) = LOWER(TRIM(p_client_email))
            AND (
              LOWER(j.client) = LOWER(c.name)
              OR LOWER(j.client) = LOWER(
                   TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,''))
                 )
              OR (c.last_name IS NOT NULL AND c.last_name <> ''
                  AND LOWER(j.client) LIKE '%' || LOWER(c.last_name) || '%')
            )
        )
    );

  SELECT json_build_object(
    'name',    s.company_name, 'tagline', s.tagline,
    'email',   s.email,        'phone',   s.phone,
    'address', s.address,      'logo',    s.logo
  ) INTO v_settings FROM settings s WHERE s.user_id = v_admin_id;

  RETURN json_build_object(
    'client_name',     COALESCE(v_client_name,     p_client_email),
    'quotes',          COALESCE(v_quotes,          '[]'::json),
    'jobs',            COALESCE(v_jobs,            '[]'::json),
    'invoices',        COALESCE(v_invoices,        '[]'::json),
    'settings',        COALESCE(v_settings,        '{}'::json),
    'variations',      COALESCE(v_variations,      '[]'::json),
    'client_settings', COALESCE(v_client_settings, '{}'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_portal_preview_for_admin(TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 4. Re-run get_gantt_states_for_portal (no changes — keeps it
--    consistent after this migration is applied)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_gantt_states_for_portal()
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile  RECORD;
  v_admin_id UUID;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
  IF NOT FOUND OR v_profile.role <> 'customer' THEN RETURN '[]'::json; END IF;
  v_admin_id := v_profile.admin_user_id;
  IF v_admin_id IS NULL THEN RETURN '[]'::json; END IF;

  RETURN (
    SELECT COALESCE(
      json_agg(json_build_object('job_id', gs.job_id, 'state', gs.state)),
      '[]'::json
    )
    FROM gantt_states gs WHERE gs.user_id = v_admin_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_gantt_states_for_portal() TO authenticated;

-- ═══════════════════════════════ phase23.sql ═══════════════════════════════
-- Phase 23: Xero invoice sync toggle
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sync_to_xero   BOOLEAN DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS xero_invoice_id TEXT;

-- ═══════════════════════════════ phase24.sql ═══════════════════════════════
-- phase24: persist quote_source so Quick Quotes can be identified on reload
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quote_source TEXT;

-- ═══════════════════════════════ phase25.sql ═══════════════════════════════
-- Phase 25: inbox_documents — unallocated upload queue for the Document Inbox
-- Stores files uploaded to the Document Inbox before they are reviewed and
-- allocated to a job. Separate from job_documents (which is job-linked from the
-- start). The job-documents storage bucket from Phase 17 is reused.

CREATE TABLE IF NOT EXISTS public.inbox_documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users NOT NULL,
  file_name      TEXT NOT NULL DEFAULT '',
  storage_path   TEXT NOT NULL,
  mime_type      TEXT NOT NULL DEFAULT '',
  file_size      INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'unallocated',  -- unallocated | allocated
  raw_extraction JSONB,
  job_id         UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inbox_documents_user ON public.inbox_documents(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_documents_job  ON public.inbox_documents(job_id) WHERE job_id IS NOT NULL;

ALTER TABLE public.inbox_documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'inbox_documents' AND policyname = 'Own inbox_documents'
  ) THEN
    CREATE POLICY "Own inbox_documents" ON public.inbox_documents
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ═══════════════════════════════ phase26.sql ═══════════════════════════════
-- phase26.sql — Invoice default settings columns
-- Run in Supabase SQL Editor

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS invoice_vat_default      BOOLEAN       DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS invoice_payment_days     INTEGER       DEFAULT 30,
  ADD COLUMN IF NOT EXISTS invoice_payment_methods  TEXT[]        DEFAULT ARRAY['Bank Transfer'],
  ADD COLUMN IF NOT EXISTS invoice_bank_name        TEXT          DEFAULT '',
  ADD COLUMN IF NOT EXISTS invoice_account_name     TEXT          DEFAULT '',
  ADD COLUMN IF NOT EXISTS invoice_sort_code        TEXT          DEFAULT '',
  ADD COLUMN IF NOT EXISTS invoice_account_number   TEXT          DEFAULT '',
  ADD COLUMN IF NOT EXISTS invoice_default_notes    TEXT          DEFAULT '';

-- ═══════════════════════════════ phase27.sql ═══════════════════════════════
-- phase27.sql — Job attachments (client-visible files: plans, photos, documents)
-- Run in Supabase SQL Editor

-- ── 0. Expand job-documents bucket for attachment use ────────────────────────
-- Raises file size limit to 50 MB and allows more MIME types (Word, Excel, DWG)
UPDATE storage.buckets
SET
  file_size_limit    = 52428800,  -- 50 MB
  allowed_mime_types = ARRAY[
    'image/jpeg','image/jpg','image/png','image/webp','image/heic','image/tiff','image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream'   -- catches DWG / DXF / other CAD formats
  ]
WHERE id = 'job-documents';

-- ── 1. Table ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id        UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  file_name     TEXT NOT NULL DEFAULT '',
  storage_path  TEXT NOT NULL DEFAULT '',
  mime_type     TEXT NOT NULL DEFAULT '',
  file_size     BIGINT NOT NULL DEFAULT 0,
  category      TEXT NOT NULL DEFAULT 'document',  -- 'document' | 'plan' | 'photo'
  label         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE job_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own job_attachments" ON job_attachments;
CREATE POLICY "Own job_attachments" ON job_attachments
  FOR ALL USING (user_id = auth.uid());

-- ── 3. Index ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS job_attachments_job_id_idx ON job_attachments(job_id);

-- ── 4. Portal RPC — SECURITY DEFINER so customer can read their job's files ──
CREATE OR REPLACE FUNCTION get_job_attachments_for_portal(p_job_id UUID)
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
  -- Identify the portal customer
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN RETURN '[]'::JSON; END IF;

  -- Verify this customer has access to the job (same logic as get_portal_data)
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

  SELECT json_agg(
    json_build_object(
      'id',           a.id,
      'file_name',    a.file_name,
      'storage_path', a.storage_path,
      'mime_type',    a.mime_type,
      'file_size',    a.file_size,
      'category',     a.category,
      'label',        a.label,
      'created_at',   a.created_at
    )
    ORDER BY a.created_at ASC
  ) INTO v_result
  FROM job_attachments a
  WHERE a.job_id = p_job_id AND a.user_id = v_admin_id;

  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION get_job_attachments_for_portal(UUID) TO authenticated;

-- ═══════════════════════════════ phase28.sql ═══════════════════════════════
-- phase28.sql — Client self-serve AI quote requests
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS quote_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name      TEXT NOT NULL DEFAULT '',
  client_email     TEXT NOT NULL DEFAULT '',
  client_phone     TEXT NOT NULL DEFAULT '',
  project_type     TEXT NOT NULL DEFAULT '',
  project_address  TEXT NOT NULL DEFAULT '',
  scope_text       TEXT NOT NULL DEFAULT '',
  ai_phases        JSONB NOT NULL DEFAULT '[]',
  estimated_total  NUMERIC(12,2) NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'pending',  -- pending | reviewing | accepted | declined
  admin_notes      TEXT NOT NULL DEFAULT '',
  quote_id         UUID,  -- set when converted to a formal quote
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE quote_requests ENABLE ROW LEVEL SECURITY;

-- Public (unauthenticated) can insert — the client submission form
DROP POLICY IF EXISTS "Public insert quote_requests" ON quote_requests;
CREATE POLICY "Public insert quote_requests" ON quote_requests
  FOR INSERT WITH CHECK (true);

-- Any authenticated user (the builder / team) can read
DROP POLICY IF EXISTS "Auth select quote_requests" ON quote_requests;
CREATE POLICY "Auth select quote_requests" ON quote_requests
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Any authenticated user can update (change status, add notes)
DROP POLICY IF EXISTS "Auth update quote_requests" ON quote_requests;
CREATE POLICY "Auth update quote_requests" ON quote_requests
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Any authenticated user can delete
DROP POLICY IF EXISTS "Auth delete quote_requests" ON quote_requests;
CREATE POLICY "Auth delete quote_requests" ON quote_requests
  FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS quote_requests_status_idx ON quote_requests(status);
CREATE INDEX IF NOT EXISTS quote_requests_created_at_idx ON quote_requests(created_at DESC);

-- ═══════════════════════════════ phase29.sql ═══════════════════════════════
-- Migration: add client_files column to quote_requests
-- Run this in Supabase SQL Editor

ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS client_files JSONB DEFAULT '[]'::JSONB;

-- Storage bucket is created automatically by the upload API route the first time a file is uploaded.
-- If you want to create it manually, run this (or create it via Storage > New bucket in the dashboard):
--
-- INSERT INTO storage.buckets (id, name, public)
--   VALUES ('client-uploads', 'client-uploads', true)
--   ON CONFLICT (id) DO NOTHING;
--
-- Then add a public read policy so the builder can view images:
-- CREATE POLICY "Public read client uploads"
--   ON storage.objects FOR SELECT
--   USING (bucket_id = 'client-uploads');

-- ═══════════════════════════════ phase30.sql ═══════════════════════════════
-- Migration: Bill Payments with CIS deduction + job cost sync
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS bills (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ref            TEXT NOT NULL,
  supplier_id    UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name  TEXT NOT NULL DEFAULT '',
  job_id         UUID REFERENCES jobs(id) ON DELETE SET NULL,
  bill_date      TEXT NOT NULL DEFAULT '',
  due_date       TEXT NOT NULL DEFAULT '',
  description    TEXT NOT NULL DEFAULT '',
  line_items     JSONB NOT NULL DEFAULT '[]'::JSONB,
  labour_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  materials_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  plant_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal       NUMERIC(12,2) NOT NULL DEFAULT 0,
  cis_rate       NUMERIC(5,2)  NOT NULL DEFAULT 0,
  cis_deduction  NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_payable  NUMERIC(12,2) NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'draft',
  notes          TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own bills"
  ON bills FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Link job_costs rows back to the bill that created them.
-- ON DELETE CASCADE means deleting a bill auto-removes its cost lines.
ALTER TABLE job_costs
  ADD COLUMN IF NOT EXISTS bill_id UUID REFERENCES bills(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_job_costs_bill ON job_costs(bill_id);

-- ═══════════════════════════════ phase31.sql ═══════════════════════════════
-- Migration: Xero sync columns for bills
-- Run this in Supabase SQL Editor

ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS sync_to_xero BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS xero_bill_id  TEXT;

-- ═══════════════════════════════ phase32.sql ═══════════════════════════════
-- Migration: Xero chart-of-accounts mapping stored in settings
-- Run this in Supabase SQL Editor

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS xero_account_codes JSONB;

-- ═══════════════════════════════ phase33.sql ═══════════════════════════════
-- Migration: track Xero publish state on scanned/inbox documents
-- Run this in Supabase SQL Editor

ALTER TABLE job_documents
  ADD COLUMN IF NOT EXISTS xero_bill_id TEXT;

-- ═══════════════════════════════ phase34.sql ═══════════════════════════════
-- Migration: cash payment tracking per job (no Xero sync)
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS job_payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id       UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_date DATE NOT NULL,
  method       TEXT NOT NULL DEFAULT 'cash',  -- cash | cheque | bank_transfer | other
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE job_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own job payments"
  ON job_payments FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── Portal RPC: get payments for a job the calling portal user has access to ──
CREATE OR REPLACE FUNCTION get_job_payments_for_portal(p_job_id UUID)
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email    TEXT;
  v_admin_id UUID;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN RETURN '[]'::JSON; END IF;

  -- Verify the portal user has access to this job (same logic as get_job_attachments_for_portal)
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

  RETURN (
    SELECT COALESCE(json_agg(
      json_build_object(
        'id',           p.id,
        'amount',       p.amount,
        'payment_date', p.payment_date,
        'method',       p.method,
        'notes',        p.notes,
        'created_at',   p.created_at
      ) ORDER BY p.payment_date DESC
    ), '[]'::JSON)
    FROM job_payments p
    WHERE p.job_id = p_job_id
      AND p.user_id = v_admin_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_job_payments_for_portal(UUID) TO authenticated;

-- ═══════════════════════════════ phase35.sql ═══════════════════════════════
-- Migration: add charge_to_client flag to job_costs
-- Run this in Supabase SQL Editor

ALTER TABLE job_costs
  ADD COLUMN IF NOT EXISTS charge_to_client BOOLEAN NOT NULL DEFAULT FALSE;

-- ═══════════════════════════════ phase36.sql ═══════════════════════════════
-- Migration: email ingest metadata columns on job_documents
-- Run this in Supabase SQL Editor

ALTER TABLE job_documents
  ADD COLUMN IF NOT EXISTS source_email   TEXT,
  ADD COLUMN IF NOT EXISTS source_subject TEXT;

-- ═══════════════════════════════ phase38.sql ═══════════════════════════════
-- Migration: link bills to source documents
-- Run this in Supabase SQL Editor

ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES job_documents(id) ON DELETE SET NULL;

-- ═══════════════════════════════ phase39.sql ═══════════════════════════════
-- Migration: add payment_terms to clients
-- Run this in Supabase SQL Editor

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS payment_terms TEXT NOT NULL DEFAULT 'Payment on receipt';

-- ═══════════════════════════════ phase40.sql ═══════════════════════════════
-- Phase 40: Add client_type to distinguish clients from suppliers in the clients table
-- Run in Supabase → SQL Editor

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS client_type TEXT NOT NULL DEFAULT 'client'
    CHECK (client_type IN ('client', 'supplier'));

-- Index for filtering by type
CREATE INDEX IF NOT EXISTS idx_clients_client_type ON clients (user_id, client_type);

-- ═══════════════════════════════ phase41.sql ═══════════════════════════════
-- Phase 41: Add 'subcontractor' as a valid client_type value
-- Run in Supabase → SQL Editor

ALTER TABLE clients
  DROP CONSTRAINT IF EXISTS clients_client_type_check;

ALTER TABLE clients
  ADD CONSTRAINT clients_client_type_check
    CHECK (client_type IN ('client', 'supplier', 'subcontractor'));

-- ═══════════════════════════════ phase42.sql ═══════════════════════════════
-- Phase 42: Unify all contacts into the clients table
-- Run in Supabase → SQL Editor

-- 1. Add account_number to clients table (used by supplier/subcontractor records)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS account_number TEXT;

-- 2. Copy suppliers table records into clients where not already present
--    Matching is done by email (if set) or by name (case-insensitive)
INSERT INTO clients (
  user_id, name, first_name, last_name, email, phone, address, notes,
  client_type, account_number, xero_contact_id, xero_synced_at,
  added_from, updated_at
)
SELECT
  s.user_id,
  s.name,
  split_part(coalesce(s.contact_name, ''), ' ', 1)                                    AS first_name,
  CASE
    WHEN position(' ' IN coalesce(s.contact_name, '')) > 0
    THEN substring(s.contact_name FROM position(' ' IN s.contact_name) + 1)
    ELSE ''
  END                                                                                   AS last_name,
  coalesce(s.email, ''),
  coalesce(s.phone, ''),
  coalesce(s.address, ''),
  coalesce(s.notes, ''),
  'supplier'                                                                            AS client_type,
  coalesce(s.account_number, ''),
  s.xero_contact_id,
  s.xero_synced_at,
  coalesce(s.added_from, 'manual'),
  now()
FROM suppliers s
WHERE NOT EXISTS (
  SELECT 1 FROM clients c
  WHERE c.user_id = s.user_id
    AND (
      (s.email IS NOT NULL AND s.email <> '' AND lower(c.email) = lower(s.email))
      OR lower(trim(c.name)) = lower(trim(s.name))
    )
);

-- 3. Add contact_id to bills (FK to clients — used for new bills going forward)
--    Old bills keep supplier_id pointing to the suppliers table; new bills use contact_id.
ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES clients(id) ON DELETE SET NULL;

-- 4. Back-populate contact_id for existing bills by matching supplier name to clients
UPDATE bills b
SET contact_id = c.id
FROM clients c
WHERE b.contact_id IS NULL
  AND b.supplier_name IS NOT NULL AND b.supplier_name <> ''
  AND c.user_id = b.user_id
  AND lower(trim(c.name)) = lower(trim(b.supplier_name))
  AND c.client_type IN ('supplier', 'subcontractor');
