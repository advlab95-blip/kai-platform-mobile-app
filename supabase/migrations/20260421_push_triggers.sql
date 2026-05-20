-- =====================================================================
-- Phase 4.4 — Auto-push triggers
-- =====================================================================
-- Invokes the `send-push` Edge Function from server-side events:
--   • attendance row marked 'absent'  → parents of that student
--   • grade_entries insert            → student + parents
--   • assignments insert              → students in class/section
--   • student_fees status='overdue'   → parents of student
--
-- All HTTP calls are async (fire-and-forget) via `pg_net.http_post` to avoid
-- blocking the original INSERT. If `pg_net` or the edge function is offline
-- the row still persists; in-app notifications via Realtime still work via
-- the existing `notifications` inserts in app code.
--
-- Defensive: every trigger is wrapped in a DO block that checks its source
-- table exists before creating. Missing tables → trigger silently skipped.
-- =====================================================================

-- Require pg_net for outbound HTTP. Already present on Supabase hosted DBs.
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ---------------------------------------------------------------------
-- Helper: POST body to the send-push edge function with service role auth.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._send_push_invoke(p_payload JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp, vault
AS $fn$
DECLARE
  v_url     TEXT;
  v_key     TEXT;
BEGIN
  -- Read secrets from Supabase Vault. Expected secret names:
  --   project_url      → https://<ref>.supabase.co
  --   service_role_key → <service-role-jwt>
  -- Create via Dashboard → Database → Vault, or with:
  --   SELECT vault.create_secret('https://<ref>.supabase.co', 'project_url');
  --   SELECT vault.create_secret('<key>', 'service_role_key');
  BEGIN
    SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;

    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    -- Vault may be unavailable on self-hosted; skip silently.
    RETURN;
  END;

  IF v_url IS NULL OR v_key IS NULL THEN
    -- Secrets not configured yet — skip silently so business write still succeeds.
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url || '/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := p_payload,
    timeout_milliseconds := 5000
  );
END
$fn$;

-- ---------------------------------------------------------------------
-- 1) Attendance → push parent on absent
-- ---------------------------------------------------------------------
DO $tr1$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='attendance') THEN
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public._trg_attendance_push()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $body$
    DECLARE
      v_recipients UUID[];
      v_student_name TEXT;
    BEGIN
      IF NEW.status <> 'absent' THEN RETURN NEW; END IF;

      -- Collect parent user_ids from parent_child
      SELECT array_agg(parent_id) INTO v_recipients
      FROM public.parent_child
      WHERE child_id = NEW.student_id;

      IF v_recipients IS NULL OR array_length(v_recipients, 1) = 0 THEN
        RETURN NEW;
      END IF;

      SELECT full_name INTO v_student_name FROM public.users WHERE id = NEW.student_id;

      PERFORM public._send_push_invoke(jsonb_build_object(
        'user_ids', to_jsonb(v_recipients),
        'title',    'تنبيه غياب',
        'body',     COALESCE(v_student_name, 'الطالب') || ' غائب اليوم',
        'type',     'attendance',
        'category', 'academic',
        'institute_id', NEW.institute_id,
        'data',     jsonb_build_object('route', '/(parent)/academic', 'student_id', NEW.student_id)
      ));

      RETURN NEW;
    END
    $body$;
  $fn$;

  EXECUTE 'DROP TRIGGER IF EXISTS trg_attendance_push ON public.attendance';
  EXECUTE 'CREATE TRIGGER trg_attendance_push
           AFTER INSERT OR UPDATE OF status ON public.attendance
           FOR EACH ROW EXECUTE FUNCTION public._trg_attendance_push()';
END
$tr1$;

-- ---------------------------------------------------------------------
-- 2) Grade entries → push student + parents
-- ---------------------------------------------------------------------
DO $tr2$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='grade_entries') THEN
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public._trg_grade_push()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $body$
    DECLARE
      v_recipients UUID[];
      v_parents UUID[];
      v_pct NUMERIC;
    BEGIN
      -- Student themselves
      v_recipients := ARRAY[NEW.student_id];

      -- Plus parents
      SELECT array_agg(parent_id) INTO v_parents
      FROM public.parent_child
      WHERE child_id = NEW.student_id;

      IF v_parents IS NOT NULL THEN
        v_recipients := v_recipients || v_parents;
      END IF;

      v_pct := CASE WHEN NEW.max_score > 0
                    THEN ROUND((NEW.score / NEW.max_score) * 100, 0)
                    ELSE NULL END;

      PERFORM public._send_push_invoke(jsonb_build_object(
        'user_ids', to_jsonb(v_recipients),
        'title',    'درجة جديدة: ' || COALESCE(NEW.subject_name, ''),
        'body',     COALESCE(NEW.score::TEXT, '') || '/' || COALESCE(NEW.max_score::TEXT, '')
                    || CASE WHEN v_pct IS NOT NULL THEN ' (' || v_pct::TEXT || '%)' ELSE '' END,
        'type',     'grade',
        'category', 'academic',
        'institute_id', NEW.institute_id,
        'data',     jsonb_build_object('route', '/(student)/stats', 'grade_id', NEW.id)
      ));

      RETURN NEW;
    END
    $body$;
  $fn$;

  EXECUTE 'DROP TRIGGER IF EXISTS trg_grade_push ON public.grade_entries';
  EXECUTE 'CREATE TRIGGER trg_grade_push
           AFTER INSERT ON public.grade_entries
           FOR EACH ROW EXECUTE FUNCTION public._trg_grade_push()';
END
$tr2$;

-- ---------------------------------------------------------------------
-- 3) Student fees overdue → push parents
-- ---------------------------------------------------------------------
DO $tr3$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='student_fees') THEN
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public._trg_fees_overdue_push()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $body$
    DECLARE
      v_recipients UUID[];
      v_student_name TEXT;
    BEGIN
      IF NEW.status <> 'overdue' THEN RETURN NEW; END IF;
      IF TG_OP = 'UPDATE' AND OLD.status = 'overdue' THEN RETURN NEW; END IF;

      SELECT array_agg(parent_id) INTO v_recipients
      FROM public.parent_child
      WHERE child_id = NEW.student_id;

      IF v_recipients IS NULL THEN RETURN NEW; END IF;

      SELECT full_name INTO v_student_name FROM public.users WHERE id = NEW.student_id;

      PERFORM public._send_push_invoke(jsonb_build_object(
        'user_ids', to_jsonb(v_recipients),
        'title',    'قسط متأخر',
        'body',     COALESCE(v_student_name, 'الطالب') || ' — المبلغ المتبقي: '
                    || COALESCE(NEW.remaining_amount::TEXT, '0'),
        'type',     'fee',
        'category', 'financial',
        'institute_id', NEW.institute_id,
        'data',     jsonb_build_object('route', '/(parent)/fees', 'fee_id', NEW.id)
      ));

      RETURN NEW;
    END
    $body$;
  $fn$;

  EXECUTE 'DROP TRIGGER IF EXISTS trg_fees_overdue_push ON public.student_fees';
  EXECUTE 'CREATE TRIGGER trg_fees_overdue_push
           AFTER INSERT OR UPDATE OF status ON public.student_fees
           FOR EACH ROW EXECUTE FUNCTION public._trg_fees_overdue_push()';
END
$tr3$;

-- ---------------------------------------------------------------------
-- 4) Assignments → push students in class/section (optional — only if
--    table exists and has the expected shape)
-- ---------------------------------------------------------------------
DO $tr4$
DECLARE
  has_table BOOLEAN;
  has_class BOOLEAN;
  has_section BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='assignments') INTO has_table;
  IF NOT has_table THEN RETURN; END IF;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='assignments' AND column_name='class_id') INTO has_class;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='assignments' AND column_name='section_id') INTO has_section;

  -- Only create if we have at least one scoping column to find students with.
  IF NOT (has_class OR has_section) THEN RETURN; END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public._trg_assignment_push()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $body$
    DECLARE
      v_recipients UUID[];
    BEGIN
      -- Prefer class_id, else section_id. Either column may not exist on
      -- every deployment — handled by caller DO block.
      BEGIN
        SELECT array_agg(user_id) INTO v_recipients
        FROM public.enrollments
        WHERE role = 'student'
          AND status = 'active'
          AND (
            (class_id   IS NOT NULL AND class_id   = NEW.class_id) OR
            (section_id IS NOT NULL AND section_id = NEW.section_id)
          );
      EXCEPTION WHEN undefined_column THEN
        v_recipients := NULL;
      END;

      IF v_recipients IS NULL OR array_length(v_recipients, 1) = 0 THEN RETURN NEW; END IF;

      PERFORM public._send_push_invoke(jsonb_build_object(
        'user_ids', to_jsonb(v_recipients),
        'title',    'واجب جديد',
        'body',     COALESCE(NEW.title, 'واجب جديد متاح'),
        'type',     'assignment',
        'category', 'academic',
        'institute_id', NEW.institute_id,
        'data',     jsonb_build_object('route', '/(student)', 'assignment_id', NEW.id)
      ));

      RETURN NEW;
    END
    $body$;
  $fn$;

  EXECUTE 'DROP TRIGGER IF EXISTS trg_assignment_push ON public.assignments';
  EXECUTE 'CREATE TRIGGER trg_assignment_push
           AFTER INSERT ON public.assignments
           FOR EACH ROW EXECUTE FUNCTION public._trg_assignment_push()';
END
$tr4$;

COMMENT ON FUNCTION public._send_push_invoke(JSONB) IS
  'Phase 4 — invokes send-push edge function. Requires app.settings.supabase_url / app.settings.service_role_key set (idempotent no-op if missing).';
