-- ============================================================
-- add_enrol_lead_function.sql
-- Idempotent (CREATE OR REPLACE). Run in the Supabase SQL Editor
-- AFTER add_people_table.sql has been applied.
--
-- Provides:
--   public.enrol_lead_as_person(p_enquiry_id uuid) → uuid
--
-- Call from the app via:
--   supabase.rpc('enrol_lead_as_person', { p_enquiry_id: '...' })
--
-- Return value: the people.id of the linked or newly created person.
--
-- Error codes the caller must handle:
--   'Permission denied: admin role required'
--     → caller is not an admin
--   'Enquiry <uuid> not found'
--     → p_enquiry_id does not exist in enquiries
--   'MULTIPLE_MATCHES: Name A (uuid1), Name B (uuid2), ...'
--     → more than one people row shares the normalised phone;
--       the caller should display the list, let the admin pick,
--       then either (a) set enquiries.person_id to the chosen uuid
--       and call this function again, or (b) add an overload.
--       Parsing hint for JavaScript:
--         /(.+?)\s\(([0-9a-f-]{36})\)/g  → [{name, id}, ...]
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- Function
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enrol_lead_as_person(p_enquiry_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enquiry     enquiries%ROWTYPE;
  v_person_id   uuid;
  v_norm        text;
  v_match_count integer;
  v_match_list  text;
BEGIN

  -- ── 1. Admin check ─────────────────────────────────────────────
  IF (SELECT role FROM profiles WHERE id = auth.uid()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Permission denied: admin role required';
  END IF;

  -- ── 2. Load enquiry ────────────────────────────────────────────
  SELECT * INTO v_enquiry FROM enquiries WHERE id = p_enquiry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enquiry % not found', p_enquiry_id;
  END IF;

  -- ── 3. Resolve person ──────────────────────────────────────────
  -- When person_id is already set we skip find/create but still
  -- run the form-move step (4) below.

  IF v_enquiry.person_id IS NOT NULL THEN

    v_person_id := v_enquiry.person_id;
    -- Ensure enrolled (idempotent — no-op if already enrolled).
    UPDATE enquiries SET status = 'enrolled' WHERE id = p_enquiry_id;

  ELSE

    -- Try to find a matching person by normalised phone.
    v_norm := normalize_phone(v_enquiry.phone);

    IF v_norm IS NOT NULL THEN
      SELECT COUNT(*) INTO v_match_count
      FROM   people
      WHERE  phone_normalized = v_norm;

      IF v_match_count > 1 THEN
        -- Build a human-readable list so the caller can show a picker.
        -- Format per entry:  Full Name (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
        SELECT string_agg(full_name || ' (' || id::text || ')', ', ' ORDER BY full_name)
        INTO   v_match_list
        FROM   people
        WHERE  phone_normalized = v_norm;

        RAISE EXCEPTION 'MULTIPLE_MATCHES: %', v_match_list
          USING DETAIL = v_match_list;
      END IF;

      IF v_match_count = 1 THEN
        SELECT id INTO v_person_id
        FROM   people
        WHERE  phone_normalized = v_norm;
      END IF;
      -- 0 matches: v_person_id stays NULL; fall through to INSERT below.
    END IF;

    IF v_person_id IS NULL THEN
      -- No matching person found, or phone could not be normalised.
      -- Create a new people row from the enquiry fields.
      INSERT INTO people (full_name, phone, phone_normalized, email, location, source)
      VALUES (
        v_enquiry.name,
        NULLIF(v_enquiry.phone,    ''),
        v_norm,
        NULLIF(v_enquiry.email,    ''),
        NULLIF(v_enquiry.location, ''),
        COALESCE('Lead: ' || NULLIF(v_enquiry.source, ''), 'Lead')
      )
      RETURNING id INTO v_person_id;
    END IF;

    -- Link the enquiry to the resolved/created person and mark enrolled.
    UPDATE enquiries
    SET    person_id = v_person_id,
           status    = 'enrolled'
    WHERE  id = p_enquiry_id;

  END IF;

  -- ── 4. Form-move (always runs, even when person_id was already set) ──
  -- For the intake_form attached to this enquiry:
  --   • Set person_id if the form has none yet (links form to People profile).
  --   • Keep enquiry_id intact so the Leads "Filled" badge still fires.
  -- Skip silently (NOTICE) if the person already owns a different form
  -- (unique partial index on person_id would block the UPDATE anyway).

  IF EXISTS (
    SELECT 1 FROM intake_forms WHERE person_id = v_person_id
  ) THEN
    RAISE NOTICE
      'Person % already has a registration form; lead form kept enquiry-linked only',
      v_person_id;
  ELSE
    UPDATE intake_forms
    SET    person_id = v_person_id
    WHERE  enquiry_id  = p_enquiry_id
      AND  person_id  IS NULL;
  END IF;

  RETURN v_person_id;

END;
$$;

-- ─────────────────────────────────────────────────────────────
-- Permissions
-- Unauthenticated and anon callers cannot invoke the function.
-- Authenticated callers can; the function enforces admin-only
-- inside its body via the inline role check.
-- ─────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.enrol_lead_as_person(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enrol_lead_as_person(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.enrol_lead_as_person(uuid) TO authenticated;

COMMIT;

-- ============================================================
-- ROLLBACK — run manually only if you need to remove this
-- ============================================================
--
-- DROP FUNCTION IF EXISTS public.enrol_lead_as_person(uuid);
