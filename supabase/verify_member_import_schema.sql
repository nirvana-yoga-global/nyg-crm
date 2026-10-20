select section, name, detail
from (

  -- 1. New columns added to people
  select
    '1_people_columns'::text as section,
    column_name::text        as name,
    data_type::text
      || coalesce(' default ' || column_default::text, '')
      || case when is_nullable = 'NO' then ' NOT NULL' else '' end
                             as detail
  from information_schema.columns
  where table_schema = 'public'
    and table_name   = 'people'
    and column_name  in (
      'register_no','country','country_code','language','referred_by',
      'contact_via','alternate_phone','person_type','needs_review',
      'review_type','review_note','review_pair','community_status','community_invited_on'
    )

  union all

  -- 2. New tables: RLS state and policy count
  select
    '2_tables_rls'::text as section,
    c.relname::text      as name,
    case when c.relrowsecurity then 'RLS ON' else 'RLS OFF' end
      || ' | policies: ' || count(p.polname)::text
                         as detail
  from pg_class c
  left join pg_policy p on p.polrelid = c.oid
  where c.relnamespace = 'public'::regnamespace
    and c.relname::text in (
      'whatsapp_groups','person_whatsapp_groups','person_programmes','araiki_history'
    )
  group by c.relname, c.relrowsecurity

  union all

  -- 3. Seeded whatsapp_groups rows
  select
    '3_whatsapp_groups_seed'::text    as section,
    name::text                        as name,
    'sort_order=' || sort_order::text as detail
  from public.whatsapp_groups

  union all

  -- 4. CHECK constraints on people
  select
    '4_check_constraints'::text         as section,
    conname::text                       as name,
    pg_get_constraintdef(oid)::text     as detail
  from pg_constraint
  where conrelid = 'public.people'::regclass
    and contype  = 'c'
    and conname::text in (
      'people_person_type_check',
      'people_community_status_check'
    )

) sub
order by section, name;
