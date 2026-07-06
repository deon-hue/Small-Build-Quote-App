-- Phase 3: add tracking columns to sub_admin_time_logs
-- Run this in Supabase SQL editor

ALTER TABLE sub_admin_time_logs ADD COLUMN IF NOT EXISTS xero_bill_id TEXT;
ALTER TABLE sub_admin_time_logs ADD COLUMN IF NOT EXISTS job_cost_id  UUID;
