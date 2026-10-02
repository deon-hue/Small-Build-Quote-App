-- How a PAYE worker's day was paid: 'cash' or 'paye' (through payroll). NULL means it was paid
-- before this was recorded, and shows as just "Paid". Run in the Supabase SQL Editor.
ALTER TABLE sub_admin_time_logs ADD COLUMN IF NOT EXISTS paid_method TEXT;
