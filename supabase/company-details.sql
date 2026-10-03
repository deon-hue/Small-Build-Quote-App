-- Company registration details printed on quotes and invoices (Company Details on the Settings page).
-- vat_number and company_number were also in phase11.sql; IF NOT EXISTS makes this safe to run either way.
-- Run in the Supabase SQL editor. Until it is run, these three fields simply don't save (everything else does).

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS vat_number     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS company_number TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS website        TEXT NOT NULL DEFAULT '';
