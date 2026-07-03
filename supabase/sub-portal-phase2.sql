-- ============================================================
-- Sub Portal — Phase 2: Timesheet Submission & Approval
-- Run AFTER sub-portal.sql
-- ============================================================

-- ── 1. Add updated_at to sub_time_entries ─────────────────────────────────────
ALTER TABLE sub_time_entries
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- ── 2. submit_sub_timesheet() — called from subcontractor portal ──────────────
CREATE OR REPLACE FUNCTION submit_sub_timesheet(
  p_sub_contract_id UUID,
  p_entry_date      DATE,
  p_units           NUMERIC,
  p_notes           TEXT    DEFAULT '',
  p_start_time      TIME    DEFAULT NULL,
  p_finish_time     TIME    DEFAULT NULL,
  p_break_mins      INT     DEFAULT 0
)
RETURNS UUID
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile    RECORD;
  v_email      TEXT;
  v_contact_id UUID;
  v_admin_id   UUID;
  v_entry_id   UUID;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
  IF NOT FOUND OR v_profile.role <> 'subcontractor' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_admin_id := v_profile.admin_user_id;
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  SELECT id INTO v_contact_id
  FROM clients
  WHERE user_id    = v_admin_id
    AND LOWER(email) = LOWER(v_email)
    AND client_type  = 'subcontractor'
  LIMIT 1;

  IF v_contact_id IS NULL THEN RAISE EXCEPTION 'Subcontractor record not found'; END IF;

  -- Verify the contract belongs to this subcontractor
  PERFORM 1 FROM sub_contracts
  WHERE id = p_sub_contract_id AND user_id = v_admin_id AND contact_id = v_contact_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Contract not found or access denied'; END IF;

  INSERT INTO sub_time_entries (
    sub_contract_id, user_id,
    entry_date, units, notes,
    status, submitted_by,
    start_time, finish_time, break_mins
  ) VALUES (
    p_sub_contract_id, v_admin_id,
    p_entry_date, p_units, COALESCE(p_notes, ''),
    'submitted', 'subcontractor',
    p_start_time, p_finish_time, p_break_mins
  )
  RETURNING id INTO v_entry_id;

  RETURN v_entry_id;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_sub_timesheet(UUID, DATE, NUMERIC, TEXT, TIME, TIME, INT) TO authenticated;
