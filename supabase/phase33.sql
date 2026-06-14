-- Migration: track Xero publish state on scanned/inbox documents
-- Run this in Supabase SQL Editor

ALTER TABLE job_documents
  ADD COLUMN IF NOT EXISTS xero_bill_id TEXT;
