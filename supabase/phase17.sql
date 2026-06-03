-- Phase 17: Document capture + job-cost ledger (Phase 1 of the doc-scan feature)
-- Scan/upload supplier docs (invoices, receipts, delivery notes), extract their
-- details, review, and save as actual costs against a job.
--
-- App is the system of record for job costing. The xero_* columns on job_costs
-- are reserved for the later Xero accounting push (no feature built on them yet).

-- ── Storage bucket for job documents ──────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'job-documents', 'job-documents', false, 15728640,  -- 15 MB
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/heic','image/tiff','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS — owner-only, keyed to the first path segment ({user_id}/...)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Job docs: users upload own') THEN
    CREATE POLICY "Job docs: users upload own" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'job-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Job docs: users read own') THEN
    CREATE POLICY "Job docs: users read own" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'job-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Job docs: users delete own') THEN
    CREATE POLICY "Job docs: users delete own" ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'job-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;

-- ── job_documents: uploaded file + raw extraction snapshot ────────────────────
CREATE TABLE IF NOT EXISTS public.job_documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users NOT NULL,
  job_id         UUID REFERENCES public.jobs(id)   ON DELETE CASCADE,
  quote_id       UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  file_name      TEXT NOT NULL DEFAULT '',
  storage_path   TEXT NOT NULL,
  mime_type      TEXT NOT NULL DEFAULT '',
  file_size      INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'uploaded',  -- uploaded | extracted | reviewed | error
  raw_extraction JSONB,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── job_costs: the actuals ledger (one row per cost line) ─────────────────────
CREATE TABLE IF NOT EXISTS public.job_costs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users NOT NULL,
  job_id         UUID REFERENCES public.jobs(id)   ON DELETE CASCADE,
  quote_id       UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  document_id    UUID REFERENCES public.job_documents(id) ON DELETE SET NULL,
  supplier       TEXT NOT NULL DEFAULT '',
  doc_date       DATE,
  doc_number     TEXT NOT NULL DEFAULT '',
  description    TEXT NOT NULL DEFAULT '',
  cost_category  TEXT NOT NULL DEFAULT 'materials',  -- labour | materials | plant | subcontractors | other
  net_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
  vat_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
  gross_amount   NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unknown',    -- unknown | unpaid | partial | paid
  source         TEXT NOT NULL DEFAULT 'document',   -- document | manual
  -- Reserved for Phase 4 Xero push (no UI yet):
  xero_invoice_id TEXT,
  xero_status     TEXT,
  synced_at       TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_documents_job  ON public.job_documents(user_id, job_id);
CREATE INDEX IF NOT EXISTS idx_job_costs_job      ON public.job_costs(user_id, job_id);
CREATE INDEX IF NOT EXISTS idx_job_costs_document ON public.job_costs(document_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.job_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_costs     ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_documents') THEN
    CREATE POLICY "Own job_documents" ON public.job_documents
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_costs') THEN
    CREATE POLICY "Own job_costs" ON public.job_costs
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
