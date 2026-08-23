-- ============================================================
-- Phase 48: Add paid_date to sub_admin_time_logs
-- Run in Supabase SQL Editor.
-- ============================================================

ALTER TABLE sub_admin_time_logs
  ADD COLUMN IF NOT EXISTS paid_date DATE;
