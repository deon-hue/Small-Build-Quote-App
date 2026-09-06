-- phase51-sub-payment-stage-method.sql
-- Adds a payment method to subcontractor Fixed Quote payment stages, so a
-- stage paid in cash can be recorded as such (rather than just a paid date
-- with no record of how it was actually paid).
--
-- Run this in the Supabase SQL Editor.

ALTER TABLE sub_payment_stages ADD COLUMN IF NOT EXISTS payment_method TEXT;
