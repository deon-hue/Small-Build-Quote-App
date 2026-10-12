-- job-orders.sql — purchase orders for a job (a skip, a portaloo, plant hire, a materials delivery) and the "expected costs" they create.
-- An order has a PO number that stays with it from the request to the supplier's invoice, so the invoice can be matched back to it.
--   * on account (skips, hire, merchants you have an account with): the order counts as an EXPECTED cost on the job until its invoice is matched;
--   * paid when ordered (materials you pay for at once): a real, paid cost is put on the job when the order is placed.
-- Also adds po_ref to job_costs, so a cost knows which order it came from. Safe to run more than once. Staging first, then live.
-- (Until this has been run, the Orders window says so and nothing else in the app changes.)

CREATE TABLE IF NOT EXISTS public.job_orders (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id             UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  po_number          INTEGER NOT NULL,
  kind               TEXT NOT NULL DEFAULT 'order' CHECK (kind IN ('order', 'quote_request')),
  order_type         TEXT NOT NULL DEFAULT 'other',
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ordered', 'confirmed', 'delivered', 'collected', 'invoiced', 'cancelled')),
  supplier_id        TEXT,
  supplier_name      TEXT NOT NULL DEFAULT '',
  supplier_contact   TEXT NOT NULL DEFAULT '',
  supplier_email     TEXT NOT NULL DEFAULT '',
  supplier_phone     TEXT NOT NULL DEFAULT '',
  title              TEXT NOT NULL DEFAULT '',
  details            TEXT NOT NULL DEFAULT '',
  cost_category      TEXT NOT NULL DEFAULT 'other',
  pay_terms          TEXT NOT NULL DEFAULT 'account' CHECK (pay_terms IN ('account', 'on_order')),
  rate_basis         TEXT NOT NULL DEFAULT 'fixed' CHECK (rate_basis IN ('fixed', 'day', 'week')),
  rate               NUMERIC(12,2) NOT NULL DEFAULT 0,
  planned_units      NUMERIC(8,2) NOT NULL DEFAULT 1,
  delivery_date      DATE,
  delivery_slot      TEXT NOT NULL DEFAULT '',
  off_hire_date      DATE,
  expected_invoice   DATE,
  site_address       TEXT NOT NULL DEFAULT '',
  site_contact       TEXT NOT NULL DEFAULT '',
  site_phone         TEXT NOT NULL DEFAULT '',
  access_notes       TEXT NOT NULL DEFAULT '',
  sent_at            TIMESTAMPTZ,
  sent_via           TEXT NOT NULL DEFAULT '',
  paid_cost_id       UUID,
  invoiced_cost_id   UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, po_number)
);

CREATE INDEX IF NOT EXISTS idx_job_orders_job  ON public.job_orders (job_id);
CREATE INDEX IF NOT EXISTS idx_job_orders_user ON public.job_orders (user_id);

ALTER TABLE public.job_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own job orders" ON public.job_orders;
CREATE POLICY "Own job orders" ON public.job_orders
  FOR ALL TO authenticated
  USING (user_id = get_effective_owner_id())
  WITH CHECK (user_id = get_effective_owner_id());

-- A cost that came from an order carries its PO reference ("PO-0142")
ALTER TABLE public.job_costs ADD COLUMN IF NOT EXISTS po_ref TEXT NOT NULL DEFAULT '';
