-- Undo supabase/sub-invoices.sql (removes the saved invoice details and every invoice record; the logo files in storage are not touched)
DROP TABLE IF EXISTS public.sub_invoices;
DROP TABLE IF EXISTS public.sub_invoice_details;
