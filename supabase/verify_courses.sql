-- ============================================================
-- verify_courses.sql
-- READ-ONLY. Run in the Supabase SQL Editor AFTER
-- add_courses_table.sql has been applied successfully.
--
-- Returns one result set: section / name / detail (all text).
-- Checks:
--   1_table      — courses exists, RLS ON, >= 1 policy
--   2_courses    — every seeded row with runs_batches + is_active
--   3_missing    — enquiries.course_interested values NOT in courses
--                  (should be zero rows)
--   4_constraints — remaining CHECK constraints on enquiries and
--                   batches (course-list ones should be absent;
--                   mode / status / etc. should still be present)
-- ============================================================

SELECT * FROM (

  -- ── 1_table: courses table, RLS status, policy count ─────────

  SELECT
    '1_table'::text AS section,
    c.relname::text AS name,
    (
      'RLS '
      || CASE WHEN c.relrowsecurity THEN 'ON' ELSE 'OFF' END
      || ', '
      || COALESCE(p.cnt, 0)::text
      || ' polic'
      || CASE WHEN COALESCE(p.cnt, 0) = 1 THEN 'y' ELSE 'ies' END
    )::text         AS detail
  FROM pg_class c
  LEFT JOIN (
    SELECT tablename, COUNT(*) AS cnt
    FROM   pg_policies
    WHERE  schemaname = 'public'
    GROUP  BY tablename
  ) p ON p.tablename = c.relname
  WHERE c.relname       = 'courses'
    AND c.relnamespace  = 'public'::regnamespace

  UNION ALL

  -- ── 2_courses: every row in courses ──────────────────────────

  SELECT
    '2_courses'::text,
    name::text,
    (
      'sort=' || sort_order::text
      || ', runs_batches=' || runs_batches::text
      || ', is_active='    || is_active::text
    )::text
  FROM courses

  UNION ALL

  -- ── 3_missing: course_interested values not in courses ────────
  -- Should return zero rows. Any row here means a lead has a
  -- course value that was not caught by the catch-up seed.

  SELECT
    '3_missing'::text,
    course_interested::text,
    'enquiries.course_interested NOT in courses ← should be none'::text
  FROM enquiries
  WHERE course_interested IS NOT NULL
    AND course_interested <> ''
    AND course_interested NOT IN (SELECT name FROM courses)

  UNION ALL

  -- ── 4_constraints: remaining CHECK constraints on enquiries
  --    and batches. Confirm that the hard-coded course lists are
  --    gone; mode / status / etc. constraints should still appear.

  SELECT
    '4_constraints'::text,
    con.conname::text,
    (
      con.conrelid::regclass::text
      || ': '
      || pg_get_constraintdef(con.oid)
    )::text
  FROM pg_constraint con
  WHERE con.conrelid IN ('enquiries'::regclass, 'batches'::regclass)
    AND con.contype = 'c'

) t
ORDER BY section, name;
