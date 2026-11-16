-- ============================================================
-- Subcontractor portal COMPANY CALENDAR: send each job's colour.
--
-- The week view shows every job in its own colour, the one the builder picked on the job (Jobs → edit → colour swatch, the jobs.color column).
-- This only ADDS one field (job_color) to what _company_calendar_rows already returns; nothing else changes, and it is the same function body as
-- supabase/sub-company-calendar.sql otherwise. Until it is run the calendar still works: jobs show the automatic colour the app gives a job with
-- no pick (a colour worked out from the job's id), which matches the app for any job nobody picked a colour for.
-- Run supabase/jobs-color.sql and supabase/sub-company-calendar.sql first. Safe to run more than once. Staging first, then live.
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

-- CREATE OR REPLACE keeps the function's permissions, but state them again so this file stands on its own.
REVOKE EXECUTE ON FUNCTION _company_calendar_rows(UUID) FROM PUBLIC, anon, authenticated;
