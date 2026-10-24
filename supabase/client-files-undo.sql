-- Undo for client-files.sql: removes the client_files table (the Files section on the contact card then says the customer's own files are not set up).
-- The files themselves stay in the job-documents storage bucket under <user>/clients/… : delete them in Supabase Storage if you want the space back.
DROP TABLE IF EXISTS public.client_files;
