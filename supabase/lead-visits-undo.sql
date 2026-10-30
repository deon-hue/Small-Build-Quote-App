-- lead-visits-undo.sql — removes what lead-visits.sql added. Any visits already booked are forgotten (the leads stay).

DROP INDEX IF EXISTS public.quote_requests_visit_idx;
ALTER TABLE public.quote_requests DROP COLUMN IF EXISTS visit_at;
ALTER TABLE public.quote_requests DROP COLUMN IF EXISTS visit_minutes;
ALTER TABLE public.quote_requests DROP COLUMN IF EXISTS visit_note;
ALTER TABLE public.quote_requests DROP COLUMN IF EXISTS visit_address;
ALTER TABLE public.quote_requests DROP COLUMN IF EXISTS visit_status;
ALTER TABLE public.quote_requests DROP COLUMN IF EXISTS visit_emailed_at;
ALTER TABLE public.quote_requests DROP COLUMN IF EXISTS visit_seq;
