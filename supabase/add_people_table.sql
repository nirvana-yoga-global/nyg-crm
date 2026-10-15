-- ============================================================
-- add_people_table.sql
-- Idempotent. Wrapped in a single transaction.
-- Run in Supabase SQL Editor AFTER preview_people_backfill.sql
-- confirms the numbers look right.
-- ============================================================
--
-- ⚠️  ARAIKI / PWA WARNING
-- araiki_attunements currently has RLS ON with ZERO policies, so
-- all reads return empty and inserts fail silently. This file adds
-- an admin-only policy, which fixes the CRM but will also block
-- NYG Connect PWA students from reading their own attunement rows.
-- Before you go live with PWA Araiki features, add a student
-- self-read policy such as:
--   CREATE POLICY "Student reads own attunements"
--     ON araiki_attunements FOR SELECT TO authenticated
--     USING (student_profile_id = auth.uid()
--            OR person_id IN (
--               SELECT id FROM people WHERE profile_id = auth.uid()));
-- The same applies to student_notes (but students should NOT read
-- those — admin-only is intentional there).
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 0. normalize_phone(text) → text
--    Rules (applied in order after stripping non-digits and
--    removing a leading "00" international exit code):
--      • empty / null           → NULL
--      • 10 digits starting 6-9 → prepend 91 (Indian mobile)
--      • 11 digits starting 0   → strip leading 0, prepend 91
--        (STD prefix before a mobile number)
--      • 12 digits starting 91  → already normalised, keep
--      • anything else          → keep the digits as-is
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION normalize_phone(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  WITH
    -- 1. strip all non-digit characters
    digits AS (
      SELECT regexp_replace(coalesce(raw, ''), '[^0-9]', '', 'g') AS v
    ),
    -- 2. strip a single leading "00" (international exit code)
    stripped AS (
      SELECT
        CASE WHEN v LIKE '00%' THEN substring(v FROM 3) ELSE v END AS v
      FROM digits
    )
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

-- ─────────────────────────────────────────────────────────────
-- 1. people table
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS people (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name        text        NOT NULL,
  phone            text,                           -- raw as entered
  phone_normalized text,                           -- output of normalize_phone()
  email            text,
  location         text,
  source           text,
  notes            text,
  -- nullable link to a PWA account; one person per profile at most
  profile_id       uuid        UNIQUE REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Non-unique: families can share a number
CREATE INDEX IF NOT EXISTS people_phone_normalized_idx ON people (phone_normalized);

-- updated_at trigger
CREATE OR REPLACE FUNCTION _trg_people_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_people_updated_at ON people;
CREATE TRIGGER trg_people_updated_at
  BEFORE UPDATE ON people
  FOR EACH ROW EXECUTE FUNCTION _trg_people_updated_at();

ALTER TABLE people ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access on people" ON people;
CREATE POLICY "Admin full access on people"
  ON people FOR ALL TO authenticated
  USING  ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- ─────────────────────────────────────────────────────────────
-- 2. Add person_id to the seven tables
--    ON DELETE RESTRICT  : enrollments (financial records must not
--                          vanish when a person is deleted)
--    ON DELETE CASCADE   : everything else (attunements, notes,
--                          forms, entries, attendance, enquiries)
--    student_profile_id and enquiry_id are NOT touched.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE enquiries
  ADD COLUMN IF NOT EXISTS person_id uuid
    REFERENCES people(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_enquiries_person_id
  ON enquiries (person_id);

ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS person_id uuid
    REFERENCES people(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_enrollments_person_id
  ON enrollments (person_id);

ALTER TABLE intake_forms
  ADD COLUMN IF NOT EXISTS person_id uuid
    REFERENCES people(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_intake_forms_person_id
  ON intake_forms (person_id);

ALTER TABLE araiki_attunements
  ADD COLUMN IF NOT EXISTS person_id uuid
    REFERENCES people(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_araiki_attunements_person_id
  ON araiki_attunements (person_id);

ALTER TABLE progress_entries
  ADD COLUMN IF NOT EXISTS person_id uuid
    REFERENCES people(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_progress_entries_person_id
  ON progress_entries (person_id);

ALTER TABLE student_notes
  ADD COLUMN IF NOT EXISTS person_id uuid
    REFERENCES people(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_student_notes_person_id
  ON student_notes (person_id);

ALTER TABLE meetup_attendance
  ADD COLUMN IF NOT EXISTS person_id uuid
    REFERENCES people(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_meetup_attendance_person_id
  ON meetup_attendance (person_id);

-- ─────────────────────────────────────────────────────────────
-- 3. Update intake_forms CHECK: any one of the three owner
--    columns satisfies the constraint.
--    Drop-and-recreate is idempotent; IF NOT EXISTS is
--    unavailable for CHECK constraints, so we always drop first.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE intake_forms
  DROP CONSTRAINT IF EXISTS intake_forms_has_owner;

ALTER TABLE intake_forms
  ADD CONSTRAINT intake_forms_has_owner
  CHECK (
    enquiry_id        IS NOT NULL OR
    student_profile_id IS NOT NULL OR
    person_id         IS NOT NULL
  );

-- One intake form per person (people without a form have no row)
CREATE UNIQUE INDEX IF NOT EXISTS idx_intake_forms_person_id_unique
  ON intake_forms (person_id)
  WHERE person_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 4. RLS policies for the four tables that have ZERO policies.
--    Using the inline role check (not is_admin()) throughout.
-- ─────────────────────────────────────────────────────────────

-- enrollments
DROP POLICY IF EXISTS "Admin full access on enrollments" ON enrollments;
CREATE POLICY "Admin full access on enrollments"
  ON enrollments FOR ALL TO authenticated
  USING  ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- installments
DROP POLICY IF EXISTS "Admin full access on installments" ON installments;
CREATE POLICY "Admin full access on installments"
  ON installments FOR ALL TO authenticated
  USING  ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- araiki_attunements  ← see PWA warning at top of file
DROP POLICY IF EXISTS "Admin full access on araiki_attunements" ON araiki_attunements;
CREATE POLICY "Admin full access on araiki_attunements"
  ON araiki_attunements FOR ALL TO authenticated
  USING  ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- student_notes  ← admin-only is intentional; students must not read these
DROP POLICY IF EXISTS "Admin full access on student_notes" ON student_notes;
CREATE POLICY "Admin full access on student_notes"
  ON student_notes FOR ALL TO authenticated
  USING  ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- ─────────────────────────────────────────────────────────────
-- 5. Backfill
--    Order matters: a → c (match then create) → d
--    Rule b (students with no profile_id) was dropped: live data
--    shows those rows are test entries (chandu sreerag, Spiderman,
--    sreerag). The students table is left untouched.
-- ─────────────────────────────────────────────────────────────

-- ── 5a. One person per student profile ──────────────────────
--   Source: every profiles row with role = 'student'.
--   Name: students.name first, then profiles.full_name.
--   Phone: students.phone first, then profiles.phone.
--   ON CONFLICT (profile_id) DO NOTHING makes it safe to re-run.

INSERT INTO people (
  full_name, phone, phone_normalized, email, location, source,
  profile_id, created_at, updated_at
)
SELECT
  COALESCE(s.name, pr.full_name)                              AS full_name,
  COALESCE(s.phone, pr.phone)                                 AS phone,
  normalize_phone(COALESCE(s.phone, pr.phone))                AS phone_normalized,
  COALESCE(s.email, NULL)                                     AS email,
  NULL                                                        AS location,
  NULL                                                        AS source,
  pr.id                                                       AS profile_id,
  now(), now()
FROM profiles pr
LEFT JOIN students s ON s.profile_id = pr.id
WHERE pr.role = 'student'
ON CONFLICT (profile_id) DO NOTHING;

-- ── 5c. Enrolled enquiries ───────────────────────────────────
--   Pass 1: match to an existing person by phone_normalized.
--   Pass 2: create a new person for the rest, linking in one CTE.

-- 5c-1 match
UPDATE enquiries e
SET    person_id = p.id
FROM   people p
WHERE  e.status   = 'enrolled'
  AND  e.person_id IS NULL
  AND  normalize_phone(e.phone) IS NOT NULL
  AND  p.phone_normalized = normalize_phone(e.phone);

-- 5c-2 create + link (one CTE, no risk of mis-matching)
WITH new_people AS (
  INSERT INTO people (
    full_name, phone, phone_normalized, email, location, source,
    created_at, updated_at
  )
  SELECT DISTINCT ON (normalize_phone(e.phone), e.name)
    e.name,
    e.phone,
    normalize_phone(e.phone),
    e.email,
    e.location,
    e.source,
    now(), now()
  FROM enquiries e
  WHERE e.status    = 'enrolled'
    AND e.person_id IS NULL
  RETURNING id, phone_normalized, full_name
)
UPDATE enquiries e
SET    person_id = np.id
FROM   new_people np
WHERE  e.status    = 'enrolled'
  AND  e.person_id IS NULL
  AND  normalize_phone(e.phone) = np.phone_normalized
  AND  e.name                   = np.full_name;

-- ── 5d. Fill person_id on child tables ──────────────────────
--   Primary source: people.profile_id = table.student_profile_id
--   Secondary (intake_forms only): enquiries.person_id

UPDATE enrollments t
SET    person_id = p.id
FROM   people p
WHERE  p.profile_id         = t.student_profile_id
  AND  t.student_profile_id IS NOT NULL
  AND  t.person_id          IS NULL;

UPDATE araiki_attunements t
SET    person_id = p.id
FROM   people p
WHERE  p.profile_id         = t.student_profile_id
  AND  t.student_profile_id IS NOT NULL
  AND  t.person_id          IS NULL;

UPDATE progress_entries t
SET    person_id = p.id
FROM   people p
WHERE  p.profile_id         = t.student_profile_id
  AND  t.student_profile_id IS NOT NULL
  AND  t.person_id          IS NULL;

UPDATE student_notes t
SET    person_id = p.id
FROM   people p
WHERE  p.profile_id         = t.student_profile_id
  AND  t.student_profile_id IS NOT NULL
  AND  t.person_id          IS NULL;

UPDATE meetup_attendance t
SET    person_id = p.id
FROM   people p
WHERE  p.profile_id         = t.student_profile_id
  AND  t.student_profile_id IS NOT NULL
  AND  t.person_id          IS NULL;

-- intake_forms: via student_profile_id
UPDATE intake_forms t
SET    person_id = p.id
FROM   people p
WHERE  p.profile_id         = t.student_profile_id
  AND  t.student_profile_id IS NOT NULL
  AND  t.person_id          IS NULL;

-- intake_forms: via enquiry_id (lead-linked forms whose enquiry
-- now has a person from step 5c)
UPDATE intake_forms t
SET    person_id = e.person_id
FROM   enquiries e
WHERE  e.id          = t.enquiry_id
  AND  t.person_id   IS NULL
  AND  e.person_id   IS NOT NULL;

-- enquiries: back-fill from intake_forms that carry a
-- student_profile_id (covers enquiries not status='enrolled'
-- that were nonetheless linked to a form filled by a student)
UPDATE enquiries e
SET    person_id = p.id
FROM   intake_forms i
JOIN   people p ON p.profile_id = i.student_profile_id
WHERE  i.enquiry_id            = e.id
  AND  e.person_id             IS NULL
  AND  i.student_profile_id    IS NOT NULL;

COMMIT;
