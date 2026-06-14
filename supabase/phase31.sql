-- Migration: Xero sync columns for bills
-- Run this in Supabase SQL Editor

ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS sync_to_xero BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS xero_bill_id  TEXT;
