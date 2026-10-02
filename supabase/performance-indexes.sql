-- performance-indexes.sql — indexes on the columns the app filters by on almost every request.
-- Almost every query is "WHERE user_id = ..." (and every row-level-security policy checks it too),
-- and most tables had no index on it, so Postgres read the whole table each time. Harmless now,
-- noticeably slower as jobs, quotes, time logs etc. build up.
--
-- Safe to run more than once, and safe if a table or column doesn't exist in your database: each
-- index is only created if its table and column are really there. Run in the Supabase SQL Editor.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('jobs',                 'user_id'),
      ('quotes',               'user_id'),
      ('invoices',             'user_id'),
      ('variations',           'user_id'),
      ('job_notes',            'user_id'),
      ('bills',                'user_id'),
      ('job_payments',         'user_id'),
      ('gantt_states',         'user_id'),
      ('gantt_states',         'job_id'),
      ('sub_contracts',        'user_id'),
      ('sub_contracts',        'contact_id'),
      ('sub_time_entries',     'user_id'),
      ('sub_time_entries',     'contact_id'),
      ('sub_payment_stages',   'user_id'),
      ('sub_admin_time_logs',  'user_id'),
      ('sub_admin_time_logs',  'contact_id'),
      ('sub_admin_time_logs',  'job_id'),
      ('quote_documents',      'user_id'),
      ('quote_documents',      'quote_id'),
      ('invoices',             'job_id'),
      ('variations',           'job_id'),
      ('job_notes',            'job_id'),
      ('job_payments',         'job_id'),
      ('team_members',         'auth_user_id')
    ) AS v(tbl, col)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
      WHERE c.table_schema = 'public' AND c.table_name = r.tbl AND c.column_name = r.col
    ) THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%I)', 'idx_' || r.tbl || '_' || r.col, r.tbl, r.col);
      RAISE NOTICE 'index ensured: %(%)', r.tbl, r.col;
    ELSE
      RAISE NOTICE 'skipped (not found): %(%)', r.tbl, r.col;
    END IF;
  END LOOP;
END $$;
