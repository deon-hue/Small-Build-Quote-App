-- ============================================================
-- Task assignments: allow SEVERAL people on one task.
--
-- The first version of task-assignments.sql allowed one person per task (UNIQUE (job_id, phase_id)). Real jobs often have more than
-- one subcontractor on site doing the same task, so that rule is replaced by "the same person only once per task".
-- Run this once on any database that already ran the first version (staging and live). New installs of task-assignments.sql already
-- have the new rule, and running this on them changes nothing. Safe to run more than once.
-- ============================================================

ALTER TABLE task_assignments DROP CONSTRAINT IF EXISTS task_assignments_job_id_phase_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS task_assignments_one_per_person
  ON task_assignments (job_id, phase_id, (COALESCE(assignee_id::text, 'name:' || lower(assignee_name))));
