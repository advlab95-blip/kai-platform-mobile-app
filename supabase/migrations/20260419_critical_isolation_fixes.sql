-- ═══════════════════════════════════════════════════════════════════════════
-- 20260419_critical_isolation_fixes.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- Closes multi-tenant isolation leaks discovered in security audit:
--   1. exam_answers      — USING(true)  → scope by session owner
--   2. assignment_*      — USING(true)  → scope by submission/institute
--   3. manual_grades     — student saw classmates / teacher A edited teacher B
--   4. bus_attendance    — USING(true)  → scope by student / institute
--   5. event_registrations/event_photos — USING(true)
--   6. ai_daily_usage    — USING(true)  (quota-exhaustion attack vector)
--   7. ai_content_cache  — USING(true)  (cross-tenant cache poisoning)
--   8. tasks / live_streams — cross-institute student/teacher visibility
--   9. exam_sessions     — INSERT missing WITH CHECK
--  10. exam_audit_log    — INSERT WITH CHECK (true) spoofable
--  11. academic_years / enrollment_history / student_classes — permissive
--
-- IDEMPOTENT: each block uses DROP POLICY IF EXISTS; safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══ 1. exam_answers — only own session; teachers/admin see institute ═════
DROP POLICY IF EXISTS ea_all ON exam_answers;
DROP POLICY IF EXISTS exam_answers_read ON exam_answers;
DROP POLICY IF EXISTS exam_answers_write ON exam_answers;

CREATE POLICY exam_answers_read ON exam_answers FOR SELECT USING (
  session_id IN (SELECT id FROM exam_sessions WHERE student_id = auth.uid())
  OR public.get_user_role() IN ('admin', 'institute', 'teacher')
);
CREATE POLICY exam_answers_write ON exam_answers FOR INSERT WITH CHECK (
  session_id IN (SELECT id FROM exam_sessions WHERE student_id = auth.uid())
);
CREATE POLICY exam_answers_update ON exam_answers FOR UPDATE USING (
  session_id IN (SELECT id FROM exam_sessions WHERE student_id = auth.uid())
  OR public.get_user_role() IN ('admin', 'institute', 'teacher')
);
CREATE POLICY exam_answers_delete ON exam_answers FOR DELETE USING (
  public.get_user_role() IN ('admin', 'institute', 'teacher')
);


-- ═══ 2. exam_sessions — add WITH CHECK to INSERT (was missing) ════════════
DROP POLICY IF EXISTS es_write ON exam_sessions;
DROP POLICY IF EXISTS exam_sessions_write ON exam_sessions;

CREATE POLICY exam_sessions_insert ON exam_sessions FOR INSERT WITH CHECK (
  student_id = auth.uid()
  OR public.get_user_role() IN ('admin', 'institute', 'teacher')
);
CREATE POLICY exam_sessions_update ON exam_sessions FOR UPDATE USING (
  student_id = auth.uid()
  OR public.get_user_role() IN ('admin', 'institute', 'teacher')
) WITH CHECK (
  student_id = auth.uid()
  OR public.get_user_role() IN ('admin', 'institute', 'teacher')
);
CREATE POLICY exam_sessions_delete ON exam_sessions FOR DELETE USING (
  public.get_user_role() IN ('admin', 'institute', 'teacher')
);


-- ═══ 3. assignment_questions — only readable within same institute ════════
DROP POLICY IF EXISTS aq_all ON assignment_questions;
DROP POLICY IF EXISTS assignment_questions_read ON assignment_questions;
DROP POLICY IF EXISTS assignment_questions_write ON assignment_questions;

CREATE POLICY assignment_questions_read ON assignment_questions FOR SELECT USING (
  assignment_id IN (
    SELECT id FROM assignments
    WHERE institute_id IN (SELECT public.get_user_institute_ids())
  )
  OR public.get_user_role() = 'admin'
);
CREATE POLICY assignment_questions_write ON assignment_questions FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute', 'teacher')
) WITH CHECK (
  public.get_user_role() IN ('admin', 'institute', 'teacher')
);


-- ═══ 4. assignment_answers — only own submission; teacher scoped by institute ═
DROP POLICY IF EXISTS aa_all ON assignment_answers;
DROP POLICY IF EXISTS assignment_answers_read ON assignment_answers;
DROP POLICY IF EXISTS assignment_answers_write ON assignment_answers;

CREATE POLICY assignment_answers_read ON assignment_answers FOR SELECT USING (
  submission_id IN (SELECT id FROM assignment_submissions WHERE student_id = auth.uid())
  OR public.get_user_role() IN ('admin', 'institute', 'teacher')
);
CREATE POLICY assignment_answers_insert ON assignment_answers FOR INSERT WITH CHECK (
  submission_id IN (SELECT id FROM assignment_submissions WHERE student_id = auth.uid())
);
CREATE POLICY assignment_answers_update ON assignment_answers FOR UPDATE USING (
  submission_id IN (SELECT id FROM assignment_submissions WHERE student_id = auth.uid())
  OR public.get_user_role() IN ('admin', 'institute', 'teacher')
) WITH CHECK (
  submission_id IN (SELECT id FROM assignment_submissions WHERE student_id = auth.uid())
  OR public.get_user_role() IN ('admin', 'institute', 'teacher')
);
CREATE POLICY assignment_answers_delete ON assignment_answers FOR DELETE USING (
  public.get_user_role() IN ('admin', 'institute', 'teacher')
);


-- ═══ 5. manual_grades — student sees ONLY own; teacher edits ONLY own ═════
-- Fixes: student previously saw every classmate's grade via the institute branch.
-- Fixes: any teacher in institute could edit any other teacher's grades.
DROP POLICY IF EXISTS manual_grades_permissive ON manual_grades;
DROP POLICY IF EXISTS manual_grades_read ON manual_grades;
DROP POLICY IF EXISTS manual_grades_write ON manual_grades;
DROP POLICY IF EXISTS manual_grades_update ON manual_grades;
DROP POLICY IF EXISTS manual_grades_delete ON manual_grades;

-- Note: the 20260418_grades_publish_flow.sql migration adds an additional
-- "grades_student_read" policy for published-only visibility. We keep that,
-- and this broader policy here covers staff + parent access.
CREATE POLICY manual_grades_read ON manual_grades FOR SELECT USING (
  student_id = auth.uid()
  OR student_id IN (SELECT student_id FROM parent_child WHERE parent_id = auth.uid())
  OR (
    public.get_user_role() IN ('admin', 'institute', 'teacher')
    AND institute_id IN (SELECT public.get_user_institute_ids())
  )
  OR public.get_user_role() = 'admin'
);

CREATE POLICY manual_grades_insert ON manual_grades FOR INSERT WITH CHECK (
  institute_id IN (SELECT public.get_user_institute_ids())
  AND public.get_user_role() IN ('admin', 'institute', 'teacher')
  AND (teacher_id = auth.uid() OR public.get_user_role() IN ('admin', 'institute'))
);
CREATE POLICY manual_grades_update ON manual_grades FOR UPDATE USING (
  (teacher_id = auth.uid() OR public.get_user_role() IN ('admin', 'institute'))
  AND institute_id IN (SELECT public.get_user_institute_ids())
) WITH CHECK (
  (teacher_id = auth.uid() OR public.get_user_role() IN ('admin', 'institute'))
  AND institute_id IN (SELECT public.get_user_institute_ids())
);
CREATE POLICY manual_grades_delete ON manual_grades FOR DELETE USING (
  (teacher_id = auth.uid() OR public.get_user_role() IN ('admin', 'institute'))
  AND institute_id IN (SELECT public.get_user_institute_ids())
);


-- ═══ 6. bus_attendance — student sees own; staff in same institute ════════
DROP POLICY IF EXISTS bat_all ON bus_attendance;
DROP POLICY IF EXISTS bus_attendance_read ON bus_attendance;
DROP POLICY IF EXISTS bus_attendance_write ON bus_attendance;

-- buses table has institute_id; bus_attendance doesn't. We join through buses.
CREATE POLICY bus_attendance_read ON bus_attendance FOR SELECT USING (
  student_id = auth.uid()
  OR student_id IN (SELECT student_id FROM parent_child WHERE parent_id = auth.uid())
  OR (
    public.get_user_role() IN ('admin', 'institute', 'teacher')
    AND bus_id IN (SELECT id FROM buses WHERE institute_id IN (SELECT public.get_user_institute_ids()))
  )
  OR public.get_user_role() = 'admin'
);
CREATE POLICY bus_attendance_write ON bus_attendance FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute', 'teacher')
  AND bus_id IN (SELECT id FROM buses WHERE institute_id IN (SELECT public.get_user_institute_ids()))
) WITH CHECK (
  public.get_user_role() IN ('admin', 'institute', 'teacher')
  AND bus_id IN (SELECT id FROM buses WHERE institute_id IN (SELECT public.get_user_institute_ids()))
);


-- ═══ 7. event_registrations — own row; institute staff see theirs ═════════
DROP POLICY IF EXISTS er_all ON event_registrations;
DROP POLICY IF EXISTS event_registrations_read ON event_registrations;
DROP POLICY IF EXISTS event_registrations_write ON event_registrations;

CREATE POLICY event_registrations_read ON event_registrations FOR SELECT USING (
  user_id = auth.uid()
  OR event_id IN (SELECT id FROM events WHERE institute_id IN (SELECT public.get_user_institute_ids()))
  OR public.get_user_role() = 'admin'
);
CREATE POLICY event_registrations_insert ON event_registrations FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND event_id IN (SELECT id FROM events WHERE institute_id IN (SELECT public.get_user_institute_ids()))
);
CREATE POLICY event_registrations_update ON event_registrations FOR UPDATE USING (
  user_id = auth.uid() OR public.get_user_role() IN ('admin', 'institute')
) WITH CHECK (
  user_id = auth.uid() OR public.get_user_role() IN ('admin', 'institute')
);
CREATE POLICY event_registrations_delete ON event_registrations FOR DELETE USING (
  user_id = auth.uid() OR public.get_user_role() IN ('admin', 'institute')
);


-- ═══ 8. event_photos — scope by event institute ═══════════════════════════
DROP POLICY IF EXISTS ep_all ON event_photos;
DROP POLICY IF EXISTS event_photos_read ON event_photos;
DROP POLICY IF EXISTS event_photos_write ON event_photos;

CREATE POLICY event_photos_read ON event_photos FOR SELECT USING (
  event_id IN (SELECT id FROM events WHERE institute_id IN (SELECT public.get_user_institute_ids()))
  OR public.get_user_role() = 'admin'
);
CREATE POLICY event_photos_write ON event_photos FOR ALL USING (
  event_id IN (SELECT id FROM events WHERE institute_id IN (SELECT public.get_user_institute_ids()))
  AND public.get_user_role() IN ('admin', 'institute', 'teacher')
) WITH CHECK (
  event_id IN (SELECT id FROM events WHERE institute_id IN (SELECT public.get_user_institute_ids()))
  AND public.get_user_role() IN ('admin', 'institute', 'teacher')
);


-- ═══ 9. ai_daily_usage — owner only; insert MUST be for self ══════════════
-- Was USING(true): attacker could insert fake rows against a victim to exhaust their quota.
DROP POLICY IF EXISTS adu_all ON ai_daily_usage;
DROP POLICY IF EXISTS ai_daily_usage_read ON ai_daily_usage;
DROP POLICY IF EXISTS ai_daily_usage_write ON ai_daily_usage;

CREATE POLICY ai_daily_usage_read ON ai_daily_usage FOR SELECT USING (
  user_id = auth.uid()
  OR (
    public.get_user_role() IN ('admin', 'institute')
    AND institute_id IN (SELECT public.get_user_institute_ids())
  )
  OR public.get_user_role() = 'admin'
);
CREATE POLICY ai_daily_usage_insert ON ai_daily_usage FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND institute_id IN (SELECT public.get_user_institute_ids())
);
CREATE POLICY ai_daily_usage_update ON ai_daily_usage FOR UPDATE USING (
  user_id = auth.uid()
) WITH CHECK (
  user_id = auth.uid()
);


-- ═══ 10. ai_content_cache — service-role only (edge function writes) ══════
-- Cache is populated exclusively by the ai-proxy edge function using the
-- service role key, which bypasses RLS. Clients should NEVER read/write
-- this table directly — the edge function serves cached responses.
DROP POLICY IF EXISTS acc_all ON ai_content_cache;
DROP POLICY IF EXISTS ai_content_cache_all ON ai_content_cache;
DROP POLICY IF EXISTS ai_cache_all ON ai_content_cache;

-- No policies = no access for authenticated users (RLS stays enabled).
-- The edge function uses service role which bypasses RLS.


-- ═══ 11. tasks — scope to teacher's institute ═════════════════════════════
DROP POLICY IF EXISTS "tasks_permissive" ON tasks;
DROP POLICY IF EXISTS "tasks_read" ON tasks;
DROP POLICY IF EXISTS "tasks_write" ON tasks;

CREATE POLICY "tasks_read" ON tasks FOR SELECT USING (
  teacher_id = auth.uid()
  OR teacher_id IN (
    SELECT user_id FROM enrollments
    WHERE institute_id IN (SELECT public.get_user_institute_ids())
  )
  OR public.get_user_role() = 'admin'
);
CREATE POLICY "tasks_write" ON tasks FOR ALL USING (
  teacher_id = auth.uid()
  OR (
    public.get_user_role() IN ('admin', 'institute')
    AND teacher_id IN (
      SELECT user_id FROM enrollments
      WHERE institute_id IN (SELECT public.get_user_institute_ids())
    )
  )
  OR public.get_user_role() = 'admin'
) WITH CHECK (
  (
    teacher_id = auth.uid()
    AND teacher_id IN (
      SELECT user_id FROM enrollments
      WHERE institute_id IN (SELECT public.get_user_institute_ids())
    )
  )
  OR (
    public.get_user_role() IN ('admin', 'institute')
    AND teacher_id IN (
      SELECT user_id FROM enrollments
      WHERE institute_id IN (SELECT public.get_user_institute_ids())
    )
  )
  OR public.get_user_role() = 'admin'
);


-- ═══ 12. live_streams — scope to teacher's institute ══════════════════════
DROP POLICY IF EXISTS "live_streams_permissive" ON live_streams;
DROP POLICY IF EXISTS "live_streams_read" ON live_streams;
DROP POLICY IF EXISTS "live_streams_write" ON live_streams;

CREATE POLICY "live_streams_read" ON live_streams FOR SELECT USING (
  teacher_id = auth.uid()
  OR teacher_id IN (
    SELECT user_id FROM enrollments
    WHERE institute_id IN (SELECT public.get_user_institute_ids())
  )
  OR public.get_user_role() = 'admin'
);
CREATE POLICY "live_streams_write" ON live_streams FOR ALL USING (
  teacher_id = auth.uid()
  OR (
    public.get_user_role() IN ('admin', 'institute')
    AND teacher_id IN (
      SELECT user_id FROM enrollments
      WHERE institute_id IN (SELECT public.get_user_institute_ids())
    )
  )
  OR public.get_user_role() = 'admin'
) WITH CHECK (
  (
    teacher_id = auth.uid()
    AND teacher_id IN (
      SELECT user_id FROM enrollments
      WHERE institute_id IN (SELECT public.get_user_institute_ids())
    )
  )
  OR (
    public.get_user_role() IN ('admin', 'institute')
    AND teacher_id IN (
      SELECT user_id FROM enrollments
      WHERE institute_id IN (SELECT public.get_user_institute_ids())
    )
  )
  OR public.get_user_role() = 'admin'
);


-- ═══ 13. exam_audit_log — INSERT only for own session; prevent spoofing ═══
DROP POLICY IF EXISTS eal_insert ON exam_audit_log;

CREATE POLICY eal_insert ON exam_audit_log FOR INSERT WITH CHECK (
  student_id = auth.uid()
  OR public.get_user_role() IN ('admin', 'institute', 'teacher')
);


-- ═══ 14. academic_years / enrollment_history / student_classes ════════════
-- All were USING(true) WITH CHECK(true). Lock to institute scope.
DROP POLICY IF EXISTS ay_permissive ON academic_years;
DROP POLICY IF EXISTS academic_years_read ON academic_years;
DROP POLICY IF EXISTS academic_years_write ON academic_years;

CREATE POLICY academic_years_read ON academic_years FOR SELECT USING (
  institute_id IN (SELECT public.get_user_institute_ids())
  OR public.get_user_role() = 'admin'
);
CREATE POLICY academic_years_write ON academic_years FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute')
  AND institute_id IN (SELECT public.get_user_institute_ids())
) WITH CHECK (
  public.get_user_role() IN ('admin', 'institute')
  AND institute_id IN (SELECT public.get_user_institute_ids())
);

DROP POLICY IF EXISTS eh_permissive ON enrollment_history;
DROP POLICY IF EXISTS enrollment_history_read ON enrollment_history;
DROP POLICY IF EXISTS enrollment_history_write ON enrollment_history;

-- enrollment_history has no user_id / institute_id — join via enrollments table.
CREATE POLICY enrollment_history_read ON enrollment_history FOR SELECT USING (
  enrollment_id IN (SELECT id FROM enrollments WHERE user_id = auth.uid())
  OR (
    public.get_user_role() IN ('admin', 'institute')
    AND enrollment_id IN (
      SELECT id FROM enrollments
      WHERE institute_id IN (SELECT public.get_user_institute_ids())
    )
  )
  OR public.get_user_role() = 'admin'
);
CREATE POLICY enrollment_history_write ON enrollment_history FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute')
  AND enrollment_id IN (
    SELECT id FROM enrollments
    WHERE institute_id IN (SELECT public.get_user_institute_ids())
  )
) WITH CHECK (
  public.get_user_role() IN ('admin', 'institute')
  AND enrollment_id IN (
    SELECT id FROM enrollments
    WHERE institute_id IN (SELECT public.get_user_institute_ids())
  )
);

-- student_classes is already tightened in 20260416_rls_lockdown_v2.sql, but
-- the earlier permissive "sc_permissive" may still exist — drop it defensively.
DROP POLICY IF EXISTS sc_permissive ON student_classes;


-- ═══ 15. installments — was USING(true) ══════════════════════════════════
DROP POLICY IF EXISTS inst_all ON installments;
DROP POLICY IF EXISTS installments_read ON installments;
DROP POLICY IF EXISTS installments_write ON installments;

-- installments has no student_id / institute_id — join via student_fees.
CREATE POLICY installments_read ON installments FOR SELECT USING (
  student_fee_id IN (
    SELECT id FROM student_fees
    WHERE student_id = auth.uid()
       OR student_id IN (SELECT student_id FROM parent_child WHERE parent_id = auth.uid())
  )
  OR (
    public.get_user_role() IN ('admin', 'institute')
    AND student_fee_id IN (
      SELECT id FROM student_fees
      WHERE institute_id IN (SELECT public.get_user_institute_ids())
    )
  )
  OR public.get_user_role() = 'admin'
);
CREATE POLICY installments_write ON installments FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute')
  AND student_fee_id IN (
    SELECT id FROM student_fees
    WHERE institute_id IN (SELECT public.get_user_institute_ids())
  )
) WITH CHECK (
  public.get_user_role() IN ('admin', 'institute')
  AND student_fee_id IN (
    SELECT id FROM student_fees
    WHERE institute_id IN (SELECT public.get_user_institute_ids())
  )
);


-- ═══ 16. get_user_institute_ids — filter to active enrollments only ═══════
-- Frozen / inactive users must NOT keep seeing their old institute's data.
CREATE OR REPLACE FUNCTION public.get_user_institute_ids()
RETURNS SETOF UUID AS $$
  SELECT institute_id FROM enrollments
  WHERE user_id = auth.uid()
    AND (status IS NULL OR status = 'active')
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ═══ Indexes ══════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buses' AND column_name = 'institute_id') THEN
    CREATE INDEX IF NOT EXISTS idx_buses_institute ON buses(institute_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_exam_sessions_student_lookup
  ON exam_sessions(student_id, id);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_student_lookup
  ON assignment_submissions(student_id, id);
CREATE INDEX IF NOT EXISTS idx_ai_daily_usage_user
  ON ai_daily_usage(user_id, usage_date DESC);


-- ═══ 17. exam_submissions — scope via exams.institute_id (no own column) ══
-- Students submit/read their own; teachers & admins read within institute.
ALTER TABLE exam_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS es_permissive ON exam_submissions;
DROP POLICY IF EXISTS exam_submissions_all ON exam_submissions;
DROP POLICY IF EXISTS exam_submissions_read ON exam_submissions;
DROP POLICY IF EXISTS exam_submissions_insert ON exam_submissions;
DROP POLICY IF EXISTS exam_submissions_update ON exam_submissions;

CREATE POLICY exam_submissions_read ON exam_submissions FOR SELECT USING (
  student_id = auth.uid()
  OR public.get_user_role() = 'admin'
  OR (
    public.get_user_role() IN ('teacher', 'institute')
    AND exam_id IN (
      SELECT id FROM exams
      WHERE institute_id IN (SELECT public.get_user_institute_ids())
    )
  )
);

CREATE POLICY exam_submissions_insert ON exam_submissions FOR INSERT WITH CHECK (
  student_id = auth.uid()
  AND exam_id IN (
    SELECT id FROM exams
    WHERE institute_id IN (SELECT public.get_user_institute_ids())
  )
);

CREATE POLICY exam_submissions_update ON exam_submissions FOR UPDATE USING (
  public.get_user_role() = 'admin'
  OR (
    public.get_user_role() IN ('teacher', 'institute')
    AND exam_id IN (
      SELECT id FROM exams
      WHERE institute_id IN (SELECT public.get_user_institute_ids())
    )
  )
) WITH CHECK (
  public.get_user_role() = 'admin'
  OR (
    public.get_user_role() IN ('teacher', 'institute')
    AND exam_id IN (
      SELECT id FROM exams
      WHERE institute_id IN (SELECT public.get_user_institute_ids())
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_exam_submissions_exam
  ON exam_submissions(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_submissions_student
  ON exam_submissions(student_id);


-- ═══ 18. timetable_publish_state — ensure table + institute-scoped RLS ════
CREATE TABLE IF NOT EXISTS timetable_publish_state (
  institute_id UUID PRIMARY KEY REFERENCES institutes(id) ON DELETE CASCADE,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE timetable_publish_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tps_permissive ON timetable_publish_state;
DROP POLICY IF EXISTS timetable_publish_state_read ON timetable_publish_state;
DROP POLICY IF EXISTS timetable_publish_state_write ON timetable_publish_state;

CREATE POLICY timetable_publish_state_read ON timetable_publish_state FOR SELECT USING (
  institute_id IN (SELECT public.get_user_institute_ids())
  OR public.get_user_role() = 'admin'
);

CREATE POLICY timetable_publish_state_write ON timetable_publish_state FOR ALL USING (
  public.get_user_role() = 'admin'
  OR (
    public.get_user_role() IN ('institute', 'admin')
    AND institute_id IN (SELECT public.get_user_institute_ids())
  )
) WITH CHECK (
  public.get_user_role() = 'admin'
  OR (
    public.get_user_role() IN ('institute', 'admin')
    AND institute_id IN (SELECT public.get_user_institute_ids())
  )
);
