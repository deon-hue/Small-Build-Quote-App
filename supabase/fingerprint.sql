-- fingerprint.sql — READ-ONLY. Boils the structure of a database down to a few short fingerprints so two databases
-- (live and staging) can be compared without sending any data. Run it on each project and compare the rows:
-- the same count + the same hash on a row means that part is identical. Contains no customer data.

with t as (
  select c.relname,
         string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text || ':' ||
                    coalesce(pg_get_expr(d.adbin, d.adrelid), ''), ',' order by a.attnum) as cols
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
  where n.nspname = 'public' and c.relkind = 'r'
  group by c.relname
)
select 'tables (columns)' as part, count(*) as n, md5(string_agg(relname || cols, '|' order by relname)) as hash from t
union all
select 'security rules (policies)', count(*),
       md5(string_agg(tablename || policyname || cmd || roles::text || coalesce(qual, '') || coalesce(with_check, ''), '|' order by tablename, policyname))
from pg_policies where schemaname = 'public'
union all
select 'functions', count(*),
       md5(string_agg(p.proname || pg_get_function_arguments(p.oid) || p.prosecdef::text || p.prosrc, '|' order by p.proname, pg_get_function_arguments(p.oid)))
from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
union all
select 'triggers', count(*), md5(string_agg(tgname || pg_get_triggerdef(t.oid), '|' order by tgname))
from pg_trigger t where not tgisinternal
union all
select 'indexes', count(*), md5(string_agg(indexdef, '|' order by indexname))
from pg_indexes where schemaname = 'public'
union all
select 'row security switched on', count(*), md5(string_agg(relname || relrowsecurity::text, '|' order by relname))
from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'
union all
select 'storage buckets', count(*), coalesce(md5(string_agg(id || public::text, '|' order by id)), '-') from storage.buckets
union all
select 'storage rules', count(*),
       coalesce(md5(string_agg(policyname || cmd || coalesce(qual, '') || coalesce(with_check, ''), '|' order by policyname)), '-')
from pg_policies where schemaname = 'storage'
union all
select 'functions signed-out visitors can run', count(*), coalesce(md5(string_agg(p.proname, '|' order by p.proname)), '-')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')
order by 1;
