-- Add week_start column to group daily entries by pay week
ALTER TABLE sub_admin_time_logs ADD COLUMN IF NOT EXISTS week_start DATE;

-- Backfill existing entries (set week_start to Monday of their entry_date)
UPDATE sub_admin_time_logs
SET week_start = date_trunc('week', entry_date::date)::date
WHERE week_start IS NULL AND entry_date IS NOT NULL;
