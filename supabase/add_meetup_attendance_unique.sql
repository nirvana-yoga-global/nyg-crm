-- Unique index: each person can only be marked once per meetup.
-- Partial so NULL person_id rows (legacy manual entries) are unrestricted.
-- Idempotent: safe to run twice.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS meetup_attendance_person_unique
  ON meetup_attendance (meetup_id, person_id)
  WHERE person_id IS NOT NULL;

COMMIT;
