-- ============================================================
-- Task assignments: which subcontractor / worker (a Contact) is booked on which task of a job's schedule.
--
-- Kept in its OWN table, not inside the job's saved schedule (gantt_states), on purpose: the client portal reads the saved
-- schedule, so anything stored there could be seen by the client. This table has no client access at all — only the
-- contractor's own company (and its team members) can read or change it.
--
-- phase_id is the id of the schedule row (a phase or a task) inside gantt_states; it is text, not a foreign key, because
-- schedule rows live inside a JSON document. An assignment left behind by a deleted task is harmless and unseen.
-- Safe to run more than once. Staging first, then live.
-- ============================================================

CREATE TABLE IF NOT EXISTS task_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id        UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  phase_id      TEXT NOT NULL CHECK (char_length(phase_id) BETWEEN 1 AND 200),
  assignee_id   UUID REFERENCES clients(id) ON DELETE SET NULL,   -- the Contact; null if that contact was later deleted
  assignee_name TEXT NOT NULL CHECK (char_length(assignee_name) BETWEEN 1 AND 160),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Several people can be booked on one task, but the same person only once per task
CREATE UNIQUE INDEX IF NOT EXISTS task_assignments_one_per_person
  ON task_assignments (job_id, phase_id, (COALESCE(assignee_id::text, 'name:' || lower(assignee_name))));

ALTER TABLE task_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON task_assignments FROM anon;

DROP POLICY IF EXISTS "Own task assignments" ON task_assignments;
CREATE POLICY "Own task assignments" ON task_assignments FOR ALL
  USING      (user_id = get_effective_owner_id())
  WITH CHECK (user_id = get_effective_owner_id()
              AND EXISTS (SELECT 1 FROM jobs j WHERE j.id = job_id AND j.user_id = get_effective_owner_id()));

CREATE INDEX IF NOT EXISTS task_assignments_job_id_idx ON task_assignments(job_id);
CREATE INDEX IF NOT EXISTS task_assignments_assignee_idx ON task_assignments(assignee_id);
