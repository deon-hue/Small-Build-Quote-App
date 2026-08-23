-- ============================================================
-- Phase 46: Show admin-logged time in sub-portal
-- The sub-portal was only reading sub_time_entries (sub-submitted).
-- Admin weekly timesheets write to sub_admin_time_logs — this
-- update unions both tables so subs see all their recorded time.
-- Run in Supabase SQL Editor.
-- ============================================================

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
  IF NOT FOUND                         THEN RETURN json_build_object('error', 'no_profile');        END IF;
  IF v_profile.role = 'admin'          THEN RETURN json_build_object('error', 'is_admin');          END IF;
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

  -- Time entries: sub-submitted (sub_time_entries) UNION admin-logged (sub_admin_time_logs)
  SELECT json_agg(row_to_json(te)) INTO v_time_entries
  FROM (
    -- Sub-submitted entries
    SELECT
      te.id,
      te.sub_contract_id,
      te.entry_date,
      te.units,
      te.notes,
      te.status,
      te.submitted_by,
      te.admin_notes,
      te.start_time,
      te.finish_time,
      te.break_mins,
      te.created_at,
      te.job_id,
      te.rate_type,
      te.rate_amount,
      NULL::numeric AS amount,
      'portal'::text AS source
    FROM sub_time_entries te
    WHERE te.user_id = v_admin_id
      AND (
        (te.sub_contract_id IS NOT NULL AND te.sub_contract_id IN (
          SELECT id FROM sub_contracts
          WHERE contact_id = v_contact_id AND user_id = v_admin_id
        ))
        OR
        (te.sub_contract_id IS NULL AND te.contact_id = v_contact_id)
      )

    UNION ALL

    -- Admin-logged weekly timesheet entries
    SELECT
      atl.id,
      NULL::uuid                 AS sub_contract_id,
      atl.entry_date,
      COALESCE(
        atl.total_hours,
        CASE atl.rate_type
          WHEN 'day'      THEN 1.0
          WHEN 'half_day' THEN 0.5
          ELSE                 0.0
        END
      )                          AS units,
      atl.notes,
      atl.status,
      'admin'::text              AS submitted_by,
      NULL::text                 AS admin_notes,
      atl.start_time,
      atl.finish_time,
      0                          AS break_mins,
      atl.created_at,
      atl.job_id,
      atl.rate_type::text        AS rate_type,
      atl.rate_amount,
      atl.amount,
      'admin'::text              AS source
    FROM sub_admin_time_logs atl
    WHERE atl.user_id    = v_admin_id
      AND atl.contact_id = v_contact_id
      AND atl.entry_type = 'payable'

    ORDER BY entry_date DESC
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
