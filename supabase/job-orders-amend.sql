-- job-orders-amend.sql — amended price requests, and the supplier's own quote reference.
-- job_orders.amended_at: when a price request that had already been sent was last changed, so suppliers can be told it is an amendment and a reply that came before it can be marked out of date.
-- job_order_quotes.supplier_ref: the supplier's own quote number (typed on their price page, or read from their emailed quote).
-- job_orders.supplier_ref: that number carried onto the order made when their price is approved, so it can be quoted back to them.
-- Needs supabase/job-orders.sql and supabase/job-orders-quotes.sql to have been run first. Safe to run more than once. Staging first, then live.
-- (Until this has been run, requests and orders carry on as before; the amended mark and the reference are simply not kept.)

ALTER TABLE public.job_orders       ADD COLUMN IF NOT EXISTS amended_at   TIMESTAMPTZ;
ALTER TABLE public.job_orders       ADD COLUMN IF NOT EXISTS supplier_ref TEXT NOT NULL DEFAULT '';
ALTER TABLE public.job_order_quotes ADD COLUMN IF NOT EXISTS supplier_ref TEXT NOT NULL DEFAULT '';
