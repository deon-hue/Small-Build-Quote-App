-- ============================================================
-- Task assignments: WHICH DAYS each person works on a task, and a schedule for the subcontractor portal.
--
-- • task_assignments.day_offsets  the days a person is on site, as calendar-day offsets from the task's first day
--                                 (0 = first day, 2 = third day…). NULL means every working day of the task. Offsets, not dates, so the
--                                 days move with the task when it is dragged on the Calendar or Gantt chart.
-- • get_my_task_schedule()        what the signed-in subcontractor is booked on: job, address, task name, task dates and their own days.
--                                 Nothing else: not other people, other tasks, the client's name or any prices.
-- • get_sub_task_schedule_for_admin(contact)   the same thing for the builder's "preview what the subcontractor sees".
-- Needs task-assignments.sql (and task-assignments-multi.sql on older databases) first. Safe to run more than once. Staging first, then live.
-- ============================================================

ALTER TABLE task_assignments ADD COLUMN IF NOT EXISTS day_offsets INTEGER[];

ALTER TABLE task_assignments DROP CONSTRAINT IF EXISTS task_assignments_day_offsets_ok;
ALTER TABLE task_assignments ADD CONSTRAINT task_assignments_day_offsets_ok
  CHECK (day_offsets IS NULL OR (cardinality(day_offsets) BETWEEN 1 AND 400 AND 0 <= ALL (day_offsets) AND 400 >= ALL (day_offsets)));

-- ── Shared query: every task a contact is booked on, with just the task's own schedule details ──────────────
CREATE OR REPLACE FUNCTION _sub_task_schedule(p_admin UUID, p_contact UUID)
RETURNS JSON LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(json_agg(r ORDER BY r.job_start, r.start_day), '[]'::json)
  FROM (
    SELECT
      ta.id                                              AS assignment_id,
      ta.job_id,
      ta.phase_id,
      ta.day_offsets,
      COALESCE(NULLIF(btrim(j.title), ''), j.type)       AS job_title,
      j.address                                          AS job_address,
      j.start_date                                       AS job_start,
      (ph.p ->> 'label')                                 AS task_label,
      COALESCE((ph.p ->> 'startDay')::int, 0)            AS start_day,
      GREATEST(COALESCE((ph.p ->> 'durDays')::int, 1), 1) AS dur_days,
      COALESCE((ph.p ->> 'allowSaturday')::boolean, false) AS allow_saturday,
      (SELECT pp ->> 'label' FROM jsonb_array_elements(gs.state -> 'phases') pp
        WHERE pp ->> 'id' = (ph.p ->> 'parentId') LIMIT 1) AS parent_label
    FROM task_assignments ta
    JOIN jobs j          ON j.id = ta.job_id AND j.user_id = p_admin
    JOIN gantt_states gs ON gs.job_id = ta.job_id AND gs.user_id = p_admin
    CROSS JOIN LATERAL (
      SELECT p FROM jsonb_array_elements(gs.state -> 'phases') p WHERE p ->> 'id' = ta.phase_id LIMIT 1
    ) ph
    WHERE ta.user_id = p_admin
      AND ta.assignee_id = p_contact
      AND j.stage <> 'complete'
      AND NOT COALESCE(j.archived, false)
      AND j.start_date IS NOT NULL
  ) r;
$$;

-- ── The signed-in subcontractor's own schedule ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_my_task_schedule()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE
  v_email   TEXT;
  v_profile RECORD;
  v_contact UUID;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
  IF NOT FOUND OR v_profile.role <> 'subcontractor' OR v_profile.admin_user_id IS NULL THEN
    RETURN json_build_object('error', 'not_subcontractor');
  END IF;
  SELECT c.id INTO v_contact FROM clients c
   WHERE c.user_id = v_profile.admin_user_id AND LOWER(c.email) = LOWER(v_email) AND c.client_type = 'subcontractor'
   LIMIT 1;
  IF v_contact IS NULL THEN RETURN json_build_object('error', 'no_sub_linked'); END IF;
  RETURN json_build_object('rows', _sub_task_schedule(v_profile.admin_user_id, v_contact));
END;
$$;

-- ── The builder's preview of a subcontractor's schedule ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_sub_task_schedule_for_admin(p_contact_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE v_admin UUID;
BEGIN
  SELECT id INTO v_admin FROM profiles WHERE id = auth.uid() AND role = 'admin';
  IF NOT FOUND THEN RETURN json_build_object('error', 'not_admin'); END IF;
  PERFORM 1 FROM clients WHERE id = p_contact_id AND user_id = v_admin AND client_type = 'subcontractor';
  IF NOT FOUND THEN RETURN json_build_object('error', 'contact_not_found'); END IF;
  RETURN json_build_object('rows', _sub_task_schedule(v_admin, p_contact_id));
END;
$$;

REVOKE EXECUTE ON FUNCTION _sub_task_schedule(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_my_task_schedule() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_sub_task_schedule_for_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_my_task_schedule() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_sub_task_schedule_for_admin(UUID) TO authenticated, service_role;
