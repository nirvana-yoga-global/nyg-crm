-- ============================================================
-- verify_batch_dues.sql
-- Run after add_batch_dues.sql to confirm everything landed.
-- All columns cast to text so the result set is uniform.
-- ============================================================

SELECT section, name, detail
FROM (

  -- ── 1. New columns ───────────────────────────────────────────
  SELECT
    '1_columns'                     AS section,
    c.table_name || '.' || c.column_name AS name,
    'type=' || c.data_type
      || ' nullable=' || c.is_nullable
      || COALESCE(' default=' || c.column_default, '')
                                    AS detail
  FROM information_schema.columns c
  WHERE (c.table_name = 'enrollments'  AND c.column_name = 'batch_member_id')
     OR (c.table_name = 'installments' AND c.column_name = 'kind')

  UNION ALL

  -- ── 2. Partial unique index ───────────────────────────────────
  SELECT
    '2_index',
    ix.indexname::text,
    ix.indexdef::text
  FROM pg_indexes ix
  WHERE ix.indexname = 'installments_monthly_unique'

  UNION ALL

  -- ── 3. Functions: existence, security, search_path ───────────
  SELECT
    '3_functions',
    p.proname || '(' ||
      pg_get_function_arguments(p.oid) || ')'           AS name,
    'security=' || CASE p.prosecdef WHEN true THEN 'DEFINER' ELSE 'INVOKER' END
      || ' search_path=' ||
        COALESCE(
          (SELECT unnest(proconfig) FROM pg_proc
           WHERE oid = p.oid
             AND unnest(proconfig) LIKE 'search_path%'
           LIMIT 1),
          '(not set)'
        )
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'create_batch_enrollment',
      'record_batch_payment',
      'set_batch_member_status'
    )

  UNION ALL

  -- ── 4. Row counts ─────────────────────────────────────────────
  SELECT
    '4_row_counts',
    'enrollments',
    (SELECT COUNT(*)::text FROM enrollments)

  UNION ALL

  SELECT
    '4_row_counts',
    'installments',
    (SELECT COUNT(*)::text FROM installments)

  UNION ALL

  SELECT
    '4_row_counts',
    'batch_members (active)',
    (SELECT COUNT(*)::text FROM batch_members WHERE status = 'active')

  UNION ALL

  -- ── 5. Monthly installments detail ───────────────────────────
  SELECT
    '5_monthly_dues',
    COALESCE(p.full_name, 'unknown')             AS name,
    'batch=' || COALESCE(b.name, '?')
      || ' due=' || i.due_date::text
      || ' amount=' || i.amount::text
      || ' status=' || i.status
  FROM   installments i
  JOIN   enrollments  e ON e.id = i.enrollment_id
  LEFT   JOIN people  p ON p.id = e.person_id
  LEFT   JOIN batch_members bm ON bm.id = e.batch_member_id
  LEFT   JOIN batches b  ON b.id = bm.batch_id
  WHERE  i.kind = 'monthly'

) t
ORDER BY section, name, detail;
