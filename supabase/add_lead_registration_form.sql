-- ============================================================
-- add_lead_registration_form.sql
-- 1. Adds enquiry_id to intake_forms (uuid, references enquiries)
-- 2. Adds new form columns (venue, symptoms, treatment_details,
--    present_state, cigarettes_per_day, drug_use, photo_path)
-- 3. Creates private storage bucket "registration-photos" with
--    admin-only policies
-- ============================================================

-- ── 1. Link intake_forms to enquiries ─────────────────────────
--
-- enquiries.id is uuid (same type used for all PKs in this schema).
-- student_profile_id has no NOT NULL constraint — already nullable.

ALTER TABLE intake_forms
  ADD COLUMN IF NOT EXISTS enquiry_id uuid REFERENCES enquiries(id) ON DELETE CASCADE;

-- Enforce: every row must belong to a lead OR a student (or both).
-- Safe for existing rows because they already have student_profile_id set.
ALTER TABLE intake_forms
  DROP CONSTRAINT IF EXISTS intake_forms_has_owner;

ALTER TABLE intake_forms
  ADD CONSTRAINT intake_forms_has_owner
  CHECK (enquiry_id IS NOT NULL OR student_profile_id IS NOT NULL);

-- One form per lead. Partial index excludes nulls so student rows are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS intake_forms_enquiry_id_unique
  ON intake_forms (enquiry_id)
  WHERE enquiry_id IS NOT NULL;

-- ── 2. New form columns ────────────────────────────────────────

ALTER TABLE intake_forms
  ADD COLUMN IF NOT EXISTS venue               text,    -- Program section: venue/location
  ADD COLUMN IF NOT EXISTS symptoms            text,    -- Health section: current symptoms
  ADD COLUMN IF NOT EXISTS treatment_details   text,    -- Health section: treatments undergone & medicines taken
  ADD COLUMN IF NOT EXISTS present_state       text,    -- Health section: current condition / present state
  ADD COLUMN IF NOT EXISTS cigarettes_per_day  integer, -- Lifestyle: cigarettes per day (null = non-smoker)
  ADD COLUMN IF NOT EXISTS drug_use            text,    -- Lifestyle: drug use details
  ADD COLUMN IF NOT EXISTS photo_path          text;    -- Passport photo: storage path in registration-photos bucket

-- ── 3. Private storage bucket for passport photos ─────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('registration-photos', 'registration-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Drop before recreating so this script is safe to re-run
DROP POLICY IF EXISTS "Admin can select registration photos"  ON storage.objects;
DROP POLICY IF EXISTS "Admin can insert registration photos"  ON storage.objects;
DROP POLICY IF EXISTS "Admin can update registration photos"  ON storage.objects;
DROP POLICY IF EXISTS "Admin can delete registration photos"  ON storage.objects;

-- Only admins can read photos
CREATE POLICY "Admin can select registration photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'registration-photos'
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- Only admins can upload photos
CREATE POLICY "Admin can insert registration photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'registration-photos'
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- Only admins can replace photos
CREATE POLICY "Admin can update registration photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'registration-photos'
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    bucket_id = 'registration-photos'
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- Only admins can delete photos
CREATE POLICY "Admin can delete registration photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'registration-photos'
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );
