-- sub-payroll.sql — a subcontractor who is Direct Labour (costs go in the Labour category) can now still be billed and sent to Xero.
-- Until now the one "Direct Labour" switch also meant "paid through PAYE payroll" (no bill, never sent to Xero). This adds the second, separate setting.
-- clients.paid_via_payroll: TRUE = paid through payroll; FALSE = invoices / is paid by bill (so their week can be sent "→ Bills" and on to Xero, with the CIS deduction);
--   empty (NULL) = never set: a Direct Labour worker is treated as on payroll, exactly as before, so nothing changes for anyone until you change it in Contacts.
-- Safe to run more than once. Staging first, then live. (Until it has been run, the setting cannot be saved and everything behaves as before.)

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS paid_via_payroll BOOLEAN;
