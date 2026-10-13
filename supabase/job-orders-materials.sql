-- job-orders-materials.sql — ask suppliers for prices on a calculator's materials list, before there is a job.
-- A request for a price can now exist without a job (job_id may be empty) while you are still pricing a quote: it is kept on its own list and you attach it to a job when the job is won.
-- source_label remembers where it came from (the calculator and quote it was made from).
-- Needs supabase/job-orders.sql and supabase/job-orders-quotes.sql to have been run first. Safe to run more than once. Staging first, then live.

ALTER TABLE public.job_orders ALTER COLUMN job_id DROP NOT NULL;
ALTER TABLE public.job_orders ADD COLUMN IF NOT EXISTS source_label TEXT NOT NULL DEFAULT '';
