-- ═══════════════════════════════════════════════════════════════════════════
-- 20260420_rls_lockdown_v3_safe.sql
--
-- Self-healing replacement for 20260420_rls_lockdown_v3.sql.
-- Same policy content; every section wrapped in its own DO..EXCEPTION block.
-- If a section fails (missing column, missing table, permission issue), that
-- section is logged as a NOTICE and the next section still runs.
--
-- After running, scan the "Notices" panel in Supabase SQL editor. Any section
-- that reports an error tells us exactly which table needs a column or is
-- missing in this database.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── [1] USERS TABLE — prevent role / institute_id self-escalation ────────
DO $$ BEGIN
  DROP POLICY IF EXISTS users_write              ON users;
  DROP POLICY IF EXISTS users_update_self        ON users;
  DROP POLICY IF EXISTS users_update_admin       ON users;
  DROP POLICY IF EXISTS users_insert             ON users;
  DROP POLICY IF EXISTS users_delete             ON users;
  DROP POLICY IF EXISTS users_v3_self_update     ON users;
  DROP POLICY IF EXISTS users_v3_admin_update    ON users;
  DROP POLICY IF EXISTS users_v3_institute_update ON users;
  DROP POLICY IF EXISTS users_v3_insert          ON users;
  DROP POLICY IF EXISTS users_v3_delete          ON users;

  CREATE POLICY users_v3_self_update ON users FOR UPDATE
    USING (id = (SELECT auth.uid()))
    WITH CHECK (
      id = (SELECT auth.uid())
      AND role = (SELECT role FROM users WHERE id = (SELECT auth.uid()))
      AND (institute_id IS NOT DISTINCT FROM
           (SELECT institute_id FROM users WHERE id = (SELECT auth.uid())))
      AND (is_frozen IS NOT DISTINCT FROM
           (SELECT is_frozen FROM users WHERE id = (SELECT auth.uid())))
    );

  CREATE POLICY users_v3_institute_update ON users FOR UPDATE
    USING (
      (SELECT public.get_user_role()) = 'institute'
      AND id IN (SELECT user_id FROM enrollments
                 WHERE institute_id IN (SELECT public.get_user_institute_ids()))
    )
    WITH CHECK (
      id IN (SELECT user_id FROM enrollments
             WHERE institute_id IN (SELECT public.get_user_institute_ids()))
      AND role NOT IN ('admin', 'platform_admin')
      AND (institute_id IS NULL
           OR institute_id IN (SELECT public.get_user_institute_ids()))
    );

  CREATE POLICY users_v3_admin_update ON users FOR UPDATE
    USING  ((SELECT public.get_user_role()) = 'admin')
    WITH CHECK ((SELECT public.get_user_role()) = 'admin');

  CREATE POLICY users_v3_insert ON users FOR INSERT
    WITH CHECK ((SELECT public.get_user_role()) = 'admin');

  CREATE POLICY users_v3_delete ON users FOR DELETE
    USING ((SELECT public.get_user_role()) = 'admin');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[1] users policies skipped: %', SQLERRM;
END $$;


-- ─── [2] bulk_promote_students / bulk_graduate_students — self-auth gate ──
DO $$ BEGIN
  EXECUTE $fn$
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
    AS $fnbody$
    DECLARE
      v_caller_role      TEXT;
      v_caller_institute UUID;
      v_all_student_ids  UUID[];
      v_promote_ids      UUID[];
      v_repeat_ids       UUID[];
      v_source_class_lookup JSONB;
    BEGIN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated';
      END IF;
      IF p_promoted_by IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'p_promoted_by must equal calling user';
      END IF;
      v_caller_role := (auth.jwt() ->> 'role');
      IF v_caller_role IS NULL THEN
        SELECT role INTO v_caller_role FROM users WHERE id = auth.uid();
      END IF;
      IF v_caller_role != 'admin' THEN
        SELECT institute_id INTO v_caller_institute
        FROM enrollments
        WHERE user_id = auth.uid()
          AND institute_id = p_institute_id
          AND role IN ('institute', 'admin')
          AND (status IS NULL OR status = 'active')
        LIMIT 1;
        IF v_caller_institute IS NULL THEN
          RAISE EXCEPTION 'caller is not an active admin of institute %', p_institute_id;
        END IF;
      END IF;

      SELECT array_agg(DISTINCT student_id) INTO v_all_student_ids
      FROM student_classes
      WHERE class_id = ANY(p_source_class_ids) AND institute_id = p_institute_id;

      IF v_all_student_ids IS NULL OR array_length(v_all_student_ids,1) IS NULL THEN
        RETURN json_build_object('promoted',0,'repeated',0);
      END IF;

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

      IF array_length(v_promote_ids,1) IS NOT NULL THEN
        UPDATE enrollments SET class_id = p_target_class_id
          WHERE user_id = ANY(v_promote_ids) AND institute_id = p_institute_id;
        UPDATE student_classes SET class_id = p_target_class_id
          WHERE student_id = ANY(v_promote_ids) AND institute_id = p_institute_id;
        INSERT INTO promotion_logs (institute_id, student_id, academic_year,
          from_class_id, to_class_id, action, promoted_by)
        SELECT p_institute_id, student_id, p_academic_year,
          COALESCE((v_source_class_lookup ->> student_id::TEXT)::UUID, p_source_class_ids[1]),
          p_target_class_id, 'promote', p_promoted_by
        FROM unnest(v_promote_ids) AS student_id;
      END IF;

      IF array_length(v_repeat_ids,1) IS NOT NULL THEN
        INSERT INTO promotion_logs (institute_id, student_id, academic_year,
          from_class_id, to_class_id, action, promoted_by)
        SELECT p_institute_id, student_id, p_academic_year,
          p_source_class_ids[1], p_source_class_ids[1], 'repeat', p_promoted_by
        FROM unnest(v_repeat_ids) AS student_id;
      END IF;

      RETURN json_build_object(
        'promoted', COALESCE(array_length(v_promote_ids,1), 0),
        'repeated', COALESCE(array_length(v_repeat_ids,1), 0)
      );
    END;
    $fnbody$;
  $fn$;
  GRANT EXECUTE ON FUNCTION public.bulk_promote_students TO authenticated;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[2a] bulk_promote_students skipped: %', SQLERRM;
END $$;


DO $$ BEGIN
  EXECUTE $fn$
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
    AS $fnbody$
    DECLARE
      v_caller_role      TEXT;
      v_caller_institute UUID;
      v_all_student_ids  UUID[];
      v_graduate_ids     UUID[];
    BEGIN
      IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
      IF p_promoted_by IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'p_promoted_by must equal calling user';
      END IF;
      v_caller_role := (auth.jwt() ->> 'role');
      IF v_caller_role IS NULL THEN
        SELECT role INTO v_caller_role FROM users WHERE id = auth.uid();
      END IF;
      IF v_caller_role != 'admin' THEN
        SELECT institute_id INTO v_caller_institute
        FROM enrollments
        WHERE user_id = auth.uid()
          AND institute_id = p_institute_id
          AND role IN ('institute', 'admin')
          AND (status IS NULL OR status = 'active')
        LIMIT 1;
        IF v_caller_institute IS NULL THEN
          RAISE EXCEPTION 'caller is not an active admin of institute %', p_institute_id;
        END IF;
      END IF;

      SELECT array_agg(DISTINCT student_id) INTO v_all_student_ids
      FROM student_classes
      WHERE class_id = ANY(p_class_ids) AND institute_id = p_institute_id;

      IF v_all_student_ids IS NULL OR array_length(v_all_student_ids,1) IS NULL THEN
        RETURN json_build_object('graduated',0);
      END IF;

      v_graduate_ids := ARRAY(
        SELECT unnest(v_all_student_ids)
        EXCEPT
        SELECT unnest(COALESCE(p_exclude_student_ids, ARRAY[]::UUID[]))
      );
      IF array_length(v_graduate_ids,1) IS NULL THEN
        RETURN json_build_object('graduated',0);
      END IF;

      INSERT INTO promotion_logs (institute_id, student_id, academic_year,
        from_class_id, to_class_id, action, promoted_by)
      SELECT p_institute_id, student_id, p_academic_year,
        p_class_ids[1], NULL, 'graduate', p_promoted_by
      FROM unnest(v_graduate_ids) AS student_id;

      IF p_delete_enrollments THEN
        DELETE FROM enrollments
          WHERE user_id = ANY(v_graduate_ids) AND institute_id = p_institute_id;
        DELETE FROM student_classes
          WHERE student_id = ANY(v_graduate_ids) AND institute_id = p_institute_id;
      END IF;

      RETURN json_build_object('graduated', array_length(v_graduate_ids,1),
        'delete_enrollments', p_delete_enrollments);
    END;
    $fnbody$;
  $fn$;
  GRANT EXECUTE ON FUNCTION public.bulk_graduate_students TO authenticated;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[2b] bulk_graduate_students skipped: %', SQLERRM;
END $$;


-- ─── [3] grade_entries — institute-scoped RLS ──────────────────────────────
DO $$ BEGIN
  DROP POLICY IF EXISTS ge_admin             ON grade_entries;
  DROP POLICY IF EXISTS ge_student           ON grade_entries;
  DROP POLICY IF EXISTS ge_parent            ON grade_entries;
  DROP POLICY IF EXISTS grade_entries_read   ON grade_entries;
  DROP POLICY IF EXISTS grade_entries_insert ON grade_entries;
  DROP POLICY IF EXISTS grade_entries_update ON grade_entries;
  DROP POLICY IF EXISTS grade_entries_delete ON grade_entries;

  CREATE POLICY grade_entries_read ON grade_entries FOR SELECT USING (
    student_id = (SELECT auth.uid())
    OR student_id IN (SELECT student_id FROM parent_child WHERE parent_id = (SELECT auth.uid()))
    OR ((SELECT public.get_user_role()) IN ('admin','institute','teacher')
        AND institute_id IN (SELECT public.get_user_institute_ids()))
    OR (SELECT public.get_user_role()) = 'admin'
  );

  CREATE POLICY grade_entries_insert ON grade_entries FOR INSERT WITH CHECK (
    institute_id IN (SELECT public.get_user_institute_ids())
    AND (SELECT public.get_user_role()) IN ('admin','institute','teacher')
  );

  CREATE POLICY grade_entries_update ON grade_entries FOR UPDATE USING (
    institute_id IN (SELECT public.get_user_institute_ids())
    AND (teacher_id = (SELECT auth.uid())
         OR (SELECT public.get_user_role()) IN ('admin','institute'))
  ) WITH CHECK (
    institute_id IN (SELECT public.get_user_institute_ids())
    AND (teacher_id = (SELECT auth.uid())
         OR (SELECT public.get_user_role()) IN ('admin','institute'))
  );

  CREATE POLICY grade_entries_delete ON grade_entries FOR DELETE USING (
    institute_id IN (SELECT public.get_user_institute_ids())
    AND (SELECT public.get_user_role()) IN ('admin','institute')
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[3] grade_entries policies skipped: %', SQLERRM;
END $$;


-- ─── [4] attendance — precise per-role scoping ─────────────────────────────
DO $$ BEGIN
  DROP POLICY IF EXISTS attendance_permissive ON attendance;
  DROP POLICY IF EXISTS attendance_read       ON attendance;
  DROP POLICY IF EXISTS attendance_write      ON attendance;
  DROP POLICY IF EXISTS attendance_update     ON attendance;
  DROP POLICY IF EXISTS attendance_v3_read    ON attendance;
  DROP POLICY IF EXISTS attendance_v3_write   ON attendance;
  DROP POLICY IF EXISTS attendance_v3_update  ON attendance;
  DROP POLICY IF EXISTS attendance_v3_delete  ON attendance;

  CREATE POLICY attendance_v3_read ON attendance FOR SELECT USING (
    student_id = (SELECT auth.uid())
    OR (
      (SELECT public.get_user_role()) = 'parent'
      AND student_id IN (SELECT student_id FROM parent_child WHERE parent_id = (SELECT auth.uid()))
    )
    OR (
      (SELECT public.get_user_role()) = 'teacher'
      AND (
        (institute_id IS NOT NULL
         AND institute_id IN (SELECT public.get_user_institute_ids()))
        OR student_id IN (
          SELECT sc.student_id FROM student_classes sc
          JOIN teacher_assignments ta
            ON ta.class_id = sc.class_id
           AND ta.institute_id = sc.institute_id
          WHERE ta.teacher_id = (SELECT auth.uid())
            AND ta.institute_id IN (SELECT public.get_user_institute_ids())
        )
      )
    )
    OR (
      (SELECT public.get_user_role()) IN ('admin','institute')
      AND (institute_id IN (SELECT public.get_user_institute_ids())
           OR (SELECT public.get_user_role()) = 'admin')
    )
  );

  CREATE POLICY attendance_v3_write ON attendance FOR INSERT WITH CHECK (
    (SELECT public.get_user_role()) IN ('admin','institute','teacher')
    AND (institute_id IN (SELECT public.get_user_institute_ids())
         OR (SELECT public.get_user_role()) = 'admin')
  );

  CREATE POLICY attendance_v3_update ON attendance FOR UPDATE USING (
    (SELECT public.get_user_role()) IN ('admin','institute','teacher')
    AND (institute_id IN (SELECT public.get_user_institute_ids())
         OR (SELECT public.get_user_role()) = 'admin')
  ) WITH CHECK (
    (SELECT public.get_user_role()) IN ('admin','institute','teacher')
    AND (institute_id IN (SELECT public.get_user_institute_ids())
         OR (SELECT public.get_user_role()) = 'admin')
  );

  CREATE POLICY attendance_v3_delete ON attendance FOR DELETE USING (
    (SELECT public.get_user_role()) IN ('admin','institute')
    AND (institute_id IN (SELECT public.get_user_institute_ids())
         OR (SELECT public.get_user_role()) = 'admin')
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[4] attendance policies skipped: %', SQLERRM;
END $$;


-- ─── [5] exams — teacher owns exam + institute match ───────────────────────
DO $$ BEGIN
  DROP POLICY IF EXISTS exams_read       ON exams;
  DROP POLICY IF EXISTS exams_write      ON exams;
  DROP POLICY IF EXISTS exams_v3_read    ON exams;
  DROP POLICY IF EXISTS exams_v3_insert  ON exams;
  DROP POLICY IF EXISTS exams_v3_update  ON exams;
  DROP POLICY IF EXISTS exams_v3_delete  ON exams;

  CREATE POLICY exams_v3_read ON exams FOR SELECT USING (
    teacher_id = (SELECT auth.uid())
    OR institute_id IN (SELECT public.get_user_institute_ids())
    OR (SELECT public.get_user_role()) = 'admin'
  );

  CREATE POLICY exams_v3_insert ON exams FOR INSERT WITH CHECK (
    (teacher_id = (SELECT auth.uid())
     AND institute_id IN (SELECT public.get_user_institute_ids())
     AND (SELECT public.get_user_role()) = 'teacher')
    OR ((SELECT public.get_user_role()) IN ('admin','institute')
        AND institute_id IN (SELECT public.get_user_institute_ids()))
    OR (SELECT public.get_user_role()) = 'admin'
  );

  CREATE POLICY exams_v3_update ON exams FOR UPDATE USING (
    (teacher_id = (SELECT auth.uid())
     AND institute_id IN (SELECT public.get_user_institute_ids()))
    OR ((SELECT public.get_user_role()) IN ('admin','institute')
        AND institute_id IN (SELECT public.get_user_institute_ids()))
    OR (SELECT public.get_user_role()) = 'admin'
  ) WITH CHECK (
    (teacher_id = (SELECT auth.uid())
     AND institute_id IN (SELECT public.get_user_institute_ids()))
    OR ((SELECT public.get_user_role()) IN ('admin','institute')
        AND institute_id IN (SELECT public.get_user_institute_ids()))
    OR (SELECT public.get_user_role()) = 'admin'
  );

  CREATE POLICY exams_v3_delete ON exams FOR DELETE USING (
    ((SELECT public.get_user_role()) IN ('admin','institute')
     AND institute_id IN (SELECT public.get_user_institute_ids()))
    OR (SELECT public.get_user_role()) = 'admin'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[5] exams policies skipped: %', SQLERRM;
END $$;


-- ─── [6] parent_child — explicit WITH CHECK on INSERT ──────────────────────
DO $$ BEGIN
  DROP POLICY IF EXISTS parent_child_permissive ON parent_child;
  DROP POLICY IF EXISTS parent_child_read       ON parent_child;
  DROP POLICY IF EXISTS parent_child_write      ON parent_child;
  DROP POLICY IF EXISTS parent_child_v3_read    ON parent_child;
  DROP POLICY IF EXISTS parent_child_v3_insert  ON parent_child;
  DROP POLICY IF EXISTS parent_child_v3_update  ON parent_child;
  DROP POLICY IF EXISTS parent_child_v3_delete  ON parent_child;

  CREATE POLICY parent_child_v3_read ON parent_child FOR SELECT USING (
    parent_id = (SELECT auth.uid())
    OR student_id = (SELECT auth.uid())
    OR (SELECT public.get_user_role()) IN ('admin','institute')
  );

  CREATE POLICY parent_child_v3_insert ON parent_child FOR INSERT WITH CHECK (
    (SELECT public.get_user_role()) IN ('admin','institute')
    AND student_id IN (SELECT user_id FROM enrollments
                       WHERE institute_id IN (SELECT public.get_user_institute_ids())
                         AND (status IS NULL OR status = 'active'))
    AND parent_id  IN (SELECT user_id FROM enrollments
                       WHERE institute_id IN (SELECT public.get_user_institute_ids())
                         AND (status IS NULL OR status = 'active'))
  );

  CREATE POLICY parent_child_v3_update ON parent_child FOR UPDATE USING (
    (SELECT public.get_user_role()) IN ('admin','institute')
  ) WITH CHECK (
    (SELECT public.get_user_role()) IN ('admin','institute')
    AND student_id IN (SELECT user_id FROM enrollments
                       WHERE institute_id IN (SELECT public.get_user_institute_ids())
                         AND (status IS NULL OR status = 'active'))
  );

  CREATE POLICY parent_child_v3_delete ON parent_child FOR DELETE USING (
    (SELECT public.get_user_role()) IN ('admin','institute')
    AND student_id IN (SELECT user_id FROM enrollments
                       WHERE institute_id IN (SELECT public.get_user_institute_ids()))
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[6] parent_child policies skipped: %', SQLERRM;
END $$;


-- ─── [7] certificates — parent sees only own children ──────────────────────
DO $$ BEGIN
  DROP POLICY IF EXISTS cert_read               ON certificates;
  DROP POLICY IF EXISTS cert_write              ON certificates;
  DROP POLICY IF EXISTS certificates_v3_read    ON certificates;
  DROP POLICY IF EXISTS certificates_v3_insert  ON certificates;
  DROP POLICY IF EXISTS certificates_v3_update  ON certificates;
  DROP POLICY IF EXISTS certificates_v3_delete  ON certificates;

  CREATE POLICY certificates_v3_read ON certificates FOR SELECT USING (
    student_id = (SELECT auth.uid())
    OR (
      (SELECT public.get_user_role()) = 'parent'
      AND student_id IN (SELECT student_id FROM parent_child WHERE parent_id = (SELECT auth.uid()))
    )
    OR (
      (SELECT public.get_user_role()) IN ('admin','institute','teacher')
      AND institute_id IN (SELECT public.get_user_institute_ids())
    )
    OR (SELECT public.get_user_role()) = 'admin'
  );

  CREATE POLICY certificates_v3_insert ON certificates FOR INSERT WITH CHECK (
    (SELECT public.get_user_role()) IN ('admin','institute')
    AND institute_id IN (SELECT public.get_user_institute_ids())
  );

  CREATE POLICY certificates_v3_update ON certificates FOR UPDATE USING (
    (SELECT public.get_user_role()) IN ('admin','institute')
    AND institute_id IN (SELECT public.get_user_institute_ids())
  ) WITH CHECK (
    (SELECT public.get_user_role()) IN ('admin','institute')
    AND institute_id IN (SELECT public.get_user_institute_ids())
  );

  CREATE POLICY certificates_v3_delete ON certificates FOR DELETE USING (
    (SELECT public.get_user_role()) IN ('admin','institute')
    AND institute_id IN (SELECT public.get_user_institute_ids())
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[7] certificates policies skipped: %', SQLERRM;
END $$;


-- ─── [8a] stages ───────────────────────────────────────────────────────────
DO $$ BEGIN
  DROP POLICY IF EXISTS stages_permissive ON stages;
  DROP POLICY IF EXISTS stages_read       ON stages;
  DROP POLICY IF EXISTS stages_write      ON stages;
  DROP POLICY IF EXISTS stages_v3_read    ON stages;
  DROP POLICY IF EXISTS stages_v3_write   ON stages;

  CREATE POLICY stages_v3_read ON stages FOR SELECT USING (
    institute_id IN (SELECT public.get_user_institute_ids())
    OR (SELECT public.get_user_role()) = 'admin'
  );

  CREATE POLICY stages_v3_write ON stages FOR ALL USING (
    (SELECT public.get_user_role()) IN ('admin','institute')
    AND (institute_id IN (SELECT public.get_user_institute_ids())
         OR (SELECT public.get_user_role()) = 'admin')
  ) WITH CHECK (
    (SELECT public.get_user_role()) IN ('admin','institute')
    AND (institute_id IN (SELECT public.get_user_institute_ids())
         OR (SELECT public.get_user_role()) = 'admin')
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[8a] stages policies skipped: %', SQLERRM;
END $$;


-- ─── [8b] grades (school صفوف) ─────────────────────────────────────────────
DO $$ BEGIN
  DROP POLICY IF EXISTS grades_permissive ON grades;
  DROP POLICY IF EXISTS grades_read       ON grades;
  DROP POLICY IF EXISTS grades_write      ON grades;
  DROP POLICY IF EXISTS grades_v3_read    ON grades;
  DROP POLICY IF EXISTS grades_v3_write   ON grades;

  CREATE POLICY grades_v3_read ON grades FOR SELECT USING (
    institute_id IN (SELECT public.get_user_institute_ids())
    OR (SELECT public.get_user_role()) = 'admin'
  );

  CREATE POLICY grades_v3_write ON grades FOR ALL USING (
    (SELECT public.get_user_role()) IN ('admin','institute')
    AND (institute_id IN (SELECT public.get_user_institute_ids())
         OR (SELECT public.get_user_role()) = 'admin')
  ) WITH CHECK (
    (SELECT public.get_user_role()) IN ('admin','institute')
    AND (institute_id IN (SELECT public.get_user_institute_ids())
         OR (SELECT public.get_user_role()) = 'admin')
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[8b] grades policies skipped: %', SQLERRM;
END $$;


-- ─── [8c] sections ─────────────────────────────────────────────────────────
DO $$ BEGIN
  DROP POLICY IF EXISTS sections_permissive ON sections;
  DROP POLICY IF EXISTS sections_read       ON sections;
  DROP POLICY IF EXISTS sections_write      ON sections;
  DROP POLICY IF EXISTS sections_v3_read    ON sections;
  DROP POLICY IF EXISTS sections_v3_write   ON sections;

  CREATE POLICY sections_v3_read ON sections FOR SELECT USING (
    institute_id IN (SELECT public.get_user_institute_ids())
    OR (SELECT public.get_user_role()) = 'admin'
  );

  CREATE POLICY sections_v3_write ON sections FOR ALL USING (
    (SELECT public.get_user_role()) IN ('admin','institute')
    AND (institute_id IN (SELECT public.get_user_institute_ids())
         OR (SELECT public.get_user_role()) = 'admin')
  ) WITH CHECK (
    (SELECT public.get_user_role()) IN ('admin','institute')
    AND (institute_id IN (SELECT public.get_user_institute_ids())
         OR (SELECT public.get_user_role()) = 'admin')
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[8c] sections policies skipped: %', SQLERRM;
END $$;


-- ─── [8d] subjects ─────────────────────────────────────────────────────────
DO $$ BEGIN
  DROP POLICY IF EXISTS subjects_permissive ON subjects;
  DROP POLICY IF EXISTS subjects_read       ON subjects;
  DROP POLICY IF EXISTS subjects_write      ON subjects;
  DROP POLICY IF EXISTS subjects_v3_read    ON subjects;
  DROP POLICY IF EXISTS subjects_v3_write   ON subjects;

  CREATE POLICY subjects_v3_read ON subjects FOR SELECT USING (
    institute_id IN (SELECT public.get_user_institute_ids())
    OR (SELECT public.get_user_role()) = 'admin'
  );

  CREATE POLICY subjects_v3_write ON subjects FOR ALL USING (
    (SELECT public.get_user_role()) IN ('admin','institute')
    AND (institute_id IN (SELECT public.get_user_institute_ids())
         OR (SELECT public.get_user_role()) = 'admin')
  ) WITH CHECK (
    (SELECT public.get_user_role()) IN ('admin','institute')
    AND (institute_id IN (SELECT public.get_user_institute_ids())
         OR (SELECT public.get_user_role()) = 'admin')
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[8d] subjects policies skipped: %', SQLERRM;
END $$;


-- ─── Supporting indexes (already wrapped in original migration) ────────────
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_parent_child_parent_student ON parent_child(parent_id, student_id);
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'idx_parent_child_parent_student: %', SQLERRM; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_grade_entries_institute ON grade_entries(institute_id);
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'idx_grade_entries_institute: %', SQLERRM; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_certificates_student ON certificates(student_id);
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'idx_certificates_student: %', SQLERRM; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_teacher_assignments_teacher_institute ON teacher_assignments(teacher_id, institute_id);
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'idx_teacher_assignments_teacher_institute: %', SQLERRM; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'idx_users_role: %', SQLERRM; END $$;

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_stages_institute   ON stages(institute_id);
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'idx_stages_institute: %', SQLERRM; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_grades_institute   ON grades(institute_id);
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'idx_grades_institute: %', SQLERRM; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_sections_institute ON sections(institute_id);
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'idx_sections_institute: %', SQLERRM; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_subjects_institute ON subjects(institute_id);
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'idx_subjects_institute: %', SQLERRM; END $$;
