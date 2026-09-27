-- An estimator can pick one of the 10 JOB_COLORS swatches for a job, overriding the
-- automatic per-id colour used everywhere a job is shown in colour (Jobs list, Gantt
-- chart, Calendar, Notes picker). Empty/null means "no manual pick" — falls back to the
-- automatic colour via resolveJobColor() in lib/utils.ts.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS color TEXT;
