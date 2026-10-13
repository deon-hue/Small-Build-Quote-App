-- job-orders-lines.sql — a supplier prices each item of a materials list one by one (a unit price per item, or "cannot supply", plus a delivery charge), instead of one price for everything.
-- items: the things a request asks to be priced (name, quantity, unit; never our own prices).  lines: a supplier's price for each of them.  delivery_charge: added on top.
-- Needs supabase/job-orders.sql and supabase/job-orders-quotes.sql to have been run first. Safe to run more than once. Staging first, then live.
-- (Until this has been run, a request made from a calculator's materials list says so; ordinary requests carry on as before.)

ALTER TABLE public.job_orders       ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.job_order_quotes ADD COLUMN IF NOT EXISTS lines JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.job_order_quotes ADD COLUMN IF NOT EXISTS delivery_charge NUMERIC(12,2) NOT NULL DEFAULT 0;
