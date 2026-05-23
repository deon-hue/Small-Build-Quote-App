-- ============================================================
-- Phase 4: Quote Approval by Client
-- Run this in Supabase SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Add approval columns to quotes table
-- ────────────────────────────────────────────────────────────
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS client_approved_at  TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS client_approved_by  TEXT        DEFAULT NULL;

-- ────────────────────────────────────────────────────────────
-- 2. RPC: approve_quote
--    Called by the client to accept their quote.
--    Verifies ownership before updating.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION approve_quote(p_quote_id UUID, p_signature TEXT)
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email   TEXT;
  v_profile RECORD;
  v_quote   RECORD;
BEGIN
  -- Get logged-in user's email
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  -- Verify this is a customer account
  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
  IF NOT FOUND OR v_profile.role <> 'customer' THEN
    RETURN json_build_object('error', 'not_authorized');
  END IF;

  -- Verify the quote belongs to this customer
  SELECT * INTO v_quote
  FROM quotes
  WHERE id = p_quote_id
    AND user_id = v_profile.admin_user_id
    AND LOWER((customer->>'email')::TEXT) = LOWER(v_email);

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'quote_not_found');
  END IF;

  -- Can only approve quotes that are pending or sent
  IF v_quote.status NOT IN ('pending', 'sent') THEN
    RETURN json_build_object('error', 'already_actioned', 'status', v_quote.status);
  END IF;

  -- Approve
  UPDATE quotes
  SET
    status              = 'accepted',
    client_approved_at  = NOW(),
    client_approved_by  = p_signature
  WHERE id = p_quote_id;

  RETURN json_build_object(
    'success',     true,
    'approved_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION approve_quote(UUID, TEXT) TO authenticated;
