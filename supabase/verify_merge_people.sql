-- Verify public.merge_people was created correctly.
-- Expected results:
--   1_function_meta  | merge_people           | security_definer=true | config={search_path=public}
--   2_privileges     | execute_anon           | false
--   2_privileges     | execute_public         | false
--   3_grant          | execute_authenticated  | true

select section, name, detail
from (

  -- 1. Function existence, SECURITY DEFINER, and search_path config
  select
    '1_function_meta'::text                                       as section,
    p.proname::text                                               as name,
    (   'security_definer=' || p.prosecdef::text
     || ' | config='        || coalesce(p.proconfig::text, 'none')
    )::text                                                       as detail
  from pg_proc p
  where p.proname        = 'merge_people'
    and p.pronamespace   = 'public'::regnamespace

  union all

  -- 2. EXECUTE privilege for public role (should be false after REVOKE)
  select
    '2_privileges'::text,
    'execute_public'::text,
    has_function_privilege('public', 'public.merge_people(uuid,uuid)', 'EXECUTE')::text

  union all

  -- 2. EXECUTE privilege for anon role (should be false after REVOKE)
  select
    '2_privileges'::text,
    'execute_anon'::text,
    has_function_privilege('anon', 'public.merge_people(uuid,uuid)', 'EXECUTE')::text

  union all

  -- 3. EXECUTE grant for authenticated role (should be true after GRANT)
  select
    '3_grant'::text,
    'execute_authenticated'::text,
    has_function_privilege('authenticated', 'public.merge_people(uuid,uuid)', 'EXECUTE')::text

) sub
order by section, name;
