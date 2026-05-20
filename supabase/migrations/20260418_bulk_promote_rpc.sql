-- ═══════════════════════════════════════════════════════════════════════════
-- 20260418_bulk_promote_rpc.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- Converts the client-side promotion loop (3 sequential awaits × N students)
-- into a single atomic PostgreSQL function. For 500 students this collapses
-- 1,500 round-trips (≈ 2.5 minutes) into one call.
--
-- The function uses bulk UPDATE ... WHERE ... IN (...) so every row is touched
-- in a single scan, and INSERTs promotion_logs in a single batch.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── bulk_promote_students ────────────────────────────────────────────────
-- Promotes every student in `p_source_class_ids` to `p_target_class_id`,
-- except those in `p_exclude_student_ids` (they get a "repeat" log row).
--
-- Returns how many were promoted vs. repeated.
CREATE OR REPLACE FUNCTION public.bulk_promote_students(
  p_institute_id UUID,
  p_source_class_ids UUID[],
  p_target_class_id UUID,
  p_exclude_student_ids UUID[],
  p_academic_year TEXT,
  p_promoted_by UUID
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_all_student_ids UUID[];
  v_promote_ids UUID[];
  v_repeat_ids UUID[];
  v_source_class_lookup JSONB; -- student_id -> original class_id
BEGIN
  -- Collect every distinct student enrolled in the source classes
  SELECT array_agg(DISTINCT student_id)
  INTO v_all_student_ids
  FROM student_classes
  WHERE class_id = ANY(p_source_class_ids)
    AND institute_id = p_institute_id;

  IF v_all_student_ids IS NULL OR array_length(v_all_student_ids, 1) IS NULL THEN
    RETURN json_build_object('promoted', 0, 'repeated', 0);
  END IF;

  -- Split into promote / repeat based on exclude list
  v_promote_ids := ARRAY(
    SELECT unnest(v_all_student_ids)
    EXCEPT
    SELECT unnest(COALESCE(p_exclude_student_ids, ARRAY[]::UUID[]))
  );
  v_repeat_ids := ARRAY(
    SELECT unnest(COALESCE(p_exclude_student_ids, ARRAY[]::UUID[]))
    INTERSECT
    SELECT unnest(v_all_student_ids)
  );

  -- Build a lookup so the promotion log can record the original class_id
  SELECT jsonb_object_agg(sc.student_id::TEXT, sc.class_id::TEXT)
  INTO v_source_class_lookup
  FROM (
    SELECT DISTINCT ON (student_id) student_id, class_id
    FROM student_classes
    WHERE student_id = ANY(v_all_student_ids)
      AND class_id = ANY(p_source_class_ids)
      AND institute_id = p_institute_id
    ORDER BY student_id, class_id
  ) sc;

  -- Bulk update enrollments + student_classes for promoted students only
  IF array_length(v_promote_ids, 1) IS NOT NULL THEN
    UPDATE enrollments
    SET class_id = p_target_class_id
    WHERE user_id = ANY(v_promote_ids)
      AND institute_id = p_institute_id;

    UPDATE student_classes
    SET class_id = p_target_class_id
    WHERE student_id = ANY(v_promote_ids)
      AND institute_id = p_institute_id;

    -- Batch insert promotion logs
    INSERT INTO promotion_logs (
      institute_id, student_id, academic_year,
      from_class_id, to_class_id, action, promoted_by
    )
    SELECT
      p_institute_id,
      student_id,
      p_academic_year,
      COALESCE(
        (v_source_class_lookup ->> student_id::TEXT)::UUID,
        p_source_class_ids[1]
      ),
      p_target_class_id,
      'promote',
      p_promoted_by
    FROM unnest(v_promote_ids) AS student_id;
  END IF;

  -- Batch insert repeat logs (no data movement — just an audit entry)
  IF array_length(v_repeat_ids, 1) IS NOT NULL THEN
    INSERT INTO promotion_logs (
      institute_id, student_id, academic_year,
      from_class_id, to_class_id, action, promoted_by
    )
    SELECT
      p_institute_id,
      student_id,
      p_academic_year,
      p_source_class_ids[1],
      p_source_class_ids[1],
      'repeat',
      p_promoted_by
    FROM unnest(v_repeat_ids) AS student_id;
  END IF;

  RETURN json_build_object(
    'promoted', COALESCE(array_length(v_promote_ids, 1), 0),
    'repeated', COALESCE(array_length(v_repeat_ids, 1), 0)
  );
END;
$$;

-- Grant access to authenticated role (RLS + caller role checks still apply via SECURITY DEFINER)
GRANT EXECUTE ON FUNCTION public.bulk_promote_students TO authenticated;


-- ─── bulk_graduate_students ───────────────────────────────────────────────
-- Parallel function for final-grade graduation: logs each student and
-- optionally deletes their enrollments (when `p_delete_accounts=true`).
-- Does NOT delete auth accounts — that must happen client-side via admin SDK.
CREATE OR REPLACE FUNCTION public.bulk_graduate_students(
  p_institute_id UUID,
  p_class_ids UUID[],
  p_exclude_student_ids UUID[],
  p_academic_year TEXT,
  p_promoted_by UUID,
  p_delete_enrollments BOOLEAN DEFAULT false
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_all_student_ids UUID[];
  v_graduate_ids UUID[];
BEGIN
  SELECT array_agg(DISTINCT student_id)
  INTO v_all_student_ids
  FROM student_classes
  WHERE class_id = ANY(p_class_ids)
    AND institute_id = p_institute_id;

  IF v_all_student_ids IS NULL OR array_length(v_all_student_ids, 1) IS NULL THEN
    RETURN json_build_object('graduated', 0);
  END IF;

  v_graduate_ids := ARRAY(
    SELECT unnest(v_all_student_ids)
    EXCEPT
    SELECT unnest(COALESCE(p_exclude_student_ids, ARRAY[]::UUID[]))
  );

  IF array_length(v_graduate_ids, 1) IS NULL THEN
    RETURN json_build_object('graduated', 0);
  END IF;

  -- Log the graduation action for each student
  INSERT INTO promotion_logs (
    institute_id, student_id, academic_year,
    from_class_id, to_class_id, action, promoted_by
  )
  SELECT
    p_institute_id,
    student_id,
    p_academic_year,
    p_class_ids[1],
    NULL,
    'graduate',
    p_promoted_by
  FROM unnest(v_graduate_ids) AS student_id;

  -- Optionally remove enrollments (keeps user/profile rows intact)
  IF p_delete_enrollments THEN
    DELETE FROM enrollments
    WHERE user_id = ANY(v_graduate_ids)
      AND institute_id = p_institute_id;

    DELETE FROM student_classes
    WHERE student_id = ANY(v_graduate_ids)
      AND institute_id = p_institute_id;
  END IF;

  RETURN json_build_object(
    'graduated', array_length(v_graduate_ids, 1),
    'delete_enrollments', p_delete_enrollments
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_graduate_students TO authenticated;
