-- ============================================================
-- Phase 47: Admin preview of the sub-portal for any subcontractor
-- Mirrors get_sub_portal_data but takes a contact_id instead of
-- using auth.uid() — so the admin can view what a sub sees.
-- Run in Supabase SQL Editor.
-- ============================================================

CREATE OR REPLACE FUNCTION get_sub_portal_preview_for_admin(p_contact_id UUID)
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id       UUID;
  v_contact        RECORD;
  v_settings       RECORD;
  v_contracts      JSON;
  v_time_entries   JSON;
  v_payment_stages JSON;
  v_sub_name       TEXT;
  v_jobs           JSON;
  v_sub_rates      JSON;
BEGIN
  -- Caller must be an admin
  SELECT id INTO v_admin_id FROM profiles WHERE id = auth.uid() AND role = 'admin';
  IF NOT FOUND THEN RETURN json_build_object('error', 'not_admin'); END IF;

  -- Load the contact and verify it belongs to this admin
  SELECT * INTO v_contact FROM clients
  WHERE id = p_contact_id AND user_id = v_admin_id AND client_type = 'subcontractor';
  IF NOT FOUND THEN RETURN json_build_object('error', 'contact_not_found'); END IF;

  v_sub_name := COALESCE(
    NULLIF(TRIM(COALESCE(v_contact.first_name,'') || ' ' || COALESCE(v_contact.last_name,'')), ''),
    v_contact.name
  );

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
      j.stage       AS job_status,
      j.start_date,
      NULL::date AS end_date
    FROM sub_contracts sc
    LEFT JOIN jobs j ON j.id::text = sc.job_id AND j.user_id = v_admin_id
    WHERE sc.user_id    = v_admin_id
      AND sc.contact_id = p_contact_id
      AND sc.status     = 'active'
    ORDER BY sc.created_at DESC
  ) sc;

  -- Time entries: sub-submitted UNION admin-logged
  -- Explicit casts on all columns to prevent UNION type-mismatch errors
  SELECT json_agg(row_to_json(te)) INTO v_time_entries
  FROM (
    SELECT
      te.id::text,
      te.sub_contract_id::text,
      te.entry_date::text,
      te.units::numeric,
      COALESCE(te.notes, '')::text        AS notes,
      te.status::text,
      COALESCE(te.submitted_by, '')::text AS submitted_by,
      te.admin_notes::text,
      te.start_time::text,
      te.finish_time::text,
      COALESCE(te.break_mins, 0)::int     AS break_mins,
      te.created_at::text,
      te.job_id::text,
      te.rate_type::text,
      te.rate_amount::numeric,
      NULL::numeric                        AS amount,
      'portal'::text                       AS source,
      NULL::date                           AS paid_date
    FROM sub_time_entries te
    WHERE te.user_id = v_admin_id
      AND (
        (te.sub_contract_id IS NOT NULL AND te.sub_contract_id IN (
          SELECT id FROM sub_contracts WHERE contact_id = p_contact_id AND user_id = v_admin_id
        ))
        OR
        (te.sub_contract_id IS NULL AND te.contact_id = p_contact_id)
      )

    UNION ALL

    SELECT
      atl.id::text,
      NULL::text                           AS sub_contract_id,
      atl.entry_date::text,
      COALESCE(
        atl.total_hours,
        CASE atl.rate_type WHEN 'day' THEN 1.0 WHEN 'half_day' THEN 0.5 ELSE 0.0 END
      )::numeric                           AS units,
      COALESCE(atl.notes, '')::text        AS notes,
      atl.status::text,
      'admin'::text                        AS submitted_by,
      NULL::text                           AS admin_notes,
      atl.start_time::text,
      atl.finish_time::text,
      0::int                               AS break_mins,
      atl.created_at::text,
      atl.job_id::text,
      atl.rate_type::text,
      atl.rate_amount::numeric,
      atl.amount::numeric,
      'admin'::text                        AS source,
      atl.paid_date::date                  AS paid_date
    FROM sub_admin_time_logs atl
    WHERE atl.user_id    = v_admin_id
      AND atl.contact_id = p_contact_id
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
      AND sc.contact_id = p_contact_id
    ORDER BY ps.created_at DESC
  ) ps;

  -- Active jobs
  SELECT json_agg(row_to_json(j)) INTO v_jobs
  FROM (
    SELECT id, client, type, address, stage
    FROM jobs
    WHERE user_id = v_admin_id AND (done = 0 OR done IS NULL)
    ORDER BY client
  ) j;

  v_sub_rates := json_build_object(
    'hourlyRate',  v_contact.sub_hourly_rate,
    'dayRate',     v_contact.sub_day_rate,
    'halfDayRate', v_contact.sub_half_day_rate,
    'paymentType', v_contact.sub_payment_type
  );

  RETURN json_build_object(
    'subName',       COALESCE(v_sub_name, ''),
    'contracts',     COALESCE(v_contracts,      '[]'::json),
    'timeEntries',   COALESCE(v_time_entries,   '[]'::json),
    'paymentStages', COALESCE(v_payment_stages, '[]'::json),
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

GRANT EXECUTE ON FUNCTION get_sub_portal_preview_for_admin(UUID) TO authenticated;
