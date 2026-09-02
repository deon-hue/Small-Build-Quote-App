-- phase49-fix-quote-requests-rls.sql
-- Fixes Supabase Security Advisor warning "sensitive_columns_exposed" on quote_requests.
--
-- Problem: quote_requests had no owner column, and its SELECT/UPDATE/DELETE policies
-- only checked "is the caller logged in" (auth.uid() IS NOT NULL) rather than
-- "does the caller own this data". Any authenticated user — including client-portal
-- and subcontractor-portal accounts, which are real auth.users rows — could read,
-- edit, or delete every prospect's name/email/phone/address in this table.
--
-- Fix: add a user_id column, backfill existing rows to the app owner's account,
-- and scope SELECT/UPDATE/DELETE to auth.uid() = user_id. The public submission
-- form is unaffected — it inserts via the service-role key in
-- app/api/public/submit-quote-request/route.ts, which bypasses RLS entirely.
--
-- Run this in the Supabase SQL Editor.

-- 1. Add the owner column (nullable for now, so the backfill can run)
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 2. Backfill every existing row to the app owner's account
--    (single-tenant today — replace the UUID below if you ever add more owner accounts)
UPDATE quote_requests
SET user_id = 'c1d9fdaf-5f12-4b1d-b6f5-6318be733d71'
WHERE user_id IS NULL;

-- 3. Lock the column going forward
ALTER TABLE quote_requests ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE quote_requests ALTER COLUMN user_id SET DEFAULT 'c1d9fdaf-5f12-4b1d-b6f5-6318be733d71';

CREATE INDEX IF NOT EXISTS quote_requests_user_id_idx ON quote_requests(user_id);

-- 4. Replace the overly-broad policies with owner-scoped ones.
--    INSERT stays public (WITH CHECK true) — that's the intentional client-facing
--    submission path — but the server route now sets user_id explicitly on insert.

DROP POLICY IF EXISTS "Auth select quote_requests" ON quote_requests;
CREATE POLICY "Owner select quote_requests" ON quote_requests
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Auth update quote_requests" ON quote_requests;
CREATE POLICY "Owner update quote_requests" ON quote_requests
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Auth delete quote_requests" ON quote_requests;
CREATE POLICY "Owner delete quote_requests" ON quote_requests
  FOR DELETE USING (auth.uid() = user_id);

-- "Public insert quote_requests" (FOR INSERT WITH CHECK (true)) is left as-is.
