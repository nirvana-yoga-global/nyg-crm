-- ============================================================
-- verify_people.sql
-- READ-ONLY — run in Supabase SQL Editor AFTER add_people_table.sql.
-- Returns one result set with columns: section, metric, value.
-- Every row whose metric ends with "← 0 expected" must show 0.
-- Expected people total: 9
--   7 from student profiles (rule a)
--   2 from enrolled enquiries (rule c)
-- Rule b (students with no profile_id) was removed — those rows
-- are test entries and are left in the students table untouched.
-- ============================================================

SELECT * FROM (

  -- ── 1_people: totals in the new people table ─────────────────

  SELECT '1_people'::text AS section,
         'total people'::text AS metric,
         COUNT(*)::text AS value
  FROM people

  UNION ALL

  SELECT '1_people', 'with profile_id (PWA-linked)', COUNT(*)::text
  FROM people WHERE profile_id IS NOT NULL

  UNION ALL

  SELECT '1_people', 'without profile_id (lead-only)', COUNT(*)::text
  FROM people WHERE profile_id IS NULL

  UNION ALL

  SELECT '1_people', 'with phone_normalized set', COUNT(*)::text
  FROM people WHERE phone_normalized IS NOT NULL

  UNION ALL

  SELECT '1_people', 'without any phone', COUNT(*)::text
  FROM people WHERE phone IS NULL OR phone = ''

  UNION ALL

  -- ── 2_coverage: person_id linkage per child table ─────────────
  -- Total rows, rows linked, and gap rows (student_profile_id set
  -- but person_id still NULL — should be 0 after migration).

  SELECT '2_coverage', 'enrollments: total', COUNT(*)::text
  FROM enrollments

  UNION ALL

  SELECT '2_coverage', 'enrollments: person_id set', COUNT(*)::text
  FROM enrollments WHERE person_id IS NOT NULL

  UNION ALL

  SELECT '2_coverage',
         'enrollments: student_profile_id set but person_id NULL ← 0 expected',
         COUNT(*)::text
  FROM enrollments WHERE student_profile_id IS NOT NULL AND person_id IS NULL

  UNION ALL

  SELECT '2_coverage', 'araiki_attunements: total', COUNT(*)::text
  FROM araiki_attunements

  UNION ALL

  SELECT '2_coverage', 'araiki_attunements: person_id set', COUNT(*)::text
  FROM araiki_attunements WHERE person_id IS NOT NULL

  UNION ALL

  SELECT '2_coverage',
         'araiki_attunements: student_profile_id set but person_id NULL ← 0 expected',
         COUNT(*)::text
  FROM araiki_attunements WHERE student_profile_id IS NOT NULL AND person_id IS NULL

  UNION ALL

  SELECT '2_coverage', 'progress_entries: total', COUNT(*)::text
  FROM progress_entries

  UNION ALL

  SELECT '2_coverage', 'progress_entries: person_id set', COUNT(*)::text
  FROM progress_entries WHERE person_id IS NOT NULL

  UNION ALL

  SELECT '2_coverage',
         'progress_entries: student_profile_id set but person_id NULL ← 0 expected',
         COUNT(*)::text
  FROM progress_entries WHERE student_profile_id IS NOT NULL AND person_id IS NULL

  UNION ALL

  SELECT '2_coverage', 'student_notes: total', COUNT(*)::text
  FROM student_notes

  UNION ALL

  SELECT '2_coverage', 'student_notes: person_id set', COUNT(*)::text
  FROM student_notes WHERE person_id IS NOT NULL

  UNION ALL

  SELECT '2_coverage',
         'student_notes: student_profile_id set but person_id NULL ← 0 expected',
         COUNT(*)::text
  FROM student_notes WHERE student_profile_id IS NOT NULL AND person_id IS NULL

  UNION ALL

  SELECT '2_coverage', 'meetup_attendance: total', COUNT(*)::text
  FROM meetup_attendance

  UNION ALL

  SELECT '2_coverage', 'meetup_attendance: person_id set', COUNT(*)::text
  FROM meetup_attendance WHERE person_id IS NOT NULL

  UNION ALL

  SELECT '2_coverage',
         'meetup_attendance: student_profile_id set but person_id NULL ← 0 expected',
         COUNT(*)::text
  FROM meetup_attendance WHERE student_profile_id IS NOT NULL AND person_id IS NULL

  UNION ALL

  SELECT '2_coverage', 'intake_forms: total', COUNT(*)::text
  FROM intake_forms

  UNION ALL

  SELECT '2_coverage', 'intake_forms: person_id set', COUNT(*)::text
  FROM intake_forms WHERE person_id IS NOT NULL

  UNION ALL

  SELECT '2_coverage',
         'intake_forms: student_profile_id set but person_id NULL ← 0 expected',
         COUNT(*)::text
  FROM intake_forms WHERE student_profile_id IS NOT NULL AND person_id IS NULL

  UNION ALL

  SELECT '2_coverage',
         'enquiries: enrolled with person_id set',
         COUNT(*)::text
  FROM enquiries WHERE status = 'enrolled' AND person_id IS NOT NULL

  UNION ALL

  SELECT '2_coverage',
         'enquiries: enrolled but person_id NULL ← 0 expected',
         COUNT(*)::text
  FROM enquiries WHERE status = 'enrolled' AND person_id IS NULL

  UNION ALL

  -- ── 3_rls: policy count per relevant table ────────────────────
  -- Each of the five tables listed should show at least 1 policy.

  SELECT '3_rls',
         tablename,
         COUNT(*)::text || ' polic' || CASE WHEN COUNT(*) = 1 THEN 'y' ELSE 'ies' END
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN (
      'people', 'enrollments', 'installments',
      'araiki_attunements', 'student_notes'
    )
  GROUP BY tablename

  UNION ALL

  -- ── 4_phone_dups: phone_normalized values shared by >1 person ─
  -- Families sharing a number are expected. Strangers are not.

  SELECT '4_phone_dups',
         phone_normalized,
         COUNT(*)::text || ' people rows'
  FROM people
  WHERE phone_normalized IS NOT NULL
  GROUP BY phone_normalized
  HAVING COUNT(*) > 1

  UNION ALL

  -- ── 5_orphan: people with no profile_id and no phone ──────────
  -- Not an error, but worth knowing (enrolled lead with no phone).

  SELECT '5_orphan',
         'people: no profile_id and no phone',
         COUNT(*)::text
  FROM people
  WHERE profile_id IS NULL
    AND (phone IS NULL OR phone = '')

) t
ORDER BY section, metric;
