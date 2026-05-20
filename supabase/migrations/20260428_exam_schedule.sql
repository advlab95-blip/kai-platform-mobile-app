-- =============================================================================
-- Migration: 20260428_exam_schedule.sql
-- Purpose : Institute paper-exam schedule (separate from in-app `exams`).
--
-- Tables : exam_schedules + exam_schedule_items
-- RPCs   : generate_exam_schedule_items, publish_exam_schedule, update_exam_schedule_item
--
-- Multi-tenant: institute_id NOT NULL on every row + RLS that scopes to enrollments.
-- Idempotent  : CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS, CREATE OR REPLACE.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.exam_schedules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id  UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'published', 'cancelled')),
  published_at  TIMESTAMPTZ,
  published_by  UUID REFERENCES public.users(id),
  created_by    UUID NOT NULL REFERENCES public.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exam_schedules_institute
  ON public.exam_schedules (institute_id, status);

CREATE TABLE IF NOT EXISTS public.exam_schedule_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id      UUID NOT NULL REFERENCES public.exam_schedules(id) ON DELETE CASCADE,
  institute_id     UUID NOT NULL REFERENCES public.institutes(id)     ON DELETE CASCADE,
  class_id         UUID REFERENCES public.classes(id)                  ON DELETE CASCADE,
  section_id       UUID REFERENCES public.sections(id)                 ON DELETE SET NULL,
  subject_id       UUID REFERENCES public.subjects(id)                 ON DELETE SET NULL,
  subject_name     TEXT NOT NULL,
  teacher_id       UUID REFERENCES public.users(id)                    ON DELETE SET NULL,
  exam_date        DATE NOT NULL,
  start_time       TIME NOT NULL,
  duration_minutes INT  NOT NULL DEFAULT 60,
  hall             TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exam_schedule_items_schedule
  ON public.exam_schedule_items (schedule_id);
CREATE INDEX IF NOT EXISTS idx_exam_schedule_items_institute
  ON public.exam_schedule_items (institute_id);
CREATE INDEX IF NOT EXISTS idx_exam_schedule_items_class_date
  ON public.exam_schedule_items (class_id, exam_date);
CREATE INDEX IF NOT EXISTS idx_exam_schedule_items_teacher_date
  ON public.exam_schedule_items (teacher_id, exam_date);

-- -----------------------------------------------------------------------------
-- 2. RLS
-- -----------------------------------------------------------------------------

ALTER TABLE public.exam_schedules      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_schedule_items ENABLE ROW LEVEL SECURITY;

-- Admin (platform) + institute_admin write within their institute
DROP POLICY IF EXISTS exam_schedules_admin_all ON public.exam_schedules;
CREATE POLICY exam_schedules_admin_all ON public.exam_schedules
  FOR ALL TO authenticated
  USING (institute_id IN (
    SELECT institute_id FROM public.enrollments
    WHERE user_id = auth.uid() AND status = 'active'
      AND role IN ('admin','institute_admin')
  ))
  WITH CHECK (institute_id IN (
    SELECT institute_id FROM public.enrollments
    WHERE user_id = auth.uid() AND status = 'active'
      AND role IN ('admin','institute_admin')
  ));

-- Anyone in the institute reads published schedules
DROP POLICY IF EXISTS exam_schedules_published_read ON public.exam_schedules;
CREATE POLICY exam_schedules_published_read ON public.exam_schedules
  FOR SELECT TO authenticated
  USING (status = 'published' AND institute_id IN (
    SELECT institute_id FROM public.enrollments
    WHERE user_id = auth.uid() AND status = 'active'
  ));

DROP POLICY IF EXISTS exam_schedule_items_admin_all ON public.exam_schedule_items;
CREATE POLICY exam_schedule_items_admin_all ON public.exam_schedule_items
  FOR ALL TO authenticated
  USING (institute_id IN (
    SELECT institute_id FROM public.enrollments
    WHERE user_id = auth.uid() AND status = 'active'
      AND role IN ('admin','institute_admin')
  ))
  WITH CHECK (institute_id IN (
    SELECT institute_id FROM public.enrollments
    WHERE user_id = auth.uid() AND status = 'active'
      AND role IN ('admin','institute_admin')
  ));

DROP POLICY IF EXISTS exam_schedule_items_student_read ON public.exam_schedule_items;
CREATE POLICY exam_schedule_items_student_read ON public.exam_schedule_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.exam_schedules es
            WHERE es.id = schedule_id AND es.status = 'published')
    AND class_id IN (
      SELECT class_id FROM public.student_classes WHERE student_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS exam_schedule_items_teacher_read ON public.exam_schedule_items;
CREATE POLICY exam_schedule_items_teacher_read ON public.exam_schedule_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.exam_schedules es
            WHERE es.id = schedule_id AND es.status = 'published')
    AND teacher_id = auth.uid()
  );

DROP POLICY IF EXISTS exam_schedule_items_parent_read ON public.exam_schedule_items;
CREATE POLICY exam_schedule_items_parent_read ON public.exam_schedule_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.exam_schedules es
            WHERE es.id = schedule_id AND es.status = 'published')
    AND class_id IN (
      SELECT sc.class_id FROM public.student_classes sc
      JOIN public.parent_child pc ON pc.student_id = sc.student_id
      WHERE pc.parent_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- 3. RPCs
-- -----------------------------------------------------------------------------

-- Bulk-create items: cross-join classes × subjects, pack N per day, auto-assign
-- teacher_id from teacher_assignments. Wipes previous items so re-running is safe.
CREATE OR REPLACE FUNCTION public.generate_exam_schedule_items(
  p_schedule_id        uuid,
  p_class_ids          uuid[],
  p_subject_ids        uuid[],
  p_start_date         date,
  p_default_start_time time DEFAULT '09:00:00',
  p_default_duration   int  DEFAULT 60,
  p_subjects_per_day   int  DEFAULT 1
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institute_id uuid;
  v_count int := 0;
  v_class uuid;
  v_subject uuid;
  v_day_offset int;
  v_subject_index int;
  v_subject_name text;
  v_teacher uuid;
BEGIN
  SELECT institute_id INTO v_institute_id FROM exam_schedules WHERE id = p_schedule_id;
  IF v_institute_id IS NULL THEN
    RAISE EXCEPTION 'schedule_not_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM enrollments
    WHERE user_id = auth.uid() AND institute_id = v_institute_id
      AND role IN ('admin','institute_admin') AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  DELETE FROM exam_schedule_items WHERE schedule_id = p_schedule_id;

  IF p_subjects_per_day IS NULL OR p_subjects_per_day < 1 THEN
    p_subjects_per_day := 1;
  END IF;

  FOREACH v_class IN ARRAY p_class_ids LOOP
    v_subject_index := 0;
    FOREACH v_subject IN ARRAY p_subject_ids LOOP
      SELECT name INTO v_subject_name FROM subjects WHERE id = v_subject;
      IF v_subject_name IS NULL THEN CONTINUE; END IF;

      v_day_offset := v_subject_index / p_subjects_per_day;

      SELECT ta.teacher_id INTO v_teacher
      FROM teacher_assignments ta
      WHERE ta.subject_id = v_subject AND ta.class_id = v_class
      LIMIT 1;

      INSERT INTO exam_schedule_items
        (schedule_id, institute_id, class_id, subject_id, subject_name,
         teacher_id, exam_date, start_time, duration_minutes)
      VALUES
        (p_schedule_id, v_institute_id, v_class, v_subject, v_subject_name,
         v_teacher,
         p_start_date + (v_day_offset || ' days')::interval,
         p_default_start_time, p_default_duration);

      v_count := v_count + 1;
      v_subject_index := v_subject_index + 1;
    END LOOP;
  END LOOP;

  RETURN v_count;
END $$;

REVOKE EXECUTE ON FUNCTION public.generate_exam_schedule_items(uuid, uuid[], uuid[], date, time, int, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.generate_exam_schedule_items(uuid, uuid[], uuid[], date, time, int, int) TO authenticated;

-- Publish: flip status + fan-out notifications to affected students/teachers/parents.
CREATE OR REPLACE FUNCTION public.publish_exam_schedule(p_schedule_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institute_id uuid;
  v_name text;
  v_actor_name text;
BEGIN
  SELECT institute_id, name INTO v_institute_id, v_name
  FROM exam_schedules WHERE id = p_schedule_id;

  IF v_institute_id IS NULL THEN
    RAISE EXCEPTION 'schedule_not_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM enrollments
    WHERE user_id = auth.uid() AND institute_id = v_institute_id
      AND role IN ('admin','institute_admin') AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT full_name INTO v_actor_name FROM users WHERE id = auth.uid();

  UPDATE exam_schedules SET
    status = 'published',
    published_at = now(),
    published_by = auth.uid(),
    updated_at = now()
  WHERE id = p_schedule_id;

  -- Students (only those in classes that are part of this schedule)
  INSERT INTO notifications
    (sender_role, sender_id, sender_name, recipient_role, recipient_id,
     institute_id, title, message, type, category, metadata)
  SELECT DISTINCT
    'admin', auth.uid(), v_actor_name,
    'student', sc.student_id,
    v_institute_id,
    'جدول امتحانات جديد',
    v_name || ' — تفقد جدولك من قسم جدول الامتحانات',
    'exam_schedule_published',
    'academic',
    jsonb_build_object('schedule_id', p_schedule_id)
  FROM exam_schedule_items esi
  JOIN student_classes sc ON sc.class_id = esi.class_id
  WHERE esi.schedule_id = p_schedule_id;

  -- Teachers (proctoring at least one slot)
  INSERT INTO notifications
    (sender_role, sender_id, sender_name, recipient_role, recipient_id,
     institute_id, title, message, type, category, metadata)
  SELECT DISTINCT
    'admin', auth.uid(), v_actor_name,
    'teacher', esi.teacher_id,
    v_institute_id,
    'جدول امتحانات جديد',
    v_name || ' — تفقد أيام مراقبتك',
    'exam_schedule_published',
    'academic',
    jsonb_build_object('schedule_id', p_schedule_id)
  FROM exam_schedule_items esi
  WHERE esi.schedule_id = p_schedule_id AND esi.teacher_id IS NOT NULL;

  -- Parents
  INSERT INTO notifications
    (sender_role, sender_id, sender_name, recipient_role, recipient_id,
     institute_id, title, message, type, category, metadata)
  SELECT DISTINCT
    'admin', auth.uid(), v_actor_name,
    'parent', pc.parent_id,
    v_institute_id,
    'جدول امتحانات أبنائك',
    v_name,
    'exam_schedule_published',
    'academic',
    jsonb_build_object('schedule_id', p_schedule_id)
  FROM exam_schedule_items esi
  JOIN student_classes sc ON sc.class_id = esi.class_id
  JOIN parent_child pc ON pc.student_id = sc.student_id
  WHERE esi.schedule_id = p_schedule_id;

  RETURN jsonb_build_object(
    'success', true,
    'schedule_id', p_schedule_id,
    'published_at', now()
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.publish_exam_schedule(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.publish_exam_schedule(uuid) TO authenticated;

-- Patch one slot. When schedule is published, sends update notifications to all
-- affected parties (class students, the new teacher, parents).
CREATE OR REPLACE FUNCTION public.update_exam_schedule_item(
  p_item_id    uuid,
  p_exam_date  date,
  p_start_time time,
  p_duration   int,
  p_hall       text,
  p_teacher_id uuid,
  p_notes      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institute_id uuid;
  v_schedule_id uuid;
  v_class_id uuid;
  v_subject_name text;
  v_status text;
  v_actor_name text;
BEGIN
  SELECT esi.institute_id, esi.schedule_id, esi.class_id, esi.subject_name, es.status
    INTO v_institute_id, v_schedule_id, v_class_id, v_subject_name, v_status
  FROM exam_schedule_items esi
  JOIN exam_schedules es ON es.id = esi.schedule_id
  WHERE esi.id = p_item_id;

  IF v_institute_id IS NULL THEN
    RAISE EXCEPTION 'item_not_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM enrollments
    WHERE user_id = auth.uid() AND institute_id = v_institute_id
      AND role IN ('admin','institute_admin') AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT full_name INTO v_actor_name FROM users WHERE id = auth.uid();

  UPDATE exam_schedule_items SET
    exam_date = p_exam_date,
    start_time = p_start_time,
    duration_minutes = p_duration,
    hall = p_hall,
    teacher_id = p_teacher_id,
    notes = p_notes,
    updated_at = now()
  WHERE id = p_item_id;

  IF v_status = 'published' THEN
    -- Class students
    INSERT INTO notifications
      (sender_role, sender_id, sender_name, recipient_role, recipient_id,
       institute_id, title, message, type, category, metadata)
    SELECT DISTINCT
      'admin', auth.uid(), v_actor_name,
      'student', sc.student_id,
      v_institute_id,
      'تعديل في جدول الامتحانات',
      v_subject_name || ' — التاريخ/الوقت/القاعة محدّث',
      'exam_schedule_updated',
      'academic',
      jsonb_build_object('schedule_id', v_schedule_id, 'item_id', p_item_id)
    FROM student_classes sc WHERE sc.class_id = v_class_id;

    -- New teacher
    IF p_teacher_id IS NOT NULL THEN
      INSERT INTO notifications
        (sender_role, sender_id, sender_name, recipient_role, recipient_id,
         institute_id, title, message, type, category, metadata)
      VALUES
        ('admin', auth.uid(), v_actor_name,
         'teacher', p_teacher_id,
         v_institute_id,
         'تعديل في جدول الامتحانات',
         v_subject_name || ' — تم تحديث موعد المراقبة',
         'exam_schedule_updated',
         'academic',
         jsonb_build_object('schedule_id', v_schedule_id, 'item_id', p_item_id));
    END IF;

    -- Parents
    INSERT INTO notifications
      (sender_role, sender_id, sender_name, recipient_role, recipient_id,
       institute_id, title, message, type, category, metadata)
    SELECT DISTINCT
      'admin', auth.uid(), v_actor_name,
      'parent', pc.parent_id,
      v_institute_id,
      'تعديل في جدول امتحانات أبنائك',
      v_subject_name,
      'exam_schedule_updated',
      'academic',
      jsonb_build_object('schedule_id', v_schedule_id, 'item_id', p_item_id)
    FROM student_classes sc
    JOIN parent_child pc ON pc.student_id = sc.student_id
    WHERE sc.class_id = v_class_id;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.update_exam_schedule_item(uuid, date, time, int, text, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_exam_schedule_item(uuid, date, time, int, text, uuid, text) TO authenticated;

COMMIT;
