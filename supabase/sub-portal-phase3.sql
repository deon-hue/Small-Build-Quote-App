-- ============================================================
-- Sub Portal Phase 3: Direct job time entries (no contract required)
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Make sub_contract_id optional and add direct-job columns
ALTER TABLE public.sub_time_entries
  ALTER COLUMN sub_contract_id DROP NOT NULL;

ALTER TABLE public.sub_time_entries
  ADD COLUMN IF NOT EXISTS job_id      UUID REFERENCES public.jobs(id),
  ADD COLUMN IF NOT EXISTS contact_id  UUID REFERENCES public.clients(id),
  ADD COLUMN IF NOT EXISTS rate_type   TEXT CHECK (rate_type IN ('hourly', 'daily', 'half_day')),
  ADD COLUMN IF NOT EXISTS rate_amount NUMERIC(10,2);

-- 2. Update get_sub_portal_data to return direct entries + active jobs + sub rates
CREATE OR REPLACE FUNCTION get_sub_portal_data()
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email          TEXT;
  v_admin_id       UUID;
  v_contact_id     UUID;
  v_profile        RECORD;
  v_contact        RECORD;
  v_settings       RECORD;
  v_contracts      JSON;
  v_time_entries   JSON;
  v_payment_stages JSON;
  v_sub_name       TEXT;
  v_jobs           JSON;
  v_sub_rates      JSON;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
  IF NOT FOUND                        THEN RETURN json_build_object('error', 'no_profile');       END IF;
  IF v_profile.role = 'admin'         THEN RETURN json_build_object('error', 'is_admin');         END IF;
  IF v_profile.role <> 'subcontractor' THEN RETURN json_build_object('error', 'not_subcontractor'); END IF;

  v_admin_id := v_profile.admin_user_id;
  IF v_admin_id IS NULL THEN RETURN json_build_object('error', 'no_admin_linked'); END IF;

  -- Resolve contact + rates
  SELECT
    c.id,
    COALESCE(NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')), ''), c.name),
    c.sub_hourly_rate,
    c.sub_day_rate,
    c.sub_half_day_rate,
    c.sub_payment_type
  INTO v_contact_id, v_sub_name,
       v_contact.sub_hourly_rate, v_contact.sub_day_rate,
       v_contact.sub_half_day_rate, v_contact.sub_payment_type
  FROM clients c
  WHERE c.user_id      = v_admin_id
    AND LOWER(c.email) = LOWER(v_email)
    AND c.client_type  = 'subcontractor'
  LIMIT 1;

  IF v_contact_id IS NULL THEN RETURN json_build_object('error', 'no_sub_linked'); END IF;

  -- Re-fetch contact row cleanly for rate fields
  SELECT * INTO v_contact FROM clients WHERE id = v_contact_id;

  -- Company settings
  SELECT * INTO v_settings FROM settings WHERE user_id = v_admin_id LIMIT 1;

  -- Contracts (active only)
  SELECT json_agg(row_to_json(sc)) INTO v_contracts
  FROM (
    SELECT
      sc.id, sc.job_id, sc.type, sc.description,
      sc.rate_type, sc.rate_amount, sc.quoted_amount, sc.status, sc.notes,
      sc.created_at,
      j.type        AS job_type,
      j.client      AS job_client,
      j.address     AS job_address,
      j.status      AS job_status,
      j.start_date,
      j.end_date
    FROM sub_contracts sc
    LEFT JOIN jobs j ON j.id = sc.job_id AND j.user_id = v_admin_id
    WHERE sc.user_id    = v_admin_id
      AND sc.contact_id = v_contact_id
      AND sc.status     = 'active'
    ORDER BY sc.created_at DESC
  ) sc;

  -- Time entries: both contract-based and direct-job entries
  SELECT json_agg(row_to_json(te)) INTO v_time_entries
  FROM (
    SELECT
      te.id, te.sub_contract_id, te.entry_date, te.units, te.notes,
      te.status, te.submitted_by, te.admin_notes,
      te.start_time, te.finish_time, te.break_mins,
      te.created_at, te.job_id, te.rate_type, te.rate_amount
    FROM sub_time_entries te
    WHERE te.user_id = v_admin_id
      AND (
        -- Contract-based entries belonging to this sub
        (te.sub_contract_id IS NOT NULL AND te.sub_contract_id IN (
          SELECT id FROM sub_contracts
          WHERE contact_id = v_contact_id AND user_id = v_admin_id
        ))
        OR
        -- Direct job entries submitted by this sub
        (te.sub_contract_id IS NULL AND te.contact_id = v_contact_id)
      )
    ORDER BY te.entry_date DESC
    LIMIT 200
  ) te;

  -- Payment stages
  SELECT json_agg(row_to_json(ps)) INTO v_payment_stages
  FROM (
    SELECT
      ps.id, ps.sub_contract_id, ps.description, ps.amount,
      ps.due_date, ps.paid_date, ps.xero_bill_id, ps.created_at
    FROM sub_payment_stages ps
    JOIN sub_contracts sc ON sc.id = ps.sub_contract_id
    WHERE sc.user_id    = v_admin_id
      AND sc.contact_id = v_contact_id
    ORDER BY ps.created_at DESC
  ) ps;

  -- Active jobs (for the job picker in the portal)
  SELECT json_agg(row_to_json(j)) INTO v_jobs
  FROM (
    SELECT id, client, type, address, stage
    FROM jobs
    WHERE user_id = v_admin_id AND (done = false OR done IS NULL)
    ORDER BY client
  ) j;

  -- Sub's rate profile
  v_sub_rates := json_build_object(
    'hourlyRate',   v_contact.sub_hourly_rate,
    'dayRate',      v_contact.sub_day_rate,
    'halfDayRate',  v_contact.sub_half_day_rate,
    'paymentType',  v_contact.sub_payment_type
  );

  RETURN json_build_object(
    'contracts',     COALESCE(v_contracts,      '[]'::json),
    'timeEntries',   COALESCE(v_time_entries,   '[]'::json),
    'paymentStages', COALESCE(v_payment_stages, '[]'::json),
    'subName',       COALESCE(v_sub_name, v_email),
    'jobs',          COALESCE(v_jobs, '[]'::json),
    'subRates',      v_sub_rates,
    'settings', json_build_object(
      'name',    COALESCE(v_settings.company_name, 'The Small Build Company'),
      'tagline', COALESCE(v_settings.tagline, ''),
      'email',   COALESCE(v_settings.email,   ''),
      'phone',   COALESCE(v_settings.phone,   ''),
      'logo',    COALESCE(v_settings.logo,    '')
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_sub_portal_data() TO authenticated;

-- 3. New function: submit timesheet directly against a job (no contract needed)
CREATE OR REPLACE FUNCTION submit_sub_timesheet_direct(
  p_job_id      UUID,
  p_entry_date  DATE,
  p_units       NUMERIC,
  p_notes       TEXT    DEFAULT '',
  p_start_time  TIME    DEFAULT NULL,
  p_finish_time TIME    DEFAULT NULL,
  p_break_mins  INT     DEFAULT 0,
  p_rate_type   TEXT    DEFAULT 'daily',
  p_rate_amount NUMERIC DEFAULT 0
)
RETURNS UUID
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile    RECORD;
  v_admin_id   UUID;
  v_contact_id UUID;
  v_entry_id   UUID;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid() AND role = 'subcontractor';
  IF NOT FOUND THEN RAISE EXCEPTION 'Not a subcontractor'; END IF;

  v_admin_id := v_profile.admin_user_id;

  -- Resolve contact
  SELECT id INTO v_contact_id
  FROM clients
  WHERE user_id     = v_admin_id
    AND LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))
    AND client_type  = 'subcontractor'
  LIMIT 1;

  IF v_contact_id IS NULL THEN RAISE EXCEPTION 'Contact not found'; END IF;

  -- Verify job belongs to this admin
  IF NOT EXISTS (SELECT 1 FROM jobs WHERE id = p_job_id AND user_id = v_admin_id) THEN
    RAISE EXCEPTION 'Job not found';
  END IF;

  INSERT INTO sub_time_entries (
    sub_contract_id, contact_id, job_id, user_id,
    entry_date, units, notes, status, submitted_by,
    start_time, finish_time, break_mins,
    rate_type, rate_amount
  ) VALUES (
    NULL, v_contact_id, p_job_id, v_admin_id,
    p_entry_date, p_units, p_notes, 'submitted', 'subcontractor',
    p_start_time, p_finish_time, p_break_mins,
    p_rate_type, p_rate_amount
  )
  RETURNING id INTO v_entry_id;

  RETURN v_entry_id;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_sub_timesheet_direct(UUID, DATE, NUMERIC, TEXT, TIME, TIME, INT, TEXT, NUMERIC) TO authenticated;
