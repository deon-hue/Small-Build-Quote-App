-- contractor-registration-undo.sql — removes what contractor-registration.sql added.
-- Warning: this deletes the invite codes table (and which codes were used). Companies already created keep working;
-- they just can no longer be registered through a code until the main script is run again.

BEGIN;
DROP FUNCTION IF EXISTS redeem_beta_invite(TEXT, TEXT);
DROP FUNCTION IF EXISTS is_contractor();
DROP TABLE IF EXISTS beta_invites;
ALTER TABLE settings DROP COLUMN IF EXISTS terms_accepted_at;
COMMIT;
