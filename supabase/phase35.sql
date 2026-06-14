-- Migration: add charge_to_client flag to job_costs
-- Run this in Supabase SQL Editor

ALTER TABLE job_costs
  ADD COLUMN IF NOT EXISTS charge_to_client BOOLEAN NOT NULL DEFAULT FALSE;
