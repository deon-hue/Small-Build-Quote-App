-- A quote's "title" is the same free-text job name introduced for jobs (see
-- jobs-title.sql) — captured right at the start of quoting so it's already set on the
-- Job when the quote is converted, instead of needing to be typed a second time.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
