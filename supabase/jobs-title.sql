-- A job's "title" is a free-text name the estimator types in (e.g. "Rear extension for
-- the Pattersons"), separate from its Type (the template category dropdown, e.g. "Rear
-- Extension"). Wherever the app used to show Type as the job's name, it now shows the
-- title instead, falling back to Type for jobs that don't have one set yet.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
