-- create-invite.sql — how to make an invite code for a friend. Run in the Supabase SQL Editor (the project they will register on).
-- Edit the label (who it is for) and, if you like, the expiry; then run it. The code appears in the results — send it to them.
-- Each code works once. To see which have been used: select code, label, redeemed_at from beta_invites order by created_at desc;

insert into beta_invites (code, label, expires_at)
values (
  'BOS-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4)) || '-' ||
            upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4)) || '-' ||
            upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4)),
  'Friend name / company here',
  now() + interval '30 days'
)
returning code, label, expires_at;
