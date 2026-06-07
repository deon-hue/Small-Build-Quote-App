-- Phase 23: Xero invoice sync toggle
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sync_to_xero   BOOLEAN DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS xero_invoice_id TEXT;
