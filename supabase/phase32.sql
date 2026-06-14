-- Migration: Xero chart-of-accounts mapping stored in settings
-- Run this in Supabase SQL Editor

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS xero_account_codes JSONB;
