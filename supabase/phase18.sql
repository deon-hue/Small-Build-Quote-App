-- Phase 18: Suppliers master list (alongside Clients)
-- App-side now; the xero_* columns are reserved for the later two-way
-- Xero Contacts sync (no sync built yet).

CREATE TABLE IF NOT EXISTS public.suppliers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users NOT NULL,
  name            TEXT NOT NULL DEFAULT '',   -- company / supplier name
  contact_name    TEXT NOT NULL DEFAULT '',   -- person to contact
  phone           TEXT NOT NULL DEFAULT '',
  email           TEXT NOT NULL DEFAULT '',
  address         TEXT NOT NULL DEFAULT '',
  notes           TEXT NOT NULL DEFAULT '',
  account_number  TEXT NOT NULL DEFAULT '',   -- our trade account ref with them
  added_from      TEXT NOT NULL DEFAULT 'manual',
  -- reserved for Phase 4 Xero contact sync:
  xero_contact_id TEXT,
  xero_synced_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'suppliers') THEN
    CREATE POLICY "Own suppliers" ON public.suppliers
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_suppliers_user ON public.suppliers(user_id);
