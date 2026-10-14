-- job-orders-deleted.sql — deleting a price request or an order no longer destroys it: it goes to "Recently deleted", with its suppliers and their replies, and can be restored.
-- deleted_at: when it was deleted (empty = not deleted). Restoring clears it; "Delete forever" in Recently deleted is the only thing that removes the row (and, with it, its suppliers' replies).
-- Needs supabase/job-orders.sql to have been run first. Safe to run more than once. Staging first, then live.
-- (Until this has been run, Delete refuses and says so, rather than deleting something that cannot be brought back.)

ALTER TABLE public.job_orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
