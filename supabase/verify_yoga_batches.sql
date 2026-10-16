-- ============================================================
-- verify_yoga_batches.sql
-- READ-ONLY. Run in the Supabase SQL Editor AFTER
-- add_yoga_batches.sql has been applied successfully.
--
-- Returns one result set: section / name / detail (all text).
-- Check:
--   section 1_tables  — all 4 tables exist, RLS ON, >= 1 policy
--   section 2_constraint — course_interested CHECK includes
--                          'Online Yoga'
--   section 3_row_counts — all 4 tables show 0 rows
-- ============================================================

SELECT * FROM (

  -- ── 1_tables: existence, RLS status, policy count ────────────

  SELECT
    '1_tables'::text                                              AS section,
    t.tname::text                                                 AS name,
    (
      'RLS '
      || CASE WHEN c.relrowsecurity THEN 'ON' ELSE 'OFF' END
      || ', '
      || COALESCE(p.cnt, 0)::text
      || ' polic'
      || CASE WHEN COALESCE(p.cnt, 0) = 1 THEN 'y' ELSE 'ies' END
    )::text                                                       AS detail
  FROM (VALUES
    ('batches'::text),
    ('batch_members'),
    ('batch_sessions'),
    ('batch_attendance')
  ) AS t(tname)
  JOIN pg_class c
    ON  c.relname       = t.tname
    AND c.relnamespace  = 'public'::regnamespace
  LEFT JOIN (
    SELECT tablename, COUNT(*) AS cnt
    FROM   pg_policies
    WHERE  schemaname = 'public'
    GROUP  BY tablename
  ) p ON p.tablename = t.tname

  UNION ALL

  -- ── 2_constraint: enquiries.course_interested CHECK ──────────
  -- Shows the full constraint definition so you can confirm
  -- 'Online Yoga' is present. Returns no rows if the constraint
  -- does not exist (a sign the migration did not run).

  SELECT
    '2_constraint'::text,
    con.conname::text,
    pg_get_constraintdef(con.oid)::text
  FROM pg_constraint con
  WHERE con.conrelid = 'enquiries'::regclass
    AND con.contype  = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%course_interested%'

  UNION ALL

  -- ── 3_row_counts: all 4 tables should be empty ───────────────

  SELECT '3_row_counts'::text, 'batches'::text,          COUNT(*)::text FROM batches
  UNION ALL
  SELECT '3_row_counts'::text, 'batch_members'::text,    COUNT(*)::text FROM batch_members
  UNION ALL
  SELECT '3_row_counts'::text, 'batch_sessions'::text,   COUNT(*)::text FROM batch_sessions
  UNION ALL
  SELECT '3_row_counts'::text, 'batch_attendance'::text, COUNT(*)::text FROM batch_attendance

) t
ORDER BY section, name;
