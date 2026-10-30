-- lead-visits.sql — booking a site visit with a lead: when it is, how long, a note for the customer, and whether it is booked or cancelled.
-- Run supabase/leads.sql FIRST. Safe to run twice. These are plain columns on the lead (quote_requests), so the existing row security (each company sees only its own leads) covers them.
--   visit_at       the moment the visit starts (stored in UTC; the app shows it in UK time)
--   visit_minutes  how long it is expected to take
--   visit_note     what the customer is told about the visit ("please have your drawings ready")
--   visit_address  where to go, if it is not the lead's own address (it usually is)
--   visit_status   '' (none), 'booked' or 'cancelled'
--   visit_emailed_at  when the customer was last emailed about the visit
--   visit_seq      how many times the visit has been changed (the calendar file uses it, so a customer's calendar updates instead of doubling up)

ALTER TABLE public.quote_requests ADD COLUMN IF NOT EXISTS visit_at         TIMESTAMPTZ;
ALTER TABLE public.quote_requests ADD COLUMN IF NOT EXISTS visit_minutes    INTEGER NOT NULL DEFAULT 60;
ALTER TABLE public.quote_requests ADD COLUMN IF NOT EXISTS visit_note       TEXT    NOT NULL DEFAULT '';
ALTER TABLE public.quote_requests ADD COLUMN IF NOT EXISTS visit_address    TEXT    NOT NULL DEFAULT '';
ALTER TABLE public.quote_requests ADD COLUMN IF NOT EXISTS visit_status     TEXT    NOT NULL DEFAULT '';
ALTER TABLE public.quote_requests ADD COLUMN IF NOT EXISTS visit_emailed_at TIMESTAMPTZ;
ALTER TABLE public.quote_requests ADD COLUMN IF NOT EXISTS visit_seq        INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS quote_requests_visit_idx ON public.quote_requests (user_id, visit_at) WHERE visit_status = 'booked';
