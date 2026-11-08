-- sent-items.sql — "Sent to them": a record of what the company has sent a lead or a contact (design ideas, photographs, AI drawings, a scope of works, a brief), by email or WhatsApp, kept in the app.
--
--   sent_items   one row per message sent (or logged after the fact). user_id is the company owner. It belongs to a lead (lead_id), a contact (client_id), or both, and keeps the address it
--                went to (to_email / to_phone) so the history still finds the person when a lead later becomes a client. `files` is a list of {name, path, isImage, size} whose files are in the
--                private job-documents bucket under <user>/sent/<item>/… (no storage setup: that bucket's policy already allows your own folder).
--
-- The company (and its team) reads and changes these directly, protected by row security like everything else of theirs. A CLIENT has no direct access: the client portal's "Sent to you" tab is read by the
-- app's server (app/api/portal/sent-items), which only returns rows marked show_in_portal that belong to the signed-in client.
--
-- Needs the quote_requests (leads) and clients tables and get_effective_owner_id() (already there). Safe to run more than once. Staging first, then live.
-- (Until this has been run, the "Sent to them" box says so and nothing else in the app changes.)

CREATE TABLE IF NOT EXISTS public.sent_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id         UUID REFERENCES public.quote_requests(id) ON DELETE SET NULL,
  client_id       UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  channel         TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'whatsapp', 'other')),
  kind            TEXT NOT NULL DEFAULT 'sent'  CHECK (kind IN ('sent', 'logged')),
  subject         TEXT NOT NULL DEFAULT '',
  body            TEXT NOT NULL DEFAULT '',
  files           JSONB NOT NULL DEFAULT '[]'::jsonb,
  to_name         TEXT NOT NULL DEFAULT '',
  to_email        TEXT NOT NULL DEFAULT '',
  to_phone        TEXT NOT NULL DEFAULT '',
  show_in_portal  BOOLEAN NOT NULL DEFAULT true,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sent_items_has_owner CHECK (lead_id IS NOT NULL OR client_id IS NOT NULL OR to_email <> '' OR to_phone <> '')
);
CREATE INDEX IF NOT EXISTS idx_sent_items_user   ON public.sent_items (user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_sent_items_lead   ON public.sent_items (lead_id);
CREATE INDEX IF NOT EXISTS idx_sent_items_client ON public.sent_items (client_id);
CREATE INDEX IF NOT EXISTS idx_sent_items_email  ON public.sent_items (lower(to_email));

ALTER TABLE public.sent_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own sent items" ON public.sent_items;
-- (A row can only be written against a lead or a contact that belongs to the same company: nobody can attach rows to someone else's.)
CREATE POLICY "Own sent items" ON public.sent_items
  FOR ALL TO authenticated
  USING (user_id = get_effective_owner_id())
  WITH CHECK (
    user_id = get_effective_owner_id()
    AND (lead_id   IS NULL OR EXISTS (SELECT 1 FROM public.quote_requests q WHERE q.id = lead_id   AND q.user_id = sent_items.user_id))
    AND (client_id IS NULL OR EXISTS (SELECT 1 FROM public.clients        c WHERE c.id = client_id AND c.user_id = sent_items.user_id))
  );

-- New tables need explicit grants (Supabase stopped granting API access automatically from 30 Oct 2026). Nothing for anon: a signed-out visitor never reads these.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sent_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sent_items TO service_role;
