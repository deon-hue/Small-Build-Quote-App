-- create-owner-admin.sql — makes ONE login the platform owner (it can open the /owner area). Run in the Supabase SQL Editor of the project
-- you are setting up (staging first, then live).
--
-- 1. First create the owner's login: Authentication → Users → Add user → Create new user. Use a SEPARATE email from your Small Build
--    login (for example deon+owner@yourdomain), set a password, and tick Auto Confirm User.
-- 2. Put that same email in the line below (replace OWNER-EMAIL-HERE) and Run. It returns one row if it worked.
-- 3. Sign in at the normal sign-in page with that login. You will be taken to /owner and asked to set up two-step sign-in
--    (a 6-digit code from an authenticator app). The owner area stays locked until you have done that.
-- To remove an owner later:  delete from platform_admins where lower(email) = lower('OWNER-EMAIL-HERE');

insert into platform_admins (user_id, email)
select id, email from auth.users where lower(email) = lower('OWNER-EMAIL-HERE')
on conflict (user_id) do nothing
returning email, created_at;
