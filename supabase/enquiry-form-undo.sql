-- enquiry-form-undo.sql — removes what enquiry-form.sql added. Enquiries already received stay in the Leads list; the links stop working.

DROP TABLE IF EXISTS public.enquiry_slugs;
ALTER TABLE public.settings DROP COLUMN IF EXISTS enquiry_slug;
ALTER TABLE public.settings DROP COLUMN IF EXISTS enquiry_enabled;
ALTER TABLE public.settings DROP COLUMN IF EXISTS enquiry_intro;
ALTER TABLE public.settings DROP COLUMN IF EXISTS enquiry_notify;
