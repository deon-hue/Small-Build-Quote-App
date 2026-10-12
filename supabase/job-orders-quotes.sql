-- job-orders-quotes.sql — quote requests to suppliers, with a price form the supplier fills in from a link (no login).
-- A quote request is a row in job_orders with kind = 'quote_request' (it already has a PO number). Each supplier it is sent to is one row here, with its own secret link.
-- When you approve a reply, the request becomes a normal order (same PO number) and the supplier's price, date and details go onto it.
-- Needs supabase/job-orders.sql to have been run first. Safe to run more than once. Staging first, then live.
-- The supplier's page and replies go through the app's server (it looks the link up itself), so there is no public access to this table.

CREATE TABLE IF NOT EXISTS public.job_order_quotes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id          UUID NOT NULL REFERENCES public.job_orders(id) ON DELETE CASCADE,
  token             TEXT NOT NULL UNIQUE DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  supplier_id       TEXT,
  supplier_name     TEXT NOT NULL DEFAULT '',
  supplier_contact  TEXT NOT NULL DEFAULT '',
  supplier_email    TEXT NOT NULL DEFAULT '',
  supplier_phone    TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'replied', 'declined', 'chosen', 'not_chosen')),
  sent_at           TIMESTAMPTZ,
  sent_via          TEXT NOT NULL DEFAULT '',
  viewed_at         TIMESTAMPTZ,
  price             NUMERIC(12,2),
  rate_basis        TEXT NOT NULL DEFAULT 'fixed' CHECK (rate_basis IN ('fixed', 'day', 'week')),
  delivery_date     DATE,
  valid_until       DATE,
  notes             TEXT NOT NULL DEFAULT '',
  replied_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_order_quotes_order ON public.job_order_quotes (order_id);
CREATE INDEX IF NOT EXISTS idx_job_order_quotes_user  ON public.job_order_quotes (user_id);

ALTER TABLE public.job_order_quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own job order quotes" ON public.job_order_quotes;
CREATE POLICY "Own job order quotes" ON public.job_order_quotes
  FOR ALL TO authenticated
  USING (user_id = get_effective_owner_id())
  WITH CHECK (user_id = get_effective_owner_id());
