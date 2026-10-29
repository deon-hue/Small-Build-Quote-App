-- leads.sql — turns the Quote Requests list into a Leads list: an enquiry that has not been quoted yet, wherever it came from.
--
-- The quote_requests table already holds every enquiry from the website quote form. This adds what a lead needs on top of it (no new table):
--   source           where it came from (Website form for every row already there; My contacts, Phone call, WhatsApp, Email, Facebook, Instagram, TikTok, Referral, Other for ones typed in)
--   chase_on         the day to get back to them (the dashboard shows the ones due)
--   last_contact_at  when you last spoke to them
--   lost_reason      why a lead that was lost was lost
-- The stages (New, Contacted, Site visit, Quoting, Won, Lost) are kept in the existing status column. 'pending' still means New, so the website form needs no change, and the old words
-- reviewing / accepted / declined are still read as Contacted / Won / Lost: no existing row is changed.
--
-- It also closes a hole: the table let ANYONE with the app's public key insert a row (policy "Public insert quote_requests", WITH CHECK (true)), which would have put junk in a builder's inbox and,
-- because user_id defaults to the first builder's account, in theirs. The website form does not use that policy (its route writes with the service role, which ignores row security), so it is replaced
-- by one that lets a signed-in builder add a lead only to their OWN account (the quick-add on the Leads page). Reading, changing and deleting were already limited to the owner (phase49).
--
-- Safe to run more than once. Staging first, then live. Run it BEFORE the code that uses it goes live (the new columns are added with defaults, so the old code carries on working).
-- Undo: supabase/leads-undo.sql.

ALTER TABLE public.quote_requests ADD COLUMN IF NOT EXISTS source          TEXT NOT NULL DEFAULT 'Website form';
ALTER TABLE public.quote_requests ADD COLUMN IF NOT EXISTS chase_on        DATE;
ALTER TABLE public.quote_requests ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMPTZ;
ALTER TABLE public.quote_requests ADD COLUMN IF NOT EXISTS lost_reason     TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS quote_requests_chase_idx ON public.quote_requests (user_id, chase_on) WHERE chase_on IS NOT NULL;

DROP POLICY IF EXISTS "Public insert quote_requests" ON public.quote_requests;
DROP POLICY IF EXISTS "Owner insert quote_requests"  ON public.quote_requests;
CREATE POLICY "Owner insert quote_requests" ON public.quote_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);
