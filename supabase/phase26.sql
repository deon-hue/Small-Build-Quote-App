-- phase26.sql — Invoice default settings columns
-- Run in Supabase SQL Editor

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS invoice_vat_default      BOOLEAN       DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS invoice_payment_days     INTEGER       DEFAULT 30,
  ADD COLUMN IF NOT EXISTS invoice_payment_methods  TEXT[]        DEFAULT ARRAY['Bank Transfer'],
  ADD COLUMN IF NOT EXISTS invoice_bank_name        TEXT          DEFAULT '',
  ADD COLUMN IF NOT EXISTS invoice_account_name     TEXT          DEFAULT '',
  ADD COLUMN IF NOT EXISTS invoice_sort_code        TEXT          DEFAULT '',
  ADD COLUMN IF NOT EXISTS invoice_account_number   TEXT          DEFAULT '',
  ADD COLUMN IF NOT EXISTS invoice_default_notes    TEXT          DEFAULT '';
