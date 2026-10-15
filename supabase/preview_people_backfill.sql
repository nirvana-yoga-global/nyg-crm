-- ============================================================
-- preview_people_backfill.sql
-- READ-ONLY (data tables untouched).
-- normalize_phone() is created or replaced here as a preparatory
-- step — it modifies only function metadata, not any data table.
-- Run in Supabase SQL Editor BEFORE add_people_table.sql.
-- Returns one result set with columns: section, name, detail.
-- ============================================================

CREATE OR REPLACE FUNCTION normalize_phone(raw text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  WITH
    digits   AS (SELECT regexp_replace(coalesce(raw, ''), '[^0-9]', '', 'g') AS v),
    stripped AS (SELECT CASE WHEN v LIKE '00%' THEN substring(v FROM 3) ELSE v END AS v FROM digits)
  SELECT
    CASE
      WHEN v = ''                             THEN NULL
      WHEN length(v) = 10 AND v ~ '^[6-9]'  THEN '91' || v
      WHEN length(v) = 11 AND v ~ '^0[6-9]' THEN '91' || substring(v FROM 2)
      WHEN length(v) = 12 AND v ~ '^91'      THEN v
      ELSE v
    END
  FROM stripped
$$;

SELECT * FROM (

  -- ── 1_counts: summary of what each backfill rule will create ──

  SELECT '1_counts'::text AS section,
         'a: student profiles'::text AS name,
         COUNT(*)::text AS detail
  FROM profiles
  WHERE role = 'student'

  UNION ALL

  SELECT '1_counts',
         'c: enrolled enquiries (total)',
         COUNT(*)::text
  FROM enquiries
  WHERE status = 'enrolled'

  UNION ALL

  SELECT '1_counts',
         'c: enrolled enquiries matching existing person by phone',
         COUNT(DISTINCT e.id)::text
  FROM enquiries e
  JOIN profiles pr ON pr.role = 'student'
  LEFT JOIN students s ON s.profile_id = pr.id
  WHERE e.status = 'enrolled'
    AND normalize_phone(e.phone) IS NOT NULL
    AND normalize_phone(e.phone) = normalize_phone(s.phone)

  UNION ALL

  SELECT '1_counts',
         'c: enrolled enquiries that would get a NEW person row',
         COUNT(*)::text
  FROM enquiries e
  WHERE e.status = 'enrolled'
    AND NOT EXISTS (
      SELECT 1
      FROM profiles pr
      LEFT JOIN students s ON s.profile_id = pr.id
      WHERE pr.role = 'student'
        AND normalize_phone(e.phone) IS NOT NULL
        AND normalize_phone(e.phone) = normalize_phone(s.phone)
    )

  UNION ALL

  -- ── 2_c_matches: enrolled enquiries that share a phone with
  --    an existing student profile (they will be linked, not
  --    given a new people row — confirm these are the same person)

  SELECT '2_c_matches',
         e.name,
         'enquiry phone ' || COALESCE(e.phone, '—')
           || ' matches student ' || COALESCE(s.name, pr.full_name, '?')
           || ' (profile ' || pr.id::text || ')'
  FROM enquiries e
  JOIN profiles pr ON pr.role = 'student'
  LEFT JOIN students s ON s.profile_id = pr.id
  WHERE e.status = 'enrolled'
    AND normalize_phone(e.phone) IS NOT NULL
    AND normalize_phone(e.phone) = normalize_phone(s.phone)

  UNION ALL

  -- ── 3_phone_collisions: phone numbers appearing on more than
  --    one source row across all three rule sets. These will share
  --    one people row after backfill. Families sharing a number
  --    are expected; strangers sharing one are not — review.

  SELECT '3_phone_collisions',
         phone_norm,
         string_agg(src || ': ' || label, ' | ' ORDER BY src)
  FROM (
    SELECT normalize_phone(s.phone) AS phone_norm,
           'profile' AS src,
           COALESCE(s.name, pr.full_name, '?') AS label
    FROM profiles pr
    LEFT JOIN students s ON s.profile_id = pr.id
    WHERE pr.role = 'student'
      AND normalize_phone(s.phone) IS NOT NULL

    UNION ALL

    SELECT normalize_phone(e.phone),
           'enrolled_enquiry',
           e.name
    FROM enquiries e
    WHERE e.status = 'enrolled'
      AND normalize_phone(e.phone) IS NOT NULL
  ) x
  GROUP BY phone_norm
  HAVING COUNT(*) > 1

  UNION ALL

  -- ── 4_no_phone: source rows with no usable phone number.
  --    These will get a people row but phone_normalized will be NULL.

  SELECT '4_no_phone',
         src,
         label
  FROM (
    SELECT 'profile' AS src,
           pr.id::text || ' ' || COALESCE(pr.full_name, '?') AS label
    FROM profiles pr
    LEFT JOIN students s ON s.profile_id = pr.id
    WHERE pr.role = 'student'
      AND normalize_phone(s.phone) IS NULL

    UNION ALL

    SELECT 'enrolled_enquiry',
           e.id::text || ' ' || COALESCE(e.name, '?')
    FROM enquiries e
    WHERE e.status = 'enrolled'
      AND normalize_phone(e.phone) IS NULL
  ) no_phone_rows

  UNION ALL

  -- ── 5_skipped_profiles: non-student profiles. Backfill rule a
  --    ignores these. Listed so you know what is excluded.

  SELECT '5_skipped_profiles',
         pr.role,
         COUNT(*)::text
  FROM profiles pr
  WHERE pr.role <> 'student'
  GROUP BY pr.role

) t
ORDER BY section, name;
