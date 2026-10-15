-- ============================================================
-- add_people_signup_trigger.sql
-- Idempotent. Run in Supabase SQL Editor AFTER add_people_table.sql.
--
-- Creates sync_person_from_profile(), a SECURITY DEFINER trigger
-- function that auto-creates or links a people row whenever a new
-- PWA student signs up (INSERT on profiles) or whenever a profile's
-- phone or role is updated (UPDATE OF phone, role on profiles).
--
-- Safety guarantee: the entire body is wrapped in an inner
-- BEGIN ... EXCEPTION WHEN OTHERS block. The function ALWAYS
-- returns NEW — it can never block or break a signup, even if
-- the people insert fails for any reason.
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. Trigger function
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_person_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm        text;
  v_match_count integer;
  v_person_id   uuid;
BEGIN
  -- Safety wrapper: any failure is a WARNING, never a signup blocker.
  BEGIN

    -- Only process student profiles. Admin, service, or other roles
    -- are ignored so admin creation does not pollute the people list.
    IF NEW.role IS DISTINCT FROM 'student' THEN
      RETURN NEW;
    END IF;

    -- ── Case 1: a people row is already linked to this profile ────
    -- This is the normal path after first sync; also fires on every
    -- subsequent UPDATE OF phone, role on this profile.
    SELECT id INTO v_person_id
    FROM   people
    WHERE  profile_id = NEW.id
    LIMIT  1;

    IF v_person_id IS NOT NULL THEN
      -- If the existing row has no phone yet but the profile now
      -- carries one, fill it in. This handles the common pattern of
      -- a student adding their phone after first login.
      IF NEW.phone IS NOT NULL AND NEW.phone <> '' THEN
        UPDATE people
        SET    phone            = NEW.phone,
               phone_normalized = normalize_phone(NEW.phone)
        WHERE  id               = v_person_id
          AND  (phone IS NULL OR phone = '');
      END IF;
      RETURN NEW;
    END IF;

    -- ── Case 2: no linked row yet — try to match by phone ─────────
    -- Only attempt when the phone normalises to a non-null value.
    v_norm := normalize_phone(NEW.phone);

    IF v_norm IS NOT NULL THEN
      SELECT COUNT(*) INTO v_match_count
      FROM   people
      WHERE  phone_normalized = v_norm
        AND  profile_id IS NULL;

      IF v_match_count = 1 THEN
        -- Exactly one unlinked people row shares this normalised
        -- number. Link it — do not create a duplicate.
        UPDATE people
        SET    profile_id = NEW.id
        WHERE  phone_normalized = v_norm
          AND  profile_id IS NULL;
        RETURN NEW;
      END IF;
      -- 0 matches  → fall through to Case 3 (create new row).
      -- ≥2 matches → do not guess which is correct; fall through.
    END IF;

    -- ── Case 3: create a new people row ───────────────────────────
    INSERT INTO people (full_name, phone, phone_normalized, profile_id, source)
    VALUES (
      NEW.full_name,
      NULLIF(NEW.phone, ''),
      v_norm,
      NEW.id,
      'PWA signup'
    );

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_person_from_profile failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Prevent direct invocation by app clients.
-- Triggers fire through the trigger mechanism, which does not
-- require EXECUTE privilege on the function itself.
REVOKE EXECUTE ON FUNCTION public.sync_person_from_profile() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_person_from_profile() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_person_from_profile() FROM authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2. Triggers on profiles
-- ─────────────────────────────────────────────────────────────

-- Fires when a new PWA user creates an account.
DROP TRIGGER IF EXISTS trg_sync_person_on_insert ON profiles;
CREATE TRIGGER trg_sync_person_on_insert
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_person_from_profile();

-- Fires when a student corrects their phone number, or when an
-- existing profile is promoted to the 'student' role.
DROP TRIGGER IF EXISTS trg_sync_person_on_update ON profiles;
CREATE TRIGGER trg_sync_person_on_update
  AFTER UPDATE OF phone, role ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_person_from_profile();

COMMIT;

-- ============================================================
-- ROLLBACK — run manually only if you need to remove this
-- ============================================================
--
-- DROP TRIGGER IF EXISTS trg_sync_person_on_update ON profiles;
-- DROP TRIGGER IF EXISTS trg_sync_person_on_insert ON profiles;
-- DROP FUNCTION IF EXISTS public.sync_person_from_profile();
