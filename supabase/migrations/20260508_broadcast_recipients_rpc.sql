-- =============================================================================
-- Migration: 20260508_broadcast_recipients_rpc.sql
-- Purpose : Resolve the correct list of student user_ids for a teacher's
--           broadcast notification, respecting the institute *type*.
--
-- Bug fix
-- ───────
-- The teacher-home "send notification → all my students" path resolved
-- recipients by querying `teacher_assignments.class_id` only. That works for
-- institutes (معاهد) where students belong to a class/group, but it BREAKS
-- for schools (مدارس) where students belong to a (class_id, section_id)
-- tuple. A maths teacher who teaches Grade-7 Section A would broadcast to
-- Grade-7 Section B and Grade-7 Section C as well — a clear cross-section
-- leak that violates "Multi-Tenant" isolation at the section granularity.
--
-- This RPC moves recipient resolution server-side so:
--   1. Authorization is enforced once (caller must be the teacher itself
--      or an admin in the same institute).
--   2. The (class_id, section_id) tuple is honoured for schools — a student
--      is ONLY a recipient if (class_id, section_id) matches an assignment.
--   3. Institutes keep the existing class-only behaviour (section_id is
--      typically NULL there, so the tuple match degrades cleanly).
--
-- Returns one row per recipient with their user_id and institute_id, so the
-- caller can insert notifications without a second roundtrip.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.resolve_broadcast_recipients(p_teacher_id uuid)
RETURNS TABLE (user_id uuid, institute_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_role text;
  v_teacher_institute uuid;
  v_inst_type text;
BEGIN
  -- ── 1. Authorization ─────────────────────────────────────────────────────
  -- Only the teacher themselves OR an admin in the same institute may run
  -- this. Platform admin (NULL institute_id, role='admin') is also allowed.
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Find the teacher's institute (first active enrollment)
  SELECT e.institute_id INTO v_teacher_institute
  FROM enrollments e
  WHERE e.user_id = p_teacher_id
    AND e.role = 'teacher'
    AND COALESCE(e.status, 'active') = 'active'
  LIMIT 1;

  IF v_teacher_institute IS NULL THEN
    -- Teacher has no active enrollment → no recipients (don't leak)
    RETURN;
  END IF;

  -- Caller's role + institute scope
  SELECT e.role INTO v_caller_role
  FROM enrollments e
  WHERE e.user_id = v_caller
    AND COALESCE(e.status, 'active') = 'active'
    AND (
      -- Same institute as the teacher OR platform admin (NULL institute_id)
      e.institute_id = v_teacher_institute
      OR (e.institute_id IS NULL AND e.role = 'admin')
    )
  ORDER BY (e.institute_id IS NULL) ASC  -- prefer the scoped row
  LIMIT 1;

  IF v_caller != p_teacher_id
     AND COALESCE(v_caller_role, '') NOT IN ('admin', 'institute') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- ── 2. Institute type (school vs institute) ──────────────────────────────
  SELECT i.type INTO v_inst_type
  FROM institutes i
  WHERE i.id = v_teacher_institute;
  v_inst_type := COALESCE(v_inst_type, 'institute');

  -- ── 3. Resolve recipients ────────────────────────────────────────────────
  IF v_inst_type = 'school' THEN
    -- Schools: match the (class_id, section_id) tuple. A student is a
    -- recipient only if their enrollment row's (class_id, section_id) is
    -- in the teacher's assignment set. NULL section_id on an assignment
    -- means "any section in that class" — we keep that semantic so
    -- single-section grades still work. NULL class_id on an assignment
    -- means "any class in that section" (rare but possible).
    RETURN QUERY
    SELECT DISTINCT e.user_id, e.institute_id
    FROM enrollments e
    JOIN teacher_assignments ta
      ON ta.institute_id = e.institute_id
     AND (ta.class_id IS NULL OR ta.class_id = e.class_id)
     AND (ta.section_id IS NULL OR ta.section_id = e.section_id)
     AND NOT (ta.class_id IS NULL AND ta.section_id IS NULL)  -- safety: skip empty assignments
    WHERE ta.teacher_id = p_teacher_id
      AND ta.institute_id = v_teacher_institute
      AND e.institute_id = v_teacher_institute
      AND e.role = 'student'
      AND COALESCE(e.status, 'active') = 'active';
  ELSE
    -- Institutes (معاهد): match by class_id only. Students live in either
    -- the legacy student_classes table or the newer enrollments table.
    RETURN QUERY
    SELECT DISTINCT u.id, v_teacher_institute
    FROM (
      SELECT sc.student_id AS id
      FROM student_classes sc
      JOIN teacher_assignments ta
        ON ta.class_id = sc.class_id
       AND ta.institute_id = sc.institute_id
      WHERE ta.teacher_id = p_teacher_id
        AND ta.institute_id = v_teacher_institute
        AND ta.class_id IS NOT NULL
        AND sc.institute_id = v_teacher_institute
      UNION
      SELECT e.user_id AS id
      FROM enrollments e
      JOIN teacher_assignments ta
        ON ta.class_id = e.class_id
       AND ta.institute_id = e.institute_id
      WHERE ta.teacher_id = p_teacher_id
        AND ta.institute_id = v_teacher_institute
        AND ta.class_id IS NOT NULL
        AND e.institute_id = v_teacher_institute
        AND e.role = 'student'
        AND COALESCE(e.status, 'active') = 'active'
    ) u
    -- Confirm they are actually students (defensive — student_classes can
    -- legacy-hold teacher rows in some old seeds).
    JOIN users usr ON usr.id = u.id AND usr.role = 'student';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_broadcast_recipients(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.resolve_broadcast_recipients(uuid) TO authenticated;

COMMENT ON FUNCTION public.resolve_broadcast_recipients(uuid) IS
  'Returns student recipients for a teacher broadcast. Honours institute type: '
  'schools match (class_id, section_id) tuples from teacher_assignments; '
  'institutes match class_id only. SECURITY DEFINER — caller must be the '
  'teacher or a same-institute admin.';
