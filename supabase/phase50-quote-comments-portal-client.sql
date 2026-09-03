-- phase50-quote-comments-portal-client.sql
-- Finishes the quote_comments feature so a portal client can actually post a
-- question, and fixes two silent gaps found while doing that:
--
-- 1. The existing "portal client can read comments" policy referenced the
--    quotes table directly in a subquery. quotes only has an owner-scoped
--    policy ("Own quotes": auth.uid() = user_id) — there is no policy letting
--    a portal client read quotes directly at all (the portal instead reads
--    everything through the SECURITY DEFINER get_portal_data() function,
--    which bypasses RLS internally). So that subquery has always evaluated
--    against zero visible rows for a portal client, meaning the "read your
--    own quote's comments" policy has likely never actually worked — it just
--    always looked like "no comments yet" instead of erroring.
-- 2. No DELETE policy existed at all, so the existing delete button in the
--    app silently did nothing (RLS defaults to deny when no policy matches),
--    even though the app-layer ownership check was correct.
--
-- Run this in the Supabase SQL Editor.

-- 1. Optional phase tag — which phase a message is about, stored as a plain
--    text label (not a foreign key) since phases live inside the quote's own
--    JSON data and don't have stable database-level IDs.
ALTER TABLE quote_comments ADD COLUMN IF NOT EXISTS phase_label TEXT;

-- 2. Security-definer helper — checks "does this quote belong to the
--    currently logged-in portal user's email" without needing the caller to
--    have direct SELECT rights on quotes. Same pattern already used by
--    get_portal_data() / get_invite_details() elsewhere in this schema.
--    Returns only a boolean — never exposes quote content.
CREATE OR REPLACE FUNCTION quote_belongs_to_portal_user(p_quote_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM quotes
    WHERE id = p_quote_id
      AND LOWER(customer ->> 'email') = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
  );
$$;

GRANT EXECUTE ON FUNCTION quote_belongs_to_portal_user(UUID) TO authenticated;

-- 3. Re-create the portal client SELECT policy using the helper (fixes the
--    always-empty read described above).
DROP POLICY IF EXISTS "Portal clients see non-internal comments" ON quote_comments;
CREATE POLICY "Portal clients see non-internal comments" ON quote_comments
  FOR SELECT USING (
    NOT is_internal AND quote_belongs_to_portal_user(quote_id)
  );

-- 4. Portal clients can create non-internal comments on their own quote.
DROP POLICY IF EXISTS "Portal clients can create comments" ON quote_comments;
CREATE POLICY "Portal clients can create comments" ON quote_comments
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    NOT is_internal AND
    quote_belongs_to_portal_user(quote_id)
  );

-- 5. Contractor can delete their own comments — was missing entirely.
DROP POLICY IF EXISTS "Contractor can delete own comments" ON quote_comments;
CREATE POLICY "Contractor can delete own comments" ON quote_comments
  FOR DELETE USING (user_id = auth.uid());
