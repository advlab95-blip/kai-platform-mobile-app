-- ============================================================
-- Student Promotion & Academic Year System
-- Bulk promote, graduate, repeat + year open/close
-- ============================================================

-- Promotion history log
CREATE TABLE IF NOT EXISTS promotion_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id),
  academic_year TEXT NOT NULL,
  from_class_id UUID REFERENCES classes(id),
  to_class_id UUID REFERENCES classes(id),
  action TEXT NOT NULL CHECK (action IN ('promote', 'repeat', 'graduate')),
  promoted_by UUID REFERENCES users(id),
  promoted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

-- Academic years per institute
CREATE TABLE IF NOT EXISTS academic_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- e.g. "2025-2026"
  start_date DATE,
  end_date DATE,
  is_current BOOLEAN NOT NULL DEFAULT false,
  is_closed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(institute_id, name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_promo_logs_inst ON promotion_logs(institute_id);
CREATE INDEX IF NOT EXISTS idx_promo_logs_student ON promotion_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_academic_years_inst ON academic_years(institute_id);

-- RLS
ALTER TABLE promotion_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;

CREATE POLICY promo_logs_admin ON promotion_logs FOR ALL
  USING (public.get_user_role() IN ('admin', 'institute'));

CREATE POLICY promo_logs_read ON promotion_logs FOR SELECT
  USING (student_id = auth.uid());

CREATE POLICY academic_years_admin ON academic_years FOR ALL
  USING (public.get_user_role() IN ('admin', 'institute'));

CREATE POLICY academic_years_read ON academic_years FOR SELECT
  USING (institute_id IN (SELECT e.institute_id FROM enrollments e WHERE e.user_id = auth.uid()));
