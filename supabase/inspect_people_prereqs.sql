-- ============================================================
-- inspect_people_prereqs.sql
-- READ-ONLY — run in the Supabase SQL Editor and paste results back.
-- Returns columns, foreign keys, check constraints and RLS policies
-- for every table touched by the people migration.
-- ============================================================

-- 1. Columns: name, data type, nullability, default
SELECT
  c.table_name,
  c.ordinal_position  AS pos,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN (
    'enrollments', 'installments', 'araiki_attunements',
    'intake_forms', 'progress_entries', 'student_notes',
    'meetup_attendance', 'enquiries', 'students'
  )
ORDER BY c.table_name, c.ordinal_position;

-- 2. Foreign keys
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name  AS foreign_table,
  ccu.column_name AS foreign_column,
  rc.update_rule,
  rc.delete_rule
FROM information_schema.table_constraints     tc
JOIN information_schema.key_column_usage      kcu ON kcu.constraint_name = tc.constraint_name
                                                  AND kcu.table_schema    = tc.table_schema
JOIN information_schema.referential_constraints rc ON rc.constraint_name        = tc.constraint_name
                                                   AND rc.constraint_schema      = tc.table_schema
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name       = rc.unique_constraint_name
                                                    AND ccu.table_schema          = rc.unique_constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema    = 'public'
  AND tc.table_name IN (
    'enrollments', 'installments', 'araiki_attunements',
    'intake_forms', 'progress_entries', 'student_notes',
    'meetup_attendance', 'enquiries', 'students'
  )
ORDER BY tc.table_name, kcu.column_name;

-- 3. Check constraints
SELECT
  tc.table_name,
  tc.constraint_name,
  cc.check_clause
FROM information_schema.table_constraints  tc
JOIN information_schema.check_constraints  cc ON cc.constraint_name = tc.constraint_name
                                              AND cc.constraint_schema = tc.table_schema
WHERE tc.constraint_type = 'CHECK'
  AND tc.table_schema    = 'public'
  AND tc.table_name IN (
    'enrollments', 'installments', 'araiki_attunements',
    'intake_forms', 'progress_entries', 'student_notes',
    'meetup_attendance', 'enquiries', 'students'
  )
ORDER BY tc.table_name, tc.constraint_name;

-- 4. RLS policies
SELECT
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'enrollments', 'installments', 'araiki_attunements',
    'intake_forms', 'progress_entries', 'student_notes',
    'meetup_attendance', 'enquiries', 'students'
  )
ORDER BY tablename, policyname;
