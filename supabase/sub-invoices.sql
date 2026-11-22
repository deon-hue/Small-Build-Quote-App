-- A subcontractor's own invoice, made from their approved times (Deon, 2026-11-22).
--   sub_invoice_details : what a subcontractor types in their portal to put on their invoices (trading name, UTR, VAT, bank details, terms, logo path), one row per subcontractor contact
--   sub_invoices        : an invoice that has been made, with its number, for time that went on a BILL (never for time paid in cash)
-- Both tables are read and written ONLY by the server (the service role), after it has checked who is signed in: there are no policies, so a signed-in browser cannot reach them directly.
-- Run on STAGING first, then live, BEFORE the code goes live. Safe to run again. Undo: sub-invoices-undo.sql

CREATE TABLE IF NOT EXISTS public.sub_invoice_details (
  owner_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id        UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  trading_name      TEXT NOT NULL DEFAULT '',
  address           TEXT NOT NULL DEFAULT '',
  email             TEXT NOT NULL DEFAULT '',
  phone             TEXT NOT NULL DEFAULT '',
  utr               TEXT NOT NULL DEFAULT '',
  vat_registered    BOOLEAN NOT NULL DEFAULT false,
  vat_number        TEXT NOT NULL DEFAULT '',
  bank_account_name TEXT NOT NULL DEFAULT '',
  sort_code         TEXT NOT NULL DEFAULT '',
  account_number    TEXT NOT NULL DEFAULT '',
  payment_terms     TEXT NOT NULL DEFAULT '',
  invoice_prefix    TEXT NOT NULL DEFAULT '',
  logo_path         TEXT NOT NULL DEFAULT '',
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, contact_id)
);

CREATE TABLE IF NOT EXISTS public.sub_invoices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id     UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  number         INTEGER NOT NULL,
  invoice_number TEXT NOT NULL,
  period_start   DATE,
  period_end     DATE,
  log_ids        TEXT[] NOT NULL DEFAULT '{}',
  set_key        TEXT NOT NULL,
  total          NUMERIC(10,2) NOT NULL DEFAULT 0,
  bill_id        TEXT,
  xero_bill_id   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, contact_id, number),
  UNIQUE (owner_id, contact_id, set_key)
);
CREATE INDEX IF NOT EXISTS sub_invoices_contact_idx ON public.sub_invoices (owner_id, contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sub_invoices_bill_idx ON public.sub_invoices (owner_id, bill_id) WHERE bill_id IS NOT NULL;

ALTER TABLE public.sub_invoice_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_invoices        ENABLE ROW LEVEL SECURITY;

-- server only: nothing for anon or authenticated, full access for the service role
REVOKE ALL ON public.sub_invoice_details FROM anon, authenticated;
REVOKE ALL ON public.sub_invoices        FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sub_invoice_details TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sub_invoices        TO service_role;
