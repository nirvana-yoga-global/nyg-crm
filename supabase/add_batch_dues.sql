-- ============================================================
-- add_batch_dues.sql
-- Idempotent (CREATE OR REPLACE, ADD COLUMN IF NOT EXISTS,
-- CREATE UNIQUE INDEX IF NOT EXISTS).
-- Run in the Supabase SQL Editor AFTER add_yoga_batches.sql
-- and add_people_table.sql have been applied.
--
-- What this file does
-- ───────────────────
-- 1. Adds enrollments.batch_member_id  — links an enrollment to a
--    specific batch_members row.
-- 2. Adds installments.kind            — 'monthly' marks a batch
--    due auto-created by the system; NULL = old-style manual fee.
--    A partial unique index prevents duplicate monthly dues.
-- 3. create_batch_enrollment(p_batch_member_id)
--    Creates the enrollment + first monthly due for a member.
--    Idempotent: returns the existing enrollment id if one exists.
-- 4. record_batch_payment(p_installment_id, p_amount, p_paid_date,
--                         p_method, p_note)
--    Marks a pending monthly due paid and auto-schedules the next
--    month's due when the member is still active.
-- 5. set_batch_member_status(p_member_id, p_status, p_date)
--    Changes a batch member's status; prunes future pending dues on
--    pause/left; resets the cycle anchor and seeds a new due on
--    resume.
-- 6. Backfill: mirrors create_batch_enrollment logic for any
--    existing active batch_members rows (test rows only).
--
-- Status values used by these functions: 'pending', 'paid',
-- 'active', 'paused', 'left'  (all lowercase).
-- NOTE: the existing FeesTab / AddInstallmentModal components write
-- Title-case values ('Pending', 'Paid', 'Overdue') for non-batch
-- installments.  Dashboard.jsx already filters on lowercase
-- 'pending'.  Do NOT add a CHECK constraint in this migration.
--
-- Overdue is NOT stored: the app computes it as
--   status = 'pending'  AND  due_date < today (India local date).
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. New column: enrollments.batch_member_id
--    UNIQUE so each batch_member can have at most one enrollment.
--    ON DELETE RESTRICT prevents deleting a member while their
--    financial record still exists.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS batch_member_id uuid
    UNIQUE REFERENCES batch_members(id) ON DELETE RESTRICT;

-- ─────────────────────────────────────────────────────────────
-- 2. New column: installments.kind
--    NULL   = manual / old-style installment (legacy FeesTab)
--    'monthly' = batch due auto-created by create_batch_enrollment
--               or record_batch_payment
--
--    Partial unique index prevents two monthly dues landing on
--    the same (enrollment, due_date).
-- ─────────────────────────────────────────────────────────────

ALTER TABLE installments
  ADD COLUMN IF NOT EXISTS kind text;

CREATE UNIQUE INDEX IF NOT EXISTS installments_monthly_unique
  ON installments (enrollment_id, due_date)
  WHERE kind = 'monthly';

-- ─────────────────────────────────────────────────────────────
-- 3. create_batch_enrollment
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_batch_enrollment(
  p_batch_member_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrollment_id  uuid;
  v_person_id      uuid;
  v_course         text;
  v_batch_fee      numeric;
  v_start_date     date;
  v_override       numeric;
  v_amount         numeric;
BEGIN

  -- ── Admin guard ────────────────────────────────────────────
  IF (SELECT role FROM profiles WHERE id = auth.uid())
      IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Permission denied: admin role required';
  END IF;

  -- ── Idempotent: return existing enrollment id ──────────────
  SELECT id INTO v_enrollment_id
  FROM   enrollments
  WHERE  batch_member_id = p_batch_member_id;

  IF FOUND THEN
    RETURN v_enrollment_id;
  END IF;

  -- ── Load member + batch data ───────────────────────────────
  SELECT bm.person_id,
         b.course,
         b.monthly_fee,
         bm.start_date,
         bm.monthly_fee_override
  INTO   v_person_id, v_course, v_batch_fee, v_start_date, v_override
  FROM   batch_members bm
  JOIN   batches b ON b.id = bm.batch_id
  WHERE  bm.id = p_batch_member_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch member % not found', p_batch_member_id;
  END IF;

  v_amount := COALESCE(v_override, v_batch_fee);

  -- ── Create enrollment ──────────────────────────────────────
  INSERT INTO enrollments
    (person_id, course, status, fee_type, start_date,
     total_fee_agreed, batch_member_id)
  VALUES
    (v_person_id, v_course, 'active', 'Monthly', v_start_date,
     0, p_batch_member_id)
  RETURNING id INTO v_enrollment_id;

  -- ── Seed first monthly due ─────────────────────────────────
  INSERT INTO installments
    (enrollment_id, kind, status, due_date, amount)
  VALUES
    (v_enrollment_id, 'monthly', 'pending', v_start_date, v_amount);

  RETURN v_enrollment_id;

END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 4. record_batch_payment
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_batch_payment(
  p_installment_id uuid,
  p_amount         numeric,
  p_paid_date      date,
  p_method         text,
  p_note           text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst          installments%ROWTYPE;
  v_enrollment    enrollments%ROWTYPE;
  v_member_status text;
  v_override      numeric;
  v_batch_fee     numeric;
  v_n             integer;
  v_next_due      date;
  v_new_id        uuid;
  v_amount        numeric;
BEGIN

  -- ── Admin guard ────────────────────────────────────────────
  IF (SELECT role FROM profiles WHERE id = auth.uid())
      IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Permission denied: admin role required';
  END IF;

  -- ── Lock and validate installment ─────────────────────────
  SELECT * INTO v_inst
  FROM   installments
  WHERE  id = p_installment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Installment % not found', p_installment_id;
  END IF;

  IF v_inst.kind IS DISTINCT FROM 'monthly' THEN
    RAISE EXCEPTION
      'Installment % is not a monthly batch due (kind=%). '
      'Use the manual fee form for non-batch installments.',
      p_installment_id,
      COALESCE(v_inst.kind, 'null');
  END IF;

  IF v_inst.status <> 'pending' THEN
    RAISE EXCEPTION
      'Installment % is already "%" and cannot be paid again.',
      p_installment_id,
      v_inst.status;
  END IF;

  -- ── Mark paid ──────────────────────────────────────────────
  UPDATE installments
  SET    amount         = p_amount,
         paid_date      = p_paid_date,
         payment_method = p_method,
         receipt_notes  = p_note,
         status         = 'paid'
  WHERE  id = p_installment_id;

  -- ── Load enrollment and current member data ────────────────
  SELECT * INTO v_enrollment
  FROM   enrollments
  WHERE  id = v_inst.enrollment_id;

  SELECT bm.status,
         bm.monthly_fee_override,
         b.monthly_fee
  INTO   v_member_status, v_override, v_batch_fee
  FROM   batch_members bm
  JOIN   batches b ON b.id = bm.batch_id
  WHERE  bm.id = v_enrollment.batch_member_id;

  -- ── Auto-schedule next due when member is still active ─────
  -- Only creates a new due when the member is active and no
  -- pending monthly due already exists for this enrollment.
  IF v_member_status = 'active'
     AND NOT EXISTS (
       SELECT 1 FROM installments
       WHERE  enrollment_id = v_inst.enrollment_id
         AND  kind          = 'monthly'
         AND  status        = 'pending'
     )
  THEN

    -- N = count of monthly dues with due_date >= cycle anchor.
    -- The cycle anchor is enrollment.start_date (reset on resume).
    -- due_date of the next instalment = start_date + N months,
    -- keeping the day-of-month stable regardless of month length.
    SELECT COUNT(*) INTO v_n
    FROM   installments
    WHERE  enrollment_id = v_inst.enrollment_id
      AND  kind          = 'monthly'
      AND  due_date      >= v_enrollment.start_date;

    v_next_due := (v_enrollment.start_date
                   + (v_n * INTERVAL '1 month'))::date;

    v_amount := COALESCE(v_override, v_batch_fee);

    INSERT INTO installments
      (enrollment_id, kind, status, due_date, amount)
    VALUES
      (v_inst.enrollment_id, 'monthly', 'pending', v_next_due, v_amount)
    RETURNING id INTO v_new_id;

    RETURN v_new_id;

  END IF;

  RETURN NULL;

END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 5. set_batch_member_status
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_batch_member_status(
  p_member_id uuid,
  p_status    text,
  p_date      date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status    text;
  v_enrollment_id uuid;
  v_override      numeric;
  v_batch_fee     numeric;
  v_amount        numeric;
BEGIN

  -- ── Admin guard ────────────────────────────────────────────
  IF (SELECT role FROM profiles WHERE id = auth.uid())
      IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Permission denied: admin role required';
  END IF;

  -- ── Validate p_status ──────────────────────────────────────
  IF p_status NOT IN ('active', 'paused', 'left') THEN
    RAISE EXCEPTION
      'Invalid status "%". Must be active, paused, or left.',
      p_status;
  END IF;

  -- ── Lock member row; read current status ───────────────────
  SELECT status INTO v_old_status
  FROM   batch_members
  WHERE  id = p_member_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch member % not found', p_member_id;
  END IF;

  -- ── Update member ──────────────────────────────────────────
  IF p_status = 'left' THEN
    UPDATE batch_members
    SET    status   = 'left',
           end_date = p_date
    WHERE  id = p_member_id;
  ELSE
    UPDATE batch_members
    SET    status = p_status
    WHERE  id = p_member_id;
  END IF;

  -- ── Enrollment operations (skip if no enrollment yet) ──────
  SELECT id INTO v_enrollment_id
  FROM   enrollments
  WHERE  batch_member_id = p_member_id;

  IF v_enrollment_id IS NOT NULL THEN

    -- On pause or left: delete future pending monthly dues.
    -- Dues with due_date <= p_date are already owed; keep them.
    IF p_status IN ('paused', 'left') THEN
      DELETE FROM installments
      WHERE  enrollment_id = v_enrollment_id
        AND  kind          = 'monthly'
        AND  status        = 'pending'
        AND  due_date      > p_date;
    END IF;

    -- On resume (paused → active):
    -- • Reset cycle anchor to the resume date so month
    --   numbers do not drift.
    -- • Create the first due of the new cycle if none exists.
    IF p_status = 'active' AND v_old_status = 'paused' THEN

      UPDATE enrollments
      SET    start_date = p_date
      WHERE  id = v_enrollment_id;

      IF NOT EXISTS (
        SELECT 1 FROM installments
        WHERE  enrollment_id = v_enrollment_id
          AND  kind          = 'monthly'
          AND  status        = 'pending'
      ) THEN
        SELECT bm.monthly_fee_override,
               b.monthly_fee
        INTO   v_override, v_batch_fee
        FROM   batch_members bm
        JOIN   batches b ON b.id = bm.batch_id
        WHERE  bm.id = p_member_id;

        v_amount := COALESCE(v_override, v_batch_fee);

        INSERT INTO installments
          (enrollment_id, kind, status, due_date, amount)
        VALUES
          (v_enrollment_id, 'monthly', 'pending', p_date, v_amount);
      END IF;

    END IF;

  END IF;

END;
$$;

-- ─────────────────────────────────────────────────────────────
-- Permissions
-- ─────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.create_batch_enrollment(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_batch_enrollment(uuid)
  FROM anon;
GRANT  EXECUTE ON FUNCTION public.create_batch_enrollment(uuid)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION
  public.record_batch_payment(uuid, numeric, date, text, text)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION
  public.record_batch_payment(uuid, numeric, date, text, text)
  FROM anon;
GRANT  EXECUTE ON FUNCTION
  public.record_batch_payment(uuid, numeric, date, text, text)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION
  public.set_batch_member_status(uuid, text, date)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION
  public.set_batch_member_status(uuid, text, date)
  FROM anon;
GRANT  EXECUTE ON FUNCTION
  public.set_batch_member_status(uuid, text, date)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 6. Backfill existing active batch_members rows.
--    NOTE: These are test rows only. In production the
--    batch_members table will be empty at migration time, so
--    this loop is a no-op. The logic below mirrors
--    create_batch_enrollment exactly but runs without a session
--    (auth.uid() = NULL in a migration DO block), so we cannot
--    call the function directly.
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  r              RECORD;
  v_enrollment_id uuid;
  v_amount       numeric;
BEGIN
  FOR r IN
    SELECT bm.id          AS member_id,
           bm.person_id,
           bm.start_date,
           bm.monthly_fee_override,
           b.course,
           b.monthly_fee  AS batch_fee
    FROM   batch_members bm
    JOIN   batches b ON b.id = bm.batch_id
    WHERE  bm.status = 'active'
  LOOP
    -- Skip if already backfilled (idempotent)
    IF EXISTS (
      SELECT 1 FROM enrollments WHERE batch_member_id = r.member_id
    ) THEN
      CONTINUE;
    END IF;

    v_amount := COALESCE(r.monthly_fee_override, r.batch_fee);

    INSERT INTO enrollments
      (person_id, course, status, fee_type, start_date,
       total_fee_agreed, batch_member_id)
    VALUES
      (r.person_id, r.course, 'active', 'Monthly', r.start_date,
       0, r.member_id)
    RETURNING id INTO v_enrollment_id;

    INSERT INTO installments
      (enrollment_id, kind, status, due_date, amount)
    VALUES
      (v_enrollment_id, 'monthly', 'pending', r.start_date, v_amount);

  END LOOP;
END;
$$;

COMMIT;

-- ============================================================
-- ROLLBACK — run manually only if you need to undo this
-- ============================================================
--
-- DROP FUNCTION IF EXISTS public.set_batch_member_status(uuid, text, date);
-- DROP FUNCTION IF EXISTS public.record_batch_payment(uuid, numeric, date, text, text);
-- DROP FUNCTION IF EXISTS public.create_batch_enrollment(uuid);
--
-- DROP INDEX IF EXISTS installments_monthly_unique;
-- ALTER TABLE installments   DROP COLUMN IF EXISTS kind;
-- ALTER TABLE enrollments    DROP COLUMN IF EXISTS batch_member_id;
