-- ═══════════════════════════════════════════════════
-- Enhanced Interactive Schedule System
-- Feature Flag: interactive_schedule
-- ═══════════════════════════════════════════════════

-- 1. Add status and notes to timetables
ALTER TABLE timetables ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE timetables ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE timetables ADD COLUMN IF NOT EXISTS substitute_teacher_id UUID;
ALTER TABLE timetables ADD COLUMN IF NOT EXISTS color TEXT;

DO $$ BEGIN
  ALTER TABLE timetables ADD CONSTRAINT timetables_status_check
    CHECK (status IN ('active', 'cancelled', 'substitute'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Schedule changes log
CREATE TABLE IF NOT EXISTS schedule_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timetable_id UUID NOT NULL,
  institute_id UUID NOT NULL,
  change_type TEXT NOT NULL, -- 'created', 'updated', 'cancelled', 'substitute', 'restored'
  old_data JSONB,
  new_data JSONB,
  changed_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Schedule notifications
CREATE TABLE IF NOT EXISTS schedule_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timetable_id UUID NOT NULL,
  institute_id UUID NOT NULL,
  notify_type TEXT NOT NULL, -- 'reminder', 'cancellation', 'change'
  notify_at TIMESTAMPTZ NOT NULL,
  is_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. RLS
ALTER TABLE schedule_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY schch_all ON schedule_changes FOR ALL USING (
  institute_id IN (SELECT public.get_user_institute_ids())
  OR public.get_user_role() = 'admin'
);

ALTER TABLE schedule_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY schn_all ON schedule_notifications FOR ALL USING (
  institute_id IN (SELECT public.get_user_institute_ids())
  OR public.get_user_role() = 'admin'
);
