-- Add quote document link to sub contracts
ALTER TABLE public.sub_contracts
  ADD COLUMN IF NOT EXISTS quote_document_id UUID REFERENCES public.job_documents(id) ON DELETE SET NULL;
