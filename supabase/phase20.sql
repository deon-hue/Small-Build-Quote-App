-- Phase 20: Xero contact-sync link columns on clients
-- (suppliers already has xero_contact_id / xero_synced_at / updated_at from phase18)

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS xero_contact_id TEXT,
  ADD COLUMN IF NOT EXISTS xero_synced_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT NOW();
