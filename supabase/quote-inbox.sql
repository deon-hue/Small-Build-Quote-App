-- quote-inbox.sql — a supplier's own quote (a PDF or photo) emailed in, or dropped onto a price request, is read by the app and becomes their reply.
-- job_order_quotes gets: where the reply came from (form / email / upload), whether it still needs you to check what was read, and their original file.
-- incoming_quotes holds emailed quotes the app could not match to a request or a supplier with confidence, until you assign them by hand.
-- Needs supabase/job-orders.sql and supabase/job-orders-quotes.sql run first. Safe to run more than once. Staging first, then live.

ALTER TABLE public.job_order_quotes ADD COLUMN IF NOT EXISTS source      TEXT    NOT NULL DEFAULT 'form';
ALTER TABLE public.job_order_quotes ADD COLUMN IF NOT EXISTS needs_check BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.job_order_quotes ADD COLUMN IF NOT EXISTS file_path   TEXT    NOT NULL DEFAULT '';
ALTER TABLE public.job_order_quotes ADD COLUMN IF NOT EXISTS file_name   TEXT    NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS public.incoming_quotes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name     TEXT NOT NULL DEFAULT '',
  storage_path  TEXT NOT NULL DEFAULT '',
  mime_type     TEXT NOT NULL DEFAULT '',
  source_email  TEXT NOT NULL DEFAULT '',
  subject       TEXT NOT NULL DEFAULT '',
  extraction    JSONB,
  suggested_order_id UUID,
  reason        TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'unmatched' CHECK (status IN ('unmatched', 'assigned', 'dismissed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_incoming_quotes_user ON public.incoming_quotes (user_id, status);

ALTER TABLE public.incoming_quotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own incoming quotes" ON public.incoming_quotes;
CREATE POLICY "Own incoming quotes" ON public.incoming_quotes
  FOR ALL TO authenticated
  USING (user_id = get_effective_owner_id())
  WITH CHECK (user_id = get_effective_owner_id());

-- Each company gets its own short code, which goes into the shared quotes and documents addresses after a plus sign (quotes+ab12cd34@...), so emails from many builders can arrive at one
-- address and still be told apart. Existing companies are given one now.
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS mail_code TEXT NOT NULL DEFAULT substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_mail_code ON public.settings (mail_code);
