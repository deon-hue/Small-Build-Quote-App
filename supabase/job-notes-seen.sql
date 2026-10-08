-- ============================================================
-- Job notes: remember which subcontractor notes the builder has looked at.
-- Adds job_notes.seen_at. A note a subcontractor sends starts with no seen_at (so it shows as NEW on the job and on the dashboard), and opening
-- that job's Activity Log stamps it. Existing notes are marked as already seen the first time this runs, so nothing old shows as new.
-- Safe to run more than once (the "already seen" step only happens the first time). Staging first, then live.
-- ============================================================

DO $$
DECLARE had_column BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'job_notes' AND column_name = 'seen_at') INTO had_column;
  IF NOT had_column THEN
    ALTER TABLE job_notes ADD COLUMN seen_at TIMESTAMPTZ;
    UPDATE job_notes SET seen_at = now();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_job_notes_unseen ON job_notes (user_id) WHERE seen_at IS NULL AND source = 'subcontractor';
