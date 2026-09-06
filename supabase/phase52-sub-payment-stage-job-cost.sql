-- phase52-sub-payment-stage-job-cost.sql
-- Links a Fixed Quote payment stage to a job_costs row once it's marked
-- paid, so it actually counts toward that job's Actual Cost / margin on
-- the Dashboard — previously stage payments never touched job_costs at
-- all (unlike the day-rate/timesheet subcontractor flow, which already
-- does this via sub_admin_time_logs.job_cost_id).
--
-- Run this in the Supabase SQL Editor.

ALTER TABLE sub_payment_stages ADD COLUMN IF NOT EXISTS job_cost_id UUID;
