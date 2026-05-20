-- ═══════════════════════════════════════════════════════════════════════
-- Fix: "Database error deleting user" when admin tries to delete an account
-- ═══════════════════════════════════════════════════════════════════════
-- Root cause: `timetable_publish_state.published_by` referenced auth.users(id)
-- without an ON DELETE clause. PostgreSQL defaulted to NO ACTION, so whenever a
-- target user had ever published a timetable, the auth.admin.deleteUser() call
-- failed with a generic "Database error deleting user" message.
--
-- Fix: switch to ON DELETE SET NULL — the audit pointer becomes NULL when the
-- publisher is deleted, but the published_at row is preserved.
-- ═══════════════════════════════════════════════════════════════════════

-- timetable_publish_state.published_by → auth.users(id) ON DELETE SET NULL
ALTER TABLE IF EXISTS public.timetable_publish_state
  DROP CONSTRAINT IF EXISTS timetable_publish_state_published_by_fkey;

ALTER TABLE IF EXISTS public.timetable_publish_state
  ADD CONSTRAINT timetable_publish_state_published_by_fkey
  FOREIGN KEY (published_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Belt-and-suspenders: sweep other FK refs to public.users that may block the
-- post-auth user row deletion. Each column gets ON DELETE SET NULL so audit
-- rows survive but stop blocking deletion.
DO $$
BEGIN
  -- manual_grades.teacher_id → users(id) ON DELETE SET NULL
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='manual_grades') THEN
    BEGIN
      ALTER TABLE public.manual_grades
        DROP CONSTRAINT IF EXISTS manual_grades_teacher_id_fkey;
      ALTER TABLE public.manual_grades
        ALTER COLUMN teacher_id DROP NOT NULL;
      ALTER TABLE public.manual_grades
        ADD CONSTRAINT manual_grades_teacher_id_fkey
        FOREIGN KEY (teacher_id) REFERENCES public.users(id) ON DELETE SET NULL;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- promotion_log.promoted_by → users(id) ON DELETE SET NULL
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='promotion_log') THEN
    BEGIN
      ALTER TABLE public.promotion_log
        DROP CONSTRAINT IF EXISTS promotion_log_promoted_by_fkey;
      ALTER TABLE public.promotion_log
        ADD CONSTRAINT promotion_log_promoted_by_fkey
        FOREIGN KEY (promoted_by) REFERENCES public.users(id) ON DELETE SET NULL;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- attendance_devices.created_by → users(id) ON DELETE SET NULL
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='attendance_devices') THEN
    BEGIN
      ALTER TABLE public.attendance_devices
        DROP CONSTRAINT IF EXISTS attendance_devices_created_by_fkey;
      ALTER TABLE public.attendance_devices
        ADD CONSTRAINT attendance_devices_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
END $$;
