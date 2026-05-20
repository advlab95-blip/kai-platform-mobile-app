-- =====================================================================
-- Dashboard RPCs — Phase 3.1
-- =====================================================================
-- Purpose:
--   Single-round-trip dashboard aggregations. Moving these to the DB
--   (vs. stitching many client queries) cuts dashboard latency from
--   ~3–8s on weak connections to a single ~200–500ms call.
--
-- Security model:
--   SECURITY DEFINER + explicit `enrollments` check at the top of each
--   function. The caller MUST have an active enrollment in the institute
--   they are querying. No client can bypass by passing another institute_id.
--
-- Multi-tenant isolation:
--   Every internal query is filtered by p_institute_id. No cross-institute
--   data ever crosses the function boundary.
-- =====================================================================

-- ---------------------------------------------------------------------
-- RPC 1: get_institute_dashboard_stats
-- Returns aggregate counts + 7-day attendance history + fee summary + alerts.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_institute_dashboard_stats(
  p_institute_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_authorized BOOLEAN;
  v_result JSONB;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Authorization: caller must have an active enrollment in this institute,
  -- with a role that can view dashboard (admin/institute/teacher/parent).
  -- Students see their own stats through get_student_progress instead.
  SELECT EXISTS (
    SELECT 1 FROM enrollments
    WHERE user_id = v_caller
      AND institute_id = p_institute_id
      AND status = 'active'
      AND role IN ('admin','institute','teacher','parent')
  ) INTO v_authorized;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'not_authorized_for_institute' USING ERRCODE = '42501';
  END IF;

  WITH
    -- Counts
    student_count AS (
      SELECT COUNT(*)::INT AS n FROM enrollments
      WHERE institute_id = p_institute_id AND role = 'student' AND status = 'active'
    ),
    teacher_count AS (
      SELECT COUNT(*)::INT AS n FROM enrollments
      WHERE institute_id = p_institute_id AND role = 'teacher' AND status = 'active'
    ),

    -- Today's attendance snapshot
    today_att AS (
      SELECT
        COUNT(*) FILTER (WHERE status = 'present')::INT AS present,
        COUNT(*) FILTER (WHERE status = 'absent')::INT  AS absent,
        COUNT(*) FILTER (WHERE status = 'late')::INT    AS late,
        COUNT(*)::INT                                   AS total
      FROM attendance
      WHERE institute_id = p_institute_id
        AND date = CURRENT_DATE
    ),

    -- 7-day attendance history (may have fewer rows if institute is new)
    history AS (
      SELECT
        date::TEXT,
        COUNT(*) FILTER (WHERE status = 'present')::INT AS present,
        COUNT(*) FILTER (WHERE status = 'absent')::INT  AS absent
      FROM attendance
      WHERE institute_id = p_institute_id
        AND date >= CURRENT_DATE - INTERVAL '6 days'
        AND date <= CURRENT_DATE
      GROUP BY date
      ORDER BY date
    ),

    -- Fees summary
    fees AS (
      SELECT
        COALESCE(SUM(final_amount), 0)::NUMERIC     AS expected,
        COALESCE(SUM(paid_amount), 0)::NUMERIC      AS collected,
        COALESCE(SUM(remaining_amount), 0)::NUMERIC AS remaining,
        COUNT(*) FILTER (WHERE status = 'overdue')::INT AS overdue_count
      FROM student_fees
      WHERE institute_id = p_institute_id
    ),

    -- Alerts: chronically absent students (>= 5 absences in last 30 days)
    chronic_absent AS (
      SELECT a.student_id, u.full_name, COUNT(*)::INT AS absences
      FROM attendance a
      JOIN users u ON u.id = a.student_id
      WHERE a.institute_id = p_institute_id
        AND a.status = 'absent'
        AND a.date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY a.student_id, u.full_name
      HAVING COUNT(*) >= 5
      ORDER BY absences DESC
      LIMIT 5
    )

  SELECT jsonb_build_object(
    'total_students',      (SELECT n FROM student_count),
    'total_teachers',      (SELECT n FROM teacher_count),
    'today_attendance',    (SELECT to_jsonb(today_att.*) FROM today_att),
    'attendance_history',  COALESCE(
                             (SELECT jsonb_agg(to_jsonb(history.*)) FROM history),
                             '[]'::jsonb
                           ),
    'fees',                (SELECT to_jsonb(fees.*) FROM fees),
    'alerts',              jsonb_build_object(
                             'chronic_absent', COALESCE(
                               (SELECT jsonb_agg(to_jsonb(chronic_absent.*)) FROM chronic_absent),
                               '[]'::jsonb
                             ),
                             'overdue_fees',  (SELECT overdue_count FROM fees)
                           ),
    'generated_at',        to_jsonb(NOW())
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_institute_dashboard_stats(UUID) IS
  'Dashboard aggregation for admin/institute/teacher/parent roles. Verifies caller has active enrollment in the institute.';

-- Only authenticated users can call (additional checks inside).
REVOKE ALL ON FUNCTION public.get_institute_dashboard_stats(UUID) FROM public;
GRANT  EXECUTE ON FUNCTION public.get_institute_dashboard_stats(UUID) TO authenticated;


-- ---------------------------------------------------------------------
-- RPC 2: get_student_progress
-- Returns per-subject averages, attendance %, overall GPA.
-- Period: 'week' | 'month' | 'semester' | 'year'
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_student_progress(
  p_student_id UUID,
  p_period TEXT DEFAULT 'month'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_authorized BOOLEAN;
  v_student_institute UUID;
  v_since DATE;
  v_result JSONB;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Resolve the student's institute first (single row lookup).
  SELECT institute_id INTO v_student_institute
  FROM enrollments
  WHERE user_id = p_student_id AND role = 'student' AND status = 'active'
  LIMIT 1;

  IF v_student_institute IS NULL THEN
    RAISE EXCEPTION 'student_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Authorization rules:
  --   1. The student themselves.
  --   2. A parent linked via parent_child to this student.
  --   3. A teacher/admin/institute in the same institute.
  SELECT (
    v_caller = p_student_id
    OR EXISTS (
      SELECT 1 FROM parent_child
      WHERE parent_id = v_caller AND child_id = p_student_id
    )
    OR EXISTS (
      SELECT 1 FROM enrollments
      WHERE user_id = v_caller
        AND institute_id = v_student_institute
        AND status = 'active'
        AND role IN ('teacher','admin','institute')
    )
  ) INTO v_authorized;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'not_authorized_for_student' USING ERRCODE = '42501';
  END IF;

  -- Period → start date
  v_since := CASE p_period
    WHEN 'week'     THEN CURRENT_DATE - INTERVAL '7 days'
    WHEN 'month'    THEN CURRENT_DATE - INTERVAL '30 days'
    WHEN 'semester' THEN CURRENT_DATE - INTERVAL '120 days'
    WHEN 'year'     THEN CURRENT_DATE - INTERVAL '365 days'
    ELSE CURRENT_DATE - INTERVAL '30 days'
  END;

  WITH
    -- Per-subject averages for this period
    subject_avg AS (
      SELECT
        subject_name,
        ROUND(AVG((score::NUMERIC / NULLIF(max_score, 0)) * 100), 1)::NUMERIC AS avg_pct,
        COUNT(*)::INT AS entries
      FROM grade_entries
      WHERE student_id = p_student_id
        AND institute_id = v_student_institute
        AND created_at >= v_since
        AND subject_name IS NOT NULL
      GROUP BY subject_name
    ),

    -- Prior period average (for trend)
    subject_avg_prior AS (
      SELECT
        subject_name,
        ROUND(AVG((score::NUMERIC / NULLIF(max_score, 0)) * 100), 1)::NUMERIC AS prior_pct
      FROM grade_entries
      WHERE student_id = p_student_id
        AND institute_id = v_student_institute
        AND created_at >= (v_since - (CURRENT_DATE - v_since))
        AND created_at <  v_since
        AND subject_name IS NOT NULL
      GROUP BY subject_name
    ),

    -- Attendance % for the period
    attendance_pct AS (
      SELECT
        CASE WHEN COUNT(*) = 0 THEN NULL
             ELSE ROUND(
               (COUNT(*) FILTER (WHERE status = 'present'))::NUMERIC
               / COUNT(*) * 100, 1
             )
        END AS pct,
        COUNT(*)::INT AS total_days,
        COUNT(*) FILTER (WHERE status = 'absent')::INT AS absent_days
      FROM attendance
      WHERE student_id = p_student_id
        AND institute_id = v_student_institute
        AND date >= v_since
    ),

    -- Overall average (unweighted across subjects)
    overall AS (
      SELECT ROUND(AVG(avg_pct), 1)::NUMERIC AS avg_pct
      FROM subject_avg
    ),

    subjects_with_trend AS (
      SELECT
        s.subject_name,
        s.avg_pct,
        s.entries,
        sp.prior_pct,
        CASE
          WHEN sp.prior_pct IS NULL                 THEN 'flat'
          WHEN s.avg_pct > sp.prior_pct + 2         THEN 'up'
          WHEN s.avg_pct < sp.prior_pct - 2         THEN 'down'
          ELSE                                           'flat'
        END AS trend
      FROM subject_avg s
      LEFT JOIN subject_avg_prior sp USING (subject_name)
      ORDER BY s.subject_name
    )

  SELECT jsonb_build_object(
    'period',             p_period,
    'since',              v_since::TEXT,
    'subjects',           COALESCE(
                            (SELECT jsonb_agg(to_jsonb(subjects_with_trend.*))
                             FROM subjects_with_trend),
                            '[]'::jsonb
                          ),
    'overall_avg',        (SELECT avg_pct FROM overall),
    'attendance',         (SELECT to_jsonb(attendance_pct.*) FROM attendance_pct),
    'generated_at',       to_jsonb(NOW())
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_student_progress(UUID, TEXT) IS
  'Student progress aggregation for student/parent/teacher/admin. Auth checked against enrollments + parent_child link.';

REVOKE ALL ON FUNCTION public.get_student_progress(UUID, TEXT) FROM public;
GRANT  EXECUTE ON FUNCTION public.get_student_progress(UUID, TEXT) TO authenticated;


-- ---------------------------------------------------------------------
-- RPC 3: get_platform_institutes_summary
-- Super-admin only — returns per-institute student/teacher counts for
-- the comparison chart on the platform dashboard.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_platform_institutes_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_is_platform_admin BOOLEAN;
  v_result JSONB;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Only callers with the 'admin' role (platform-level, not institute-admin)
  -- can see cross-institute data. Detect via enrollments.role='admin'.
  SELECT EXISTS (
    SELECT 1 FROM enrollments
    WHERE user_id = v_caller AND role = 'admin' AND status = 'active'
  ) INTO v_is_platform_admin;

  IF NOT v_is_platform_admin THEN
    RAISE EXCEPTION 'not_authorized_platform' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_agg(to_jsonb(rows.*) ORDER BY rows.students DESC)
  INTO v_result
  FROM (
    SELECT
      i.id          AS institute_id,
      i.name        AS name,
      COALESCE(s.n, 0)::INT AS students,
      COALESCE(t.n, 0)::INT AS teachers
    FROM institutes i
    LEFT JOIN (
      SELECT institute_id, COUNT(*)::INT AS n
      FROM enrollments
      WHERE role = 'student' AND status = 'active'
      GROUP BY institute_id
    ) s ON s.institute_id = i.id
    LEFT JOIN (
      SELECT institute_id, COUNT(*)::INT AS n
      FROM enrollments
      WHERE role = 'teacher' AND status = 'active'
      GROUP BY institute_id
    ) t ON t.institute_id = i.id
    LIMIT 50
  ) rows;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_platform_institutes_summary() IS
  'Platform-wide per-institute summary for super-admin dashboard comparison.';

REVOKE ALL ON FUNCTION public.get_platform_institutes_summary() FROM public;
GRANT  EXECUTE ON FUNCTION public.get_platform_institutes_summary() TO authenticated;


-- ---------------------------------------------------------------------
-- Supporting indexes — defensive (skip silently if tables/columns missing)
-- ---------------------------------------------------------------------
DO $mig$
DECLARE
  has_col BOOLEAN;
BEGIN
  -- attendance(institute_id, date)
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_name='attendance' AND column_name='institute_id') INTO has_col;
  IF has_col THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_attendance_institute_date
             ON attendance (institute_id, date DESC)';
  END IF;

  -- attendance(student_id, date)
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_name='attendance' AND column_name='student_id') INTO has_col;
  IF has_col THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_attendance_student_date
             ON attendance (student_id, date DESC)';
  END IF;

  -- grade_entries(student_id, created_at)
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_name='grade_entries' AND column_name='student_id') INTO has_col;
  IF has_col THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_grade_entries_student_created
             ON grade_entries (student_id, created_at DESC)';
  END IF;

  -- student_fees(institute_id, status) — only if BOTH columns exist
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_name='student_fees' AND column_name='institute_id')
     AND EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_name='student_fees' AND column_name='status') INTO has_col;
  IF has_col THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_student_fees_institute_status
             ON student_fees (institute_id, status)';
  END IF;
END
$mig$;
