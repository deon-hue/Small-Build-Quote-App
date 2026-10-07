-- ============================================================
-- Subcontractor portal: the COMPANY CALENDAR.
--
-- Shows a subcontractor where the company's work is happening: each active job's phases (name and dates) plus the job's name and address.
-- Deliberately NOT included: the client's name, prices or values, notes, who is booked on what, or any individual tasks.
-- A builder can switch it off per subcontractor (Contacts → edit the subcontractor → "Can see the company calendar"); that tick is stored in the
-- contact's portal_settings as showCompanyCalendar, and counts as ON unless it is explicitly false.
--
--   get_company_calendar_for_sub()              the signed-in subcontractor's view  ({rows} or {error:'disabled'} …)
--   get_company_calendar_for_admin(contact)     the builder's preview of what that subcontractor sees
-- Safe to run more than once. Staging first, then live.
-- ============================================================

CREATE OR REPLACE FUNCTION _company_calendar_rows(p_admin UUID)
RETURNS JSON LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(json_agg(r ORDER BY r.job_start, r.job_title), '[]'::json)
  FROM (
    SELECT
      j.id                                              AS job_id,
      COALESCE(NULLIF(btrim(j.title), ''), j.type)      AS job_title,
      split_part(COALESCE(j.address, ''), E'\n', 1)     AS job_address,
      j.start_date                                      AS job_start,
      j.weeks                                           AS weeks,
      j.stage                                           AS stage,
      -- only the phases (level 1): name, start and length. Not the tasks, not who does them.
      COALESCE((
        SELECT json_agg(json_build_object(
                 'label',          p ->> 'label',
                 'start_day',      COALESCE((p ->> 'startDay')::int, 0),
                 'dur_days',       GREATEST(COALESCE((p ->> 'durDays')::int, 1), 1),
                 'allow_saturday', COALESCE((p ->> 'allowSaturday')::boolean, false))
               ORDER BY COALESCE((p ->> 'startDay')::int, 0))
        FROM gantt_states gs, jsonb_array_elements(gs.state -> 'phases') p
        WHERE gs.job_id = j.id AND gs.user_id = p_admin AND COALESCE((p ->> 'level')::int, 1) = 1
      ), '[]'::json)                                    AS phases
    FROM jobs j
    WHERE j.user_id = p_admin
      AND j.stage <> 'complete'
      AND NOT COALESCE(j.archived, false)
      AND j.start_date IS NOT NULL
  ) r;
$$;

CREATE OR REPLACE FUNCTION get_company_calendar_for_sub()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE
  v_email   TEXT;
  v_profile RECORD;
  v_contact RECORD;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
  IF NOT FOUND OR v_profile.role <> 'subcontractor' OR v_profile.admin_user_id IS NULL THEN
    RETURN json_build_object('error', 'not_subcontractor');
  END IF;
  SELECT c.id, c.portal_settings INTO v_contact FROM clients c
   WHERE c.user_id = v_profile.admin_user_id AND LOWER(c.email) = LOWER(v_email) AND c.client_type = 'subcontractor'
   LIMIT 1;
  IF NOT FOUND THEN RETURN json_build_object('error', 'no_sub_linked'); END IF;
  -- the builder can switch it off for this subcontractor
  IF COALESCE(v_contact.portal_settings ->> 'showCompanyCalendar', 'true') = 'false' THEN
    RETURN json_build_object('error', 'disabled');
  END IF;
  RETURN json_build_object('rows', _company_calendar_rows(v_profile.admin_user_id));
END;
$$;

CREATE OR REPLACE FUNCTION get_company_calendar_for_admin(p_contact_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE
  v_admin   UUID;
  v_contact RECORD;
BEGIN
  SELECT id INTO v_admin FROM profiles WHERE id = auth.uid() AND role = 'admin';
  IF NOT FOUND THEN RETURN json_build_object('error', 'not_admin'); END IF;
  SELECT c.id, c.portal_settings INTO v_contact FROM clients c
   WHERE c.id = p_contact_id AND c.user_id = v_admin AND c.client_type = 'subcontractor';
  IF NOT FOUND THEN RETURN json_build_object('error', 'contact_not_found'); END IF;
  IF COALESCE(v_contact.portal_settings ->> 'showCompanyCalendar', 'true') = 'false' THEN
    RETURN json_build_object('error', 'disabled');
  END IF;
  RETURN json_build_object('rows', _company_calendar_rows(v_admin));
END;
$$;

REVOKE EXECUTE ON FUNCTION _company_calendar_rows(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_company_calendar_for_sub() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_company_calendar_for_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_company_calendar_for_sub() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_company_calendar_for_admin(UUID) TO authenticated, service_role;
