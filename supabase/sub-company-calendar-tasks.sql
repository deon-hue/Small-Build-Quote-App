-- ============================================================
-- Subcontractor portal COMPANY CALENDAR: send each job's TASKS (name, phase it is under, start day and number of days).
--
-- The calendar now shows, under each day, every job going on and each task with its days ('Skim ceilings, Day 2 of 3'): a task of several days is on each of
-- its days. This ADDS one field (tasks) to what _company_calendar_rows already returns; phases, address, title, colour and the rest are unchanged.
-- A task is sent with its name, the phase it sits under, its start day, its length and whether Saturday is worked. NEVER who does it, prices or notes.
-- Until it is run the calendar still works: it shows the phases (with their days) instead of the tasks.
-- Run supabase/sub-company-calendar-colour.sql first (this file re-creates the same function with `tasks` added). Safe to run more than once. Staging first, then live.
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
      j.color                                           AS job_color,
      -- the phases (level 1): name, start and length
      COALESCE((
        SELECT json_agg(json_build_object(
                 'label',          p ->> 'label',
                 'start_day',      COALESCE((p ->> 'startDay')::int, 0),
                 'dur_days',       GREATEST(COALESCE((p ->> 'durDays')::int, 1), 1),
                 'allow_saturday', COALESCE((p ->> 'allowSaturday')::boolean, false))
               ORDER BY COALESCE((p ->> 'startDay')::int, 0))
        FROM gantt_states gs, jsonb_array_elements(gs.state -> 'phases') p
        WHERE gs.job_id = j.id AND gs.user_id = p_admin AND COALESCE((p ->> 'level')::int, 1) = 1
      ), '[]'::json)                                    AS phases,
      -- the tasks (level 2): name, the phase they are under, start and length. Not who does them.
      COALESCE((
        SELECT json_agg(json_build_object(
                 'label',          t ->> 'label',
                 'parent_label',   (SELECT pp ->> 'label' FROM jsonb_array_elements(gs.state -> 'phases') pp
                                     WHERE pp ->> 'id' = (t ->> 'parentId') LIMIT 1),
                 'start_day',      COALESCE((t ->> 'startDay')::int, 0),
                 'dur_days',       GREATEST(COALESCE((t ->> 'durDays')::int, 1), 1),
                 'allow_saturday', COALESCE((t ->> 'allowSaturday')::boolean, false))
               ORDER BY COALESCE((t ->> 'startDay')::int, 0))
        FROM gantt_states gs, jsonb_array_elements(gs.state -> 'phases') t
        WHERE gs.job_id = j.id AND gs.user_id = p_admin AND COALESCE((t ->> 'level')::int, 1) = 2
      ), '[]'::json)                                    AS tasks
    FROM jobs j
    WHERE j.user_id = p_admin
      AND j.stage <> 'complete'
      AND NOT COALESCE(j.archived, false)
      AND j.start_date IS NOT NULL
  ) r;
$$;

-- CREATE OR REPLACE keeps the function's permissions, but state them again so this file stands on its own.
REVOKE EXECUTE ON FUNCTION _company_calendar_rows(UUID) FROM PUBLIC, anon, authenticated;
