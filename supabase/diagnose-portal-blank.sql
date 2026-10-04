-- READ-ONLY check: why is a customer's portal blank?
-- Change the email on the first line, then run in the Supabase SQL Editor (live project "BuildOS Live").
-- It changes nothing. Paste the result back to Claude.

WITH me AS (SELECT 'deonholmes@hotmail.com'::text AS email)   -- <-- put the test customer's email here
SELECT 'portal login' AS what,
       u.id::text AS id, u.email AS detail_1,
       COALESCE(p.role, 'NO PROFILE') AS detail_2,
       COALESCE(p.admin_user_id::text, 'not linked') AS detail_3
FROM me LEFT JOIN auth.users u ON LOWER(u.email) = LOWER(me.email)
LEFT JOIN profiles p ON p.id = u.id

UNION ALL
SELECT 'client record (which builder has this email)',
       c.id::text, c.name || ' [' || COALESCE(c.email,'') || ']',
       'builder=' || c.user_id::text,
       COALESCE((SELECT s.company_name FROM settings s WHERE s.user_id = c.user_id LIMIT 1), '?')
FROM me JOIN clients c ON LOWER(TRIM(c.email)) = LOWER(TRIM(me.email))

UNION ALL
SELECT 'job for that client',
       j.id::text, j.client || ' / ' || COALESCE(j.type,''),
       'builder=' || j.user_id::text, 'stage=' || COALESCE(j.stage,'')
FROM me JOIN clients c ON LOWER(TRIM(c.email)) = LOWER(TRIM(me.email))
JOIN jobs j ON j.user_id = c.user_id AND LOWER(j.client) = LOWER(c.name)

UNION ALL
SELECT 'quote with that customer email',
       q.id::text, q.ref, 'builder=' || q.user_id::text, 'status=' || COALESCE(q.status,'')
FROM me JOIN quotes q ON LOWER(q.customer->>'email') = LOWER(me.email)

UNION ALL
SELECT 'contract sent',
       k.id::text, k.status, 'job=' || k.job_id::text, 'builder=' || k.user_id::text
FROM me JOIN clients c ON LOWER(TRIM(c.email)) = LOWER(TRIM(me.email))
JOIN jobs j ON j.user_id = c.user_id AND LOWER(j.client) = LOWER(c.name)
JOIN contracts k ON k.job_id = j.id;
