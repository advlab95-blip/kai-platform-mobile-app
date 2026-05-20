-- Post-audit hardening for Phase 5 (global_search) + Phase 6 (admin_ads).
-- Addresses CRITICAL findings from the security audit:
--   C1. global_search trusted client-supplied p_user_id → cross-tenant leak via
--       passing a platform admin's UUID.
--   C2. global_search trusted client-supplied p_role → role elevation (a
--       cafeteria user could pass p_role='admin' and get full admin search).
--   H1/H3. admin_ads link_url/image_url accepted any scheme (javascript:, etc.)
--   M2. admin_ads UPDATE let institute admins tamper with views_count,
--       created_by, created_at, owner_institute_id on their own rows via direct
--       PostgREST calls.

-- ── Phase 5: global_search ─────────────────────────────────
-- Re-declare function; auth check is injected before any work, and p_role is
-- derived from the caller's enrollment (platform admin may keep their passed
-- p_role since they're explicitly scoping). Everything else about the function
-- is unchanged.
CREATE OR REPLACE FUNCTION public.global_search(
  p_query        TEXT,
  p_role         TEXT,
  p_institute_id UUID,
  p_user_id      UUID,
  p_limit        INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query      TEXT;
  v_tsquery    TSQUERY;
  v_per_cat    INT;
  v_is_member  BOOLEAN := FALSE;
  v_is_admin   BOOLEAN := FALSE;
  v_results    JSONB   := '[]'::JSONB;
  v_resolved_role TEXT;
BEGIN
  -- Hard auth check: p_user_id is advisory-only in the old signature. Now we
  -- force it to equal the authenticated identity so nobody can impersonate
  -- another user (especially a platform admin) to hop tenants.
  IF auth.uid() IS NULL THEN
    RETURN '[]'::JSONB;
  END IF;
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN '[]'::JSONB;
  END IF;

  v_query := btrim(coalesce(p_query, ''));
  IF char_length(v_query) < 2 THEN RETURN '[]'::JSONB; END IF;
  IF char_length(v_query) > 100 THEN
    -- Cap query length — prevents tsquery DoS via pathological inputs.
    v_query := substring(v_query FROM 1 FOR 100);
  END IF;

  IF p_limit IS NULL OR p_limit < 1 THEN p_limit := 20; END IF;
  IF p_limit > 100 THEN p_limit := 100; END IF;
  v_per_cat := GREATEST(5, p_limit / 4);

  -- Resolve actual role from enrollments. A client cannot elevate themselves
  -- by passing p_role='admin'; we only accept the role that matches their
  -- active enrollment in the target institute.
  SELECT e.role INTO v_resolved_role
  FROM public.enrollments e
  WHERE e.user_id = auth.uid()
    AND e.institute_id = p_institute_id
    AND e.status = 'active'
  ORDER BY CASE e.role
             WHEN 'institute' THEN 1
             WHEN 'teacher'   THEN 2
             WHEN 'parent'    THEN 3
             WHEN 'student'   THEN 4
             WHEN 'cafeteria' THEN 5
             WHEN 'medical'   THEN 6
             ELSE 7
           END
  LIMIT 1;

  IF v_resolved_role IS NOT NULL THEN
    v_is_member := TRUE;
  END IF;

  -- Platform admin path: uses whatever p_role they requested (they're viewing
  -- the institute in that role's shoes). Checked against users.role, not
  -- enrollments, because platform admin is the global super-user.
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
  ) INTO v_is_admin;

  IF v_is_admin THEN
    v_is_member := TRUE;
    v_resolved_role := COALESCE(p_role, 'admin');
  END IF;

  IF NOT v_is_member OR v_resolved_role IS NULL THEN
    RETURN '[]'::JSONB;
  END IF;

  -- Build prefix-friendly tsquery.
  BEGIN
    v_tsquery := to_tsquery(
      'simple',
      regexp_replace(
        regexp_replace(v_query, '[^[:alnum:][:space:]]', ' ', 'g'),
        '(\S+)', '\1:*', 'g'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    v_tsquery := plainto_tsquery('simple', v_query);
  END;

  IF v_tsquery IS NULL OR v_tsquery::TEXT = '' THEN RETURN '[]'::JSONB; END IF;

  -- From here, hand off to the original role-branch logic. Branch on the
  -- server-verified role (v_resolved_role) rather than the client's p_role.
  IF v_resolved_role IN ('admin', 'institute') THEN
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

    IF EXISTS(SELECT 1 FROM information_schema.columns
              WHERE table_name='exams' AND column_name='search_vector') THEN
      SELECT v_results || COALESCE(jsonb_agg(r), '[]'::JSONB) INTO v_results
      FROM (
        SELECT jsonb_build_object(
          'id', x.id, 'category', 'exam', 'title', x.title,
          'subtitle', COALESCE(x.description, ''),
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

  ELSIF v_resolved_role = 'teacher' THEN
    SELECT v_results || COALESCE(jsonb_agg(r), '[]'::JSONB) INTO v_results
    FROM (
      SELECT DISTINCT ON (u.id) jsonb_build_object(
        'id', u.id, 'category', 'student', 'title', u.full_name,
        'subtitle', COALESCE(u.phone, ''),
        'route', '/(teacher)/content',
        'icon', 'person-outline',
        'created_at', to_char(COALESCE(u.created_at, NOW()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'rank', ts_rank(u.search_vector, v_tsquery)
      ) AS r
      FROM public.users u
      JOIN public.enrollments e ON e.user_id = u.id AND e.status = 'active' AND e.role = 'student'
      WHERE e.institute_id = p_institute_id
        AND u.search_vector @@ v_tsquery
      ORDER BY u.id, ts_rank(u.search_vector, v_tsquery) DESC
      LIMIT v_per_cat
    ) sub;

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
          AND a.teacher_id = auth.uid()
          AND a.search_vector @@ v_tsquery
        ORDER BY ts_rank(a.search_vector, v_tsquery) DESC
        LIMIT v_per_cat
      ) sub;
    END IF;

    IF EXISTS(SELECT 1 FROM information_schema.columns
              WHERE table_name='exams' AND column_name='search_vector') THEN
      SELECT v_results || COALESCE(jsonb_agg(r), '[]'::JSONB) INTO v_results
      FROM (
        SELECT jsonb_build_object(
          'id', x.id, 'category', 'exam', 'title', x.title,
          'subtitle', COALESCE(x.description, ''),
          'route', '/(teacher)/exams',
          'icon', 'clipboard-outline',
          'created_at', to_char(COALESCE(x.created_at, NOW()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'rank', ts_rank(x.search_vector, v_tsquery)
        ) AS r
        FROM public.exams x
        WHERE x.institute_id = p_institute_id
          AND x.created_by = auth.uid()
          AND x.search_vector @@ v_tsquery
        ORDER BY ts_rank(x.search_vector, v_tsquery) DESC
        LIMIT v_per_cat
      ) sub;
    END IF;

  ELSIF v_resolved_role = 'student' THEN
    IF EXISTS(SELECT 1 FROM information_schema.columns
              WHERE table_name='assignments' AND column_name='search_vector') THEN
      SELECT v_results || COALESCE(jsonb_agg(r), '[]'::JSONB) INTO v_results
      FROM (
        SELECT DISTINCT ON (a.id) jsonb_build_object(
          'id', a.id, 'category', 'assignment', 'title', a.title,
          'subtitle', COALESCE(a.description, ''),
          'route', '/(student)/content',
          'icon', 'document-text-outline',
          'created_at', to_char(COALESCE(a.created_at, NOW()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'rank', ts_rank(a.search_vector, v_tsquery)
        ) AS r
        FROM public.assignments a
        JOIN public.enrollments e ON e.institute_id = a.institute_id
          AND e.user_id = auth.uid()
          AND e.status = 'active'
          AND e.role = 'student'
        WHERE a.institute_id = p_institute_id
          AND a.search_vector @@ v_tsquery
        ORDER BY a.id, ts_rank(a.search_vector, v_tsquery) DESC
        LIMIT v_per_cat
      ) sub;
    END IF;

  ELSIF v_resolved_role = 'parent' THEN
    SELECT v_results || COALESCE(jsonb_agg(r), '[]'::JSONB) INTO v_results
    FROM (
      SELECT jsonb_build_object(
        'id', u.id, 'category', 'student', 'title', u.full_name,
        'subtitle', COALESCE(u.phone, ''),
        'route', '/(parent)',
        'icon', 'person-outline',
        'created_at', to_char(COALESCE(u.created_at, NOW()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'rank', ts_rank(u.search_vector, v_tsquery)
      ) AS r
      FROM public.users u
      JOIN public.enrollments e ON e.user_id = u.id AND e.status = 'active' AND e.role = 'student'
      JOIN public.parent_student_links psl ON psl.student_id = u.id AND psl.parent_id = auth.uid()
      WHERE e.institute_id = p_institute_id
        AND u.search_vector @@ v_tsquery
      ORDER BY ts_rank(u.search_vector, v_tsquery) DESC
      LIMIT v_per_cat
    ) sub;

  ELSIF v_resolved_role IN ('cafeteria', 'medical') THEN
    SELECT v_results || COALESCE(jsonb_agg(r), '[]'::JSONB) INTO v_results
    FROM (
      SELECT jsonb_build_object(
        'id', u.id, 'category', 'student', 'title', u.full_name,
        'subtitle', COALESCE(u.user_code, ''),
        'route', CASE WHEN v_resolved_role = 'cafeteria' THEN '/(cafeteria)' ELSE '/(medical)' END,
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
END;
$$;

GRANT EXECUTE ON FUNCTION public.global_search(TEXT, TEXT, UUID, UUID, INT) TO authenticated;

COMMENT ON FUNCTION public.global_search(TEXT, TEXT, UUID, UUID, INT) IS
  'Phase 5 — hardened: p_user_id forced to auth.uid(), role derived from enrollments (platform admin exempt).';

-- ── Phase 6: admin_ads lock-down ───────────────────────────
-- Restrict write scheme + pin immutable columns on UPDATE so institute admins
-- can't tamper with views_count, created_at, created_by, or move an ad to a
-- different owner.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'admin_ads' AND constraint_name = 'admin_ads_link_url_https'
  ) THEN
    ALTER TABLE public.admin_ads
      ADD CONSTRAINT admin_ads_link_url_https
      CHECK (link_url IS NULL OR link_url ~* '^https://');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'admin_ads' AND constraint_name = 'admin_ads_image_url_https'
  ) THEN
    ALTER TABLE public.admin_ads
      ADD CONSTRAINT admin_ads_image_url_https
      CHECK (image_url IS NULL OR image_url ~* '^https://');
  END IF;
END $$;

-- Pin immutable columns in the ownership trigger.
CREATE OR REPLACE FUNCTION public._admin_ads_enforce_ownership()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Platform admin path — allow, but still pin immutable columns on UPDATE
  -- so audit trail survives.
  IF public._is_platform_admin(v_uid) THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.views_count := OLD.views_count;
      NEW.created_at  := OLD.created_at;
      NEW.created_by  := OLD.created_by;
    END IF;
    RETURN NEW;
  END IF;

  -- Institute-admin path
  IF NEW.owner_institute_id IS NULL THEN
    RAISE EXCEPTION 'institute admins must set owner_institute_id';
  END IF;
  IF NOT public._is_institute_admin(v_uid, NEW.owner_institute_id) THEN
    RAISE EXCEPTION 'not authorized for this institute';
  END IF;

  IF cardinality(NEW.target_institutes) = 0 THEN
    NEW.target_institutes := ARRAY[NEW.owner_institute_id];
  ELSIF NOT (NEW.target_institutes <@ ARRAY[NEW.owner_institute_id]) THEN
    RAISE EXCEPTION 'target_institutes must be within owner institute';
  END IF;

  -- Lock immutable columns on UPDATE so institute admins can't fake views,
  -- backdate, or reassign authorship even via direct PostgREST.
  IF TG_OP = 'UPDATE' THEN
    NEW.views_count        := OLD.views_count;
    NEW.created_at         := OLD.created_at;
    NEW.created_by         := OLD.created_by;
    NEW.owner_institute_id := OLD.owner_institute_id;
  END IF;

  RETURN NEW;
END;
$$;
