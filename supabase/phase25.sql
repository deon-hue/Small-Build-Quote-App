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
