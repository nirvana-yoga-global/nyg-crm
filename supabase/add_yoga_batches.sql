-- ============================================================
-- add_yoga_batches.sql
-- Idempotent where possible. One transaction. Run in the
-- Supabase SQL Editor AFTER add_people_table.sql has been applied.
--
-- Creates:
--   batches            — scheduled yoga batches / classes
--   batch_members      — who is enrolled in which batch
--   batch_sessions     — individual class dates (held / cancelled)
--   batch_attendance   — per-person attendance per session
--
-- Also adds 'Online Yoga' to enquiries.course_interested CHECK.
--
-- NOTE: the column in the codebase and CLAUDE.md is course_interested
-- (not service_interested). If the production column has been renamed,
-- change every reference to course_interested below accordingly.
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. batches
--    One row per recurring scheduled batch / class group.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS batches (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text        NOT NULL,
  course           text        NOT NULL
                               CHECK (course IN (
                                 'Regular Yoga',
                                 'Yoga Therapy',
                                 'Online Yoga'
                               )),
  teacher_name     text,
  mode             text        NOT NULL DEFAULT 'Offline'
                               CHECK (mode IN ('Offline', 'Online')),
  days             smallint[],           -- 0 = Sunday … 6 = Saturday
  start_time       time,
  end_time         time,
  monthly_fee      numeric              DEFAULT 0,
  location_or_link text,
  status           text        NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active', 'paused', 'closed')),
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin all on batches" ON batches;
CREATE POLICY "Admin all on batches" ON batches
  FOR ALL TO authenticated
  USING      ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- ─────────────────────────────────────────────────────────────
-- 2. batch_members
--    Who is enrolled in which batch, and at what fee.
--    ON DELETE RESTRICT on person_id: a student cannot be
--    deleted from people while they are in a batch.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS batch_members (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id             uuid        NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  person_id            uuid        NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  start_date           date        NOT NULL DEFAULT current_date,
  end_date             date,
  status               text        NOT NULL DEFAULT 'active'
                                   CHECK (status IN ('active', 'paused', 'left')),
  monthly_fee_override numeric,    -- NULL = use batches.monthly_fee
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- A student cannot be in the same batch twice concurrently, but may
-- rejoin after leaving. The partial index covers only active/paused rows.
CREATE UNIQUE INDEX IF NOT EXISTS batch_members_active_unique
  ON batch_members (batch_id, person_id)
  WHERE status IN ('active', 'paused');

CREATE INDEX IF NOT EXISTS batch_members_batch_id_idx
  ON batch_members (batch_id);

CREATE INDEX IF NOT EXISTS batch_members_person_id_idx
  ON batch_members (person_id);

ALTER TABLE batch_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin all on batch_members" ON batch_members;
CREATE POLICY "Admin all on batch_members" ON batch_members
  FOR ALL TO authenticated
  USING      ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- ─────────────────────────────────────────────────────────────
-- 3. batch_sessions
--    One row per class date. Sessions may occur on any date —
--    not only on the batch's scheduled weekdays — to allow
--    make-up and special classes.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS batch_sessions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id   uuid        NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  class_date date        NOT NULL,
  status     text        NOT NULL DEFAULT 'held'
                         CHECK (status IN ('held', 'cancelled')),
  note       text,       -- e.g. "postponed to Saturday"
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, class_date)
);

ALTER TABLE batch_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin all on batch_sessions" ON batch_sessions;
CREATE POLICY "Admin all on batch_sessions" ON batch_sessions
  FOR ALL TO authenticated
  USING      ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- ─────────────────────────────────────────────────────────────
-- 4. batch_attendance
--    Per-person attendance record for each session.
--    ON DELETE CASCADE on both FK sides so that removing a
--    session or a person cleans up attendance rows.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS batch_attendance (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid        NOT NULL REFERENCES batch_sessions(id) ON DELETE CASCADE,
  person_id  uuid        NOT NULL REFERENCES people(id)         ON DELETE CASCADE,
  present    boolean     NOT NULL DEFAULT false,
  note       text,
  marked_by  uuid        REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, person_id)
);

ALTER TABLE batch_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin all on batch_attendance" ON batch_attendance;
CREATE POLICY "Admin all on batch_attendance" ON batch_attendance
  FOR ALL TO authenticated
  USING      ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- ─────────────────────────────────────────────────────────────
-- 5. Add 'Online Yoga' to enquiries.course_interested CHECK
--
--    The DO block finds and drops any existing CHECK constraint
--    that references course_interested, regardless of its name.
--    Then the new constraint is added with all current values
--    plus 'Online Yoga'.
--
--    Existing values preserved:
--      Regular Yoga, Araiki Local, Araiki Foreigner,
--      Amasana / Inner Mastery Circle, TTC, Free Workshop,
--      Gold's Gym
--    New value added:
--      Online Yoga
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_conname text;
BEGIN
  FOR v_conname IN
    SELECT conname
    FROM   pg_constraint
    WHERE  conrelid = 'enquiries'::regclass
      AND  contype  = 'c'
      AND  pg_get_constraintdef(oid) ILIKE '%course_interested%'
  LOOP
    EXECUTE format('ALTER TABLE enquiries DROP CONSTRAINT %I', v_conname);
  END LOOP;
END
$$;

ALTER TABLE enquiries
  ADD CONSTRAINT enquiries_course_interested_check
  CHECK (course_interested IN (
    'Regular Yoga',
    'Online Yoga',
    'Araiki Local',
    'Araiki Foreigner',
    'Amasana / Inner Mastery Circle',
    'TTC',
    'Free Workshop',
    'Gold''s Gym'
  ));

COMMIT;

-- ============================================================
-- ROLLBACK — run manually only if you need to undo this
-- ============================================================
--
-- DROP TABLE IF EXISTS batch_attendance;
-- DROP TABLE IF EXISTS batch_sessions;
-- DROP TABLE IF EXISTS batch_members;
-- DROP TABLE IF EXISTS batches;
--
-- -- Restore enquiries.course_interested constraint without 'Online Yoga':
-- ALTER TABLE enquiries DROP CONSTRAINT IF EXISTS enquiries_course_interested_check;
-- -- (re-add the old constraint if one existed; omit if none existed before)
