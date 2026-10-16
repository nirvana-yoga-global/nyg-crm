-- ============================================================
-- add_courses_table.sql
-- Idempotent. One transaction. Run in the Supabase SQL Editor
-- AFTER add_yoga_batches.sql has been applied.
--
-- 1. Creates the courses table — the single source of truth for
--    all course names used across enquiries, batches, and enrollments.
-- 2. Seeds 9 standard courses (sort_order 10, 20, … 90).
-- 3. Inserts any extra enquiries.course_interested values already
--    in the DB so no existing lead loses its course.
-- 4. Drops the two hard-coded course CHECK constraints:
--      • enquiries_course_interested_check  (IF EXISTS by name)
--      • batches.course CHECK               (found via pg_get_constraintdef)
--    Does NOT touch enquiries_service_interested_check or any
--    constraint on the students table (both PWA-owned).
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. courses table
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS courses (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL UNIQUE,
  runs_batches boolean     NOT NULL DEFAULT false,
  is_active    boolean     NOT NULL DEFAULT true,
  sort_order   integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin all on courses" ON courses;
CREATE POLICY "Admin all on courses" ON courses
  FOR ALL TO authenticated
  USING      ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- ─────────────────────────────────────────────────────────────
-- 2. Seed — standard courses
--    ON CONFLICT DO NOTHING makes this safe to re-run.
-- ─────────────────────────────────────────────────────────────

INSERT INTO courses (name, runs_batches, sort_order) VALUES
  ('Regular Yoga',                   true,  10),
  ('Yoga Therapy',                   true,  20),
  ('Online Yoga',                    true,  30),
  ('Araiki Local',                   false, 40),
  ('Araiki Foreigner',               false, 50),
  ('Amasana / Inner Mastery Circle', false, 60),
  ('TTC',                            false, 70),
  ('Free Workshop',                  false, 80),
  ('Gold''s Gym',                    false, 90)
ON CONFLICT (name) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 3. Catch-up seed — any enquiries.course_interested value
--    already in the database that is not in the standard list.
--    Inserted with runs_batches = false, sort_order = 0
--    (admin can adjust later). ON CONFLICT DO NOTHING is the
--    primary guard; the NOT IN clause is belt-and-suspenders.
-- ─────────────────────────────────────────────────────────────

INSERT INTO courses (name, runs_batches, sort_order)
SELECT DISTINCT course_interested, false, 0
FROM   enquiries
WHERE  course_interested IS NOT NULL
  AND  course_interested <> ''
  AND  course_interested NOT IN (SELECT name FROM courses)
ON CONFLICT (name) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 4a. Drop enquiries.course_interested CHECK (our constraint,
--     added by add_yoga_batches.sql). Safe if already absent.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE enquiries
  DROP CONSTRAINT IF EXISTS enquiries_course_interested_check;

-- ─────────────────────────────────────────────────────────────
-- 4b. Drop batches.course CHECK (inline constraint from
--     add_yoga_batches.sql; auto-named batches_course_check by
--     PostgreSQL). Found by pg_get_constraintdef to handle any
--     auto-naming variant safely.
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_conname text;
BEGIN
  FOR v_conname IN
    SELECT conname
    FROM   pg_constraint
    WHERE  conrelid = 'batches'::regclass
      AND  contype  = 'c'
      AND  pg_get_constraintdef(oid) LIKE '%Regular Yoga%'
  LOOP
    EXECUTE format('ALTER TABLE batches DROP CONSTRAINT %I', v_conname);
  END LOOP;
END
$$;

COMMIT;

-- ============================================================
-- ROLLBACK — run manually only if you need to undo this
-- ============================================================
--
-- DROP TABLE IF EXISTS courses;
--
-- -- Restore hard-coded batches.course CHECK:
-- ALTER TABLE batches ADD CONSTRAINT batches_course_check
--   CHECK (course IN ('Regular Yoga', 'Yoga Therapy', 'Online Yoga'));
--
-- -- Restore hard-coded enquiries.course_interested CHECK:
-- ALTER TABLE enquiries ADD CONSTRAINT enquiries_course_interested_check
--   CHECK (course_interested IN (
--     'Regular Yoga', 'Online Yoga', 'Araiki Local', 'Araiki Foreigner',
--     'Amasana / Inner Mastery Circle', 'TTC', 'Free Workshop', 'Gold''s Gym'
--   ));
