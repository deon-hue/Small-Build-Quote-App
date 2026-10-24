-- client-files.sql — files kept on a customer's contact card itself (a first set of plans, ID, photos, anything that does not belong to one quote or job yet).
--
--   client_files   one row per file, for one contact. user_id is the builder (the company owner), client_id the contact.
--                  The files themselves are in the existing private job-documents storage bucket, under <user>/clients/<contact>/…  (its policy already allows your own folder, so no storage setup is needed).
--
-- The Files section on the contact card ALSO lists the files already attached to that customer's quotes and jobs (read from quote_documents and job_attachments: no copy, no extra space), and can download everything as one zip.
-- A client (portal customer) has no access to this table: it is the builder's own filing.
--
-- Needs the clients table and get_effective_owner_id() (already there). Safe to run more than once. Staging first, then live.
-- (Until this has been run the Files section says so for the customer's own files and everything else in the app is unchanged.)
-- Undo: supabase/client-files-undo.sql.

CREATE TABLE IF NOT EXISTS public.client_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id     UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  file_name     TEXT NOT NULL DEFAULT '',
  storage_path  TEXT NOT NULL,
  mime_type     TEXT NOT NULL DEFAULT '',
  file_size     BIGINT NOT NULL DEFAULT 0,
  category      TEXT NOT NULL DEFAULT 'document' CHECK (category IN ('document', 'plan', 'photo')),
  label         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_files_client ON public.client_files (client_id);
CREATE INDEX IF NOT EXISTS idx_client_files_user   ON public.client_files (user_id);

ALTER TABLE public.client_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own client files" ON public.client_files;
-- (A file can only be filed against a contact that belongs to the same builder.)
CREATE POLICY "Own client files" ON public.client_files
  FOR ALL TO authenticated
  USING (user_id = get_effective_owner_id())
  WITH CHECK (user_id = get_effective_owner_id() AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = client_files.user_id));

-- Explicit grants (Supabase no longer grants new tables to the API automatically). Nothing for anon: nobody signed out can read these.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_files TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_files TO service_role;
