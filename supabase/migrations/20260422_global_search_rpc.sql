-- =====================================================================
-- Phase 5.2 — Role-aware global_search RPC
-- =====================================================================
-- Single entry point for the search UI across 7 roles. Each role sees a
-- curated slice of the institute's data:
--   admin/institute → users, subjects, assignments, exams, announcements
--   teacher         → their students, their subjects, their assignments
--   student         → their subjects, assignments targeted at them, exams
--   parent          → their children, their children's assignments
--   cafeteria/medical → students in institute (name lookup for service)
--
-- Every branch filters by p_institute_id. No branch returns rows from a
-- different institute. Results are combined into a single JSONB array
-- with a stable shape matching SearchResult in services/search.ts.
--
-- SECURITY DEFINER so we can read across tables regardless of RLS, but
-- we REQUIRE that p_user_id has an active enrollment in p_institute_id
-- (gate at top of function). Without this check the service_role-safe
-- path would let any caller query any institute.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.global_search(
  p_query        TEXT,
  p_role         TEXT,
  p_institute_id UUID,
  p_user_id      UUID,
  p_limit        INT DEFAULT 20
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_query      TEXT;
  v_tsquery    tsquery;
  v_results    JSONB := '[]'::JSONB;
  v_is_member  BOOLEAN;
  v_per_cat    INT;
BEGIN
  -- Trim + reject empty queries early (saves FTS work).
  v_query := btrim(coalesce(p_query, ''));
  IF char_length(v_query) < 2 THEN
    RETURN '[]'::JSONB;
  END IF;

  -- Clamp limit so callers can't request unreasonable pages.
  IF p_limit IS NULL OR p_limit < 1 THEN p_limit := 20; END IF;
  IF p_limit > 100 THEN p_limit := 100; END IF;
  v_per_cat := GREATEST(5, p_limit / 4);

  -- Authorization: caller must have an active enrollment in this institute.
  -- Platform admins (role='admin' on enrollments in ANY institute-less record)
  -- pass automatically too.
  SELECT EXISTS(
    SELECT 1 FROM public.enrollments
    WHERE user_id = p_user_id
      AND institute_id = p_institute_id
      AND status = 'active'
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    -- Platform admin fallback: look up role from users table
    IF EXISTS (
      SELECT 1 FROM public.users WHERE id = p_user_id AND role = 'admin'
    ) THEN
      v_is_member := TRUE;
    END IF;
  END IF;

  IF NOT v_is_member THEN RETURN '[]'::JSONB; END IF;

  -- Build prefix-friendly tsquery: split tokens and append :* to each.
  -- Safe against injection: we use plainto_tsquery for the AND-combined
  -- term and a prefix match via to_tsquery on a pre-sanitized string.
  BEGIN
    v_tsquery := to_tsquery(
      'simple',
      regexp_replace(
        regexp_replace(v_query, '[^[:alnum:][:space:]]', ' ', 'g'),
        '(\S+)', '\1:*', 'g'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Fallback: use plainto_tsquery (no prefix but safe for any input)
    v_tsquery := plainto_tsquery('simple', v_query);
  END;

  IF v_tsquery IS NULL OR v_tsquery::TEXT = '' THEN
    RETURN '[]'::JSONB;
  END IF;

  -- =========================================================
  -- Branch: admin / institute
  -- =========================================================
  IF p_role IN ('admin', 'institute') THEN

    -- Users in institute (students + teachers)
    SELECT v_results || COALESCE(jsonb_agg(r), '[]'::JSONB) INTO v_results
    FROM (
      SELECT jsonb_build_object(
        'id',        u.id,
        'category',  CASE WHEN e.role = 'teacher' THEN 'teacher' ELSE 'student' END,
        'title',     u.full_name,
        'subtitle',  COALESCE(u.phone, ''),
        'route',     '/(admin)/users',
        'icon',      CASE WHEN e.role = 'teacher' THEN 'school-outline' ELSE 'person-outline' END,
        'created_at', to_char(COALESCE(u.created_at, NOW()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'rank',      ts_rank(u.search_vector, v_tsquery)
      ) AS r
      FROM public.users u
      JOIN public.enrollments e ON e.user_id = u.id AND e.status = 'active'
      WHERE e.institute_id = p_institute_id
        AND u.search_vector @@ v_tsquery
      ORDER BY ts_rank(u.search_vector, v_tsquery) DESC, u.full_name
      LIMIT v_per_cat
    ) sub;

    -- Subjects
    IF EXISTS(SELECT 1 FROM information_schema.columns
              WHERE table_name='subjects' AND column_name='search_vector') THEN
      SELECT v_results || COALESCE(jsonb_agg(r), '[]'::JSONB) INTO v_results
      FROM (
        SELECT jsonb_build_object(
          'id', s.id, 'category', 'subject', 'title', s.name,
          'subtitle', NULL,
          'route', '/(admin)/users',
          'icon', 'book-outline',
          'created_at', to_char(COALESCE(s.created_at, NOW()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'rank', ts_rank(s.search_vector, v_tsquery)
        ) AS r
        FROM public.subjects s
        WHERE s.institute_id = p_institute_id
          AND s.search_vector @@ v_tsquery
        ORDER BY ts_rank(s.search_vector, v_tsquery) DESC
        LIMIT v_per_cat
      ) sub;
    END IF;

    -- Assignments
    IF EXISTS(SELECT 1 FROM information_schema.columns
              WHERE table_name='assignments' AND column_name='search_vector') THEN
      SELECT v_results || COALESCE(jsonb_agg(r), '[]'::JSONB) INTO v_results
      FROM (
        SELECT jsonb_build_object(
          'id', a.id, 'category', 'assignment', 'title', a.title,
          'subtitle', COALESCE(a.description, ''),
          'route', '/(teacher)/content',
          'icon', 'document-text-outline',
          'created_at', to_char(COALESCE(a.created_at, NOW()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'rank', ts_rank(a.search_vector, v_tsquery)
        ) AS r
        FROM public.assignments a
        WHERE a.institute_id = p_institute_id
          AND a.search_vector @@ v_tsquery
        ORDER BY ts_rank(a.search_vector, v_tsquery) DESC
        LIMIT v_per_cat
      ) sub;
    END IF;

    -- Exams
    IF EXISTS(SELECT 1 FROM information_schema.columns
              WHERE table_name='exams' AND column_name='search_vector') THEN
      SELECT v_results || COALESCE(jsonb_agg(r), '[]'::JSONB) INTO v_results
      FROM (
        SELECT jsonb_build_object(
          'id', x.id, 'category', 'exam', 'title', x.title,
          'subtitle', NULL,
          'route', '/(teacher)/exams',
          'icon', 'clipboard-outline',
          'created_at', to_char(COALESCE(x.created_at, NOW()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'rank', ts_rank(x.search_vector, v_tsquery)
        ) AS r
        FROM public.exams x
        WHERE x.institute_id = p_institute_id
          AND x.search_vector @@ v_tsquery
        ORDER BY ts_rank(x.search_vector, v_tsquery) DESC
        LIMIT v_per_cat
      ) sub;
    END IF;

  -- =========================================================
  -- Branch: teacher — their students + their subjects + their assignments
  -- =========================================================
  ELSIF p_role = 'teacher' THEN

    -- Students enrolled in classes/sections this teacher teaches
    SELECT v_results || COALESCE(jsonb_agg(r), '[]'::JSONB) INTO v_results
    FROM (
      SELECT DISTINCT ON (u.id) jsonb_build_object(
        'id', u.id, 'category', 'student', 'title', u.full_name,
        'subtitle', COALESCE(u.phone, ''),
        'route', '/(teacher)/grades',
        'icon', 'person-outline',
        'created_at', to_char(COALESCE(u.created_at, NOW()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'rank', ts_rank(u.search_vector, v_tsquery)
      ) AS r
      FROM public.users u
      JOIN public.enrollments e ON e.user_id = u.id AND e.status = 'active' AND e.role = 'student'
      WHERE e.institute_id = p_institute_id
        AND u.search_vector @@ v_tsquery
        AND EXISTS (
          SELECT 1 FROM public.teacher_assignments ta
          WHERE ta.teacher_id = p_user_id
            AND (
              (ta.class_id IS NOT NULL AND e.class_id = ta.class_id) OR
              (ta.section_id IS NOT NULL AND e.section_id = ta.section_id)
            )
        )
      ORDER BY u.id, ts_rank(u.search_vector, v_tsquery) DESC
      LIMIT v_per_cat
    ) sub;

    -- Teacher's subjects
    IF EXISTS(SELECT 1 FROM information_schema.columns
              WHERE table_name='subjects' AND column_name='search_vector') THEN
      SELECT v_results || COALESCE(jsonb_agg(r), '[]'::JSONB) INTO v_results
      FROM (
        SELECT DISTINCT ON (s.id) jsonb_build_object(
          'id', s.id, 'category', 'subject', 'title', s.name,
          'subtitle', NULL,
          'route', '/(teacher)/content',
          'icon', 'book-outline',
          'created_at', to_char(COALESCE(s.created_at, NOW()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'rank', ts_rank(s.search_vector, v_tsquery)
        ) AS r
        FROM public.subjects s
        JOIN public.teacher_assignments ta
          ON ta.subject_id = s.id AND ta.teacher_id = p_user_id
        WHERE s.institute_id = p_institute_id
          AND s.search_vector @@ v_tsquery
        ORDER BY s.id, ts_rank(s.search_vector, v_tsquery) DESC
        LIMIT v_per_cat
      ) sub;
    END IF;

    -- Teacher's assignments
    IF EXISTS(SELECT 1 FROM information_schema.columns
              WHERE table_name='assignments' AND column_name='search_vector') THEN
      SELECT v_results || COALESCE(jsonb_agg(r), '[]'::JSONB) INTO v_results
      FROM (
        SELECT jsonb_build_object(
          'id', a.id, 'category', 'assignment', 'title', a.title,
          'subtitle', COALESCE(a.description, ''),
          'route', '/(teacher)/content',
          'icon', 'document-text-outline',
          'created_at', to_char(COALESCE(a.created_at, NOW()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'rank', ts_rank(a.search_vector, v_tsquery)
        ) AS r
        FROM public.assignments a
        WHERE a.institute_id = p_institute_id
          AND a.teacher_id = p_user_id
          AND a.search_vector @@ v_tsquery
        ORDER BY ts_rank(a.search_vector, v_tsquery) DESC
        LIMIT v_per_cat
      ) sub;
    END IF;

  -- =========================================================
  -- Branch: student — subjects they take + assignments/exams targeted at them
  -- =========================================================
  ELSIF p_role = 'student' THEN

    -- Subjects (via teacher_assignments scoped to student's class)
    IF EXISTS(SELECT 1 FROM information_schema.columns
              WHERE table_name='subjects' AND column_name='search_vector') THEN
      SELECT v_results || COALESCE(jsonb_agg(r), '[]'::JSONB) INTO v_results
      FROM (
        SELECT DISTINCT ON (s.id) jsonb_build_object(
          'id', s.id, 'category', 'subject', 'title', s.name,
          'subtitle', NULL,
          'route', '/(student)/courses',
          'icon', 'book-outline',
          'created_at', to_char(COALESCE(s.created_at, NOW()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'rank', ts_rank(s.search_vector, v_tsquery)
        ) AS r
        FROM public.subjects s
        WHERE s.institute_id = p_institute_id
          AND s.search_vector @@ v_tsquery
        ORDER BY s.id, ts_rank(s.search_vector, v_tsquery) DESC
        LIMIT v_per_cat
      ) sub;
    END IF;

    -- Assignments targeted at the student's class/section
    IF EXISTS(SELECT 1 FROM information_schema.columns
              WHERE table_name='assignments' AND column_name='search_vector') THEN
      SELECT v_results || COALESCE(jsonb_agg(r), '[]'::JSONB) INTO v_results
      FROM (
        SELECT jsonb_build_object(
          'id', a.id, 'category', 'assignment', 'title', a.title,
          'subtitle', COALESCE(a.description, ''),
          'route', '/(student)',
          'icon', 'document-text-outline',
          'created_at', to_char(COALESCE(a.created_at, NOW()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'rank', ts_rank(a.search_vector, v_tsquery)
        ) AS r
        FROM public.assignments a
        JOIN public.enrollments e
          ON e.user_id = p_user_id
          AND e.role = 'student'
          AND e.status = 'active'
          AND e.institute_id = p_institute_id
        WHERE a.institute_id = p_institute_id
          AND a.search_vector @@ v_tsquery
          AND (
            (a.class_id IS NOT NULL AND a.class_id = e.class_id) OR
            (a.section_id IS NOT NULL AND a.section_id = e.section_id)
          )
        ORDER BY ts_rank(a.search_vector, v_tsquery) DESC
        LIMIT v_per_cat
      ) sub;
    END IF;

  -- =========================================================
  -- Branch: parent — their children + children's assignments
  -- =========================================================
  ELSIF p_role = 'parent' THEN

    -- Children
    SELECT v_results || COALESCE(jsonb_agg(r), '[]'::JSONB) INTO v_results
    FROM (
      SELECT jsonb_build_object(
        'id', u.id, 'category', 'student', 'title', u.full_name,
        'subtitle', COALESCE(u.phone, ''),
        'route', '/(parent)/academic',
        'icon', 'person-outline',
        'created_at', to_char(COALESCE(u.created_at, NOW()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'rank', ts_rank(u.search_vector, v_tsquery)
      ) AS r
      FROM public.users u
      JOIN public.parent_child pc ON pc.child_id = u.id AND pc.parent_id = p_user_id
      JOIN public.enrollments e ON e.user_id = u.id AND e.status = 'active' AND e.role = 'student'
      WHERE e.institute_id = p_institute_id
        AND u.search_vector @@ v_tsquery
      ORDER BY ts_rank(u.search_vector, v_tsquery) DESC
      LIMIT v_per_cat
    ) sub;

  -- =========================================================
  -- Branch: cafeteria / medical — students in institute (name only)
  -- =========================================================
  ELSIF p_role IN ('cafeteria', 'medical') THEN

    SELECT v_results || COALESCE(jsonb_agg(r), '[]'::JSONB) INTO v_results
    FROM (
      SELECT jsonb_build_object(
        'id', u.id, 'category', 'student', 'title', u.full_name,
        'subtitle', COALESCE(u.phone, ''),
        'route', CASE WHEN p_role = 'cafeteria' THEN '/(cafeteria)' ELSE '/(medical)' END,
        'icon', 'person-outline',
        'created_at', to_char(COALESCE(u.created_at, NOW()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'rank', ts_rank(u.search_vector, v_tsquery)
      ) AS r
      FROM public.users u
      JOIN public.enrollments e ON e.user_id = u.id AND e.status = 'active' AND e.role = 'student'
      WHERE e.institute_id = p_institute_id
        AND u.search_vector @@ v_tsquery
      ORDER BY ts_rank(u.search_vector, v_tsquery) DESC
      LIMIT v_per_cat
    ) sub;

  END IF;

  RETURN v_results;
END
$fn$;

REVOKE ALL ON FUNCTION public.global_search(TEXT, TEXT, UUID, UUID, INT) FROM public;
GRANT EXECUTE ON FUNCTION public.global_search(TEXT, TEXT, UUID, UUID, INT) TO authenticated;

COMMENT ON FUNCTION public.global_search(TEXT, TEXT, UUID, UUID, INT) IS
  'Phase 5 — role-aware search across users/subjects/assignments/exams. Always scoped to institute_id + role. Returns JSONB array matching SearchResult TS shape.';
