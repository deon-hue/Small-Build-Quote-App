-- ============================================================
-- Quotes: a PAYMENT PLAN (when each part of the price falls due), shown to the customer in the quote and in their portal.
--
-- One new column on quotes, `payment_plan` (JSON): the deposit, the stages (at the end of each phase, or weekly for the work done), the retention and the
-- start date they were worked out from. NULL = no plan. No new table, so no new grants are needed; the existing row security on quotes covers it.
-- The customer portal function get_portal_data() returns the whole quote row, so the plan reaches the portal with no change to it.
-- Until this is run the quote screen says so and the Payment plan button is hidden; nothing else changes.
-- Safe to run more than once. Staging first, then live. Undo: ALTER TABLE quotes DROP COLUMN payment_plan;  (this deletes any plans made)
-- ============================================================

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_plan JSONB;
