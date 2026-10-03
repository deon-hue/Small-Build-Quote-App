-- usage-limits-undo.sql — removes what usage-limits.sql added. Only run it together with (or after) deploying code that no longer
-- calls consume_usage(); otherwise the AI and messaging features would report "usage check unavailable".

BEGIN;
DROP FUNCTION IF EXISTS consume_public_use(TEXT, TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS consume_usage(TEXT, TEXT, BOOLEAN);
DROP TABLE IF EXISTS public_usage;
DROP TABLE IF EXISTS ai_usage;
ALTER TABLE settings DROP COLUMN IF EXISTS send_daily_limit;
ALTER TABLE settings DROP COLUMN IF EXISTS ai_daily_limit;
COMMIT;
