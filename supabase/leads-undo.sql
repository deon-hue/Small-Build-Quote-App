-- leads-undo.sql — puts the quote_requests table back as it was before leads.sql.
-- This DELETES the source, chase date, last-contact date and lost-reason of every lead (the leads themselves stay), and lets anyone insert into the table again (the old policy).

DROP POLICY IF EXISTS "Owner insert quote_requests" ON public.quote_requests;
DROP POLICY IF EXISTS "Public insert quote_requests" ON public.quote_requests;
CREATE POLICY "Public insert quote_requests" ON public.quote_requests FOR INSERT WITH CHECK (true);

DROP INDEX IF EXISTS public.quote_requests_chase_idx;
ALTER TABLE public.quote_requests DROP COLUMN IF EXISTS source;
ALTER TABLE public.quote_requests DROP COLUMN IF EXISTS chase_on;
ALTER TABLE public.quote_requests DROP COLUMN IF EXISTS last_contact_at;
ALTER TABLE public.quote_requests DROP COLUMN IF EXISTS lost_reason;
