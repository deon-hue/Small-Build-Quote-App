-- A postcode box on Contacts (clients, suppliers and subcontractors), kept on its own from the address so it can be used later (the nearest supplier, and the like).
-- Safe to run more than once. Until it is run the box still shows on the form, but what is typed in it is not saved.

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS postcode TEXT NOT NULL DEFAULT '';
