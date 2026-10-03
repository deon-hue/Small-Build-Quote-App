-- fingerprint-functions.sql — READ-ONLY. One short fingerprint per database function and storage bucket, so a live-vs-staging
-- difference can be traced to the exact function. Contains no customer data. Run on each project, compare the hash column.

select 'function' as kind, p.proname || '(' || pg_get_function_arguments(p.oid) || ')' as name,
       left(md5(p.prosrc || p.prosecdef::text || coalesce(array_to_string(p.proconfig, ','), '')), 8) as hash
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
union all
select 'bucket', id, public::text || ' / ' || coalesce(file_size_limit::text, 'no limit') from storage.buckets
order by 1, 2;
