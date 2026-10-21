-- Fix: drop all existing RLS policies on meetup_attendance and replace
-- with a single admin-only ALL policy using the inline role check.
--
-- WHY: The original policies may have used is_admin() which is not
-- guaranteed to exist in all environments (see CLAUDE.md debugging notes).
-- When is_admin() is missing, policy creation silently fails, leaving RLS
-- enabled with no policies — which blocks every operation by default.
-- This causes markAttendance() inserts to return an RLS error that was
-- previously swallowed silently.
--
-- Run in the Supabase SQL Editor. Safe to re-run.

BEGIN;

-- Drop every existing policy on meetup_attendance dynamically.
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'meetup_attendance'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON meetup_attendance', pol.policyname);
  END LOOP;
END $$;

-- Single ALL policy: admins can SELECT / INSERT / UPDATE / DELETE.
CREATE POLICY "admin_all" ON meetup_attendance
  FOR ALL
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

COMMIT;

-- Verify: should return one row with policyname = 'admin_all'.
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'meetup_attendance';
