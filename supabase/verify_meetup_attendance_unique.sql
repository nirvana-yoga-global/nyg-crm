-- Verify the partial unique index exists on meetup_attendance.
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'meetup_attendance'
  AND indexname = 'meetup_attendance_person_unique';

-- Also confirm there are no existing duplicates that would block the index.
SELECT meetup_id, person_id, COUNT(*) AS cnt
FROM meetup_attendance
WHERE person_id IS NOT NULL
GROUP BY meetup_id, person_id
HAVING COUNT(*) > 1;
