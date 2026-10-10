-- ============================================================
-- Deleted contacts that must stay deleted.
-- When a contact is deleted in the app, a small record of it (name, email, Xero ID) is kept here, and the Xero contact sync checks this list before it
-- creates any contact, so a contact you deleted is not brought back from Xero. A contact added by hand again later clears its record. Records can be
-- restored from "Tidy up contacts". Only the company's own login(s) can see or change them. Safe to run more than once. Staging first, then live.
-- (Without this table the app still works, but deleted contacts can come back from Xero.)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.deleted_contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT,
  email           TEXT,
  client_type     TEXT,
  xero_contact_id TEXT,
  deleted_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deleted_contacts_user ON public.deleted_contacts (user_id);

ALTER TABLE public.deleted_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own deleted contacts" ON public.deleted_contacts;
CREATE POLICY "Own deleted contacts" ON public.deleted_contacts
  FOR ALL TO authenticated
  USING (user_id = get_effective_owner_id())
  WITH CHECK (user_id = get_effective_owner_id());
