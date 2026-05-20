-- ═══════════════════════════════════════════════════
-- FIX: Proper RLS Policies for New Tables
-- Replace permissive policies with role-based access
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════

-- ── academic_years ──
DROP POLICY IF EXISTS ay_permissive ON academic_years;
CREATE POLICY ay_read ON academic_years FOR SELECT USING (
  institute_id IN (SELECT public.get_user_institute_ids())
  OR public.get_user_role() = 'admin'
);
CREATE POLICY ay_write ON academic_years FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute')
);

-- ── enrollment_history ──
DROP POLICY IF EXISTS eh_permissive ON enrollment_history;
CREATE POLICY eh_read ON enrollment_history FOR SELECT USING (
  public.get_user_role() IN ('admin', 'institute')
);
CREATE POLICY eh_write ON enrollment_history FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute')
);

-- ── student_classes ──
DROP POLICY IF EXISTS sc_permissive ON student_classes;
CREATE POLICY sc_read ON student_classes FOR SELECT USING (
  student_id = auth.uid()
  OR institute_id IN (SELECT public.get_user_institute_ids())
  OR public.get_user_role() = 'admin'
);
CREATE POLICY sc_write ON student_classes FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute')
);

-- ── stages ──
DROP POLICY IF EXISTS stages_permissive ON stages;
CREATE POLICY stages_read ON stages FOR SELECT USING (
  institute_id IN (SELECT public.get_user_institute_ids())
  OR public.get_user_role() = 'admin'
);
CREATE POLICY stages_write ON stages FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute')
);

-- ── grades ──
DROP POLICY IF EXISTS grades_permissive ON grades;
CREATE POLICY grades_read ON grades FOR SELECT USING (
  institute_id IN (SELECT public.get_user_institute_ids())
  OR public.get_user_role() = 'admin'
);
CREATE POLICY grades_write ON grades FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute')
);

-- ── sections ──
DROP POLICY IF EXISTS sections_permissive ON sections;
CREATE POLICY sections_read ON sections FOR SELECT USING (
  institute_id IN (SELECT public.get_user_institute_ids())
  OR public.get_user_role() = 'admin'
);
CREATE POLICY sections_write ON sections FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute')
);

-- ── subjects ──
DROP POLICY IF EXISTS subjects_permissive ON subjects;
CREATE POLICY subjects_read ON subjects FOR SELECT USING (
  institute_id IN (SELECT public.get_user_institute_ids())
  OR public.get_user_role() = 'admin'
);
CREATE POLICY subjects_write ON subjects FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute')
);

-- ── Live streaming permission per institute ──
ALTER TABLE institutes ADD COLUMN IF NOT EXISTS live_enabled BOOLEAN DEFAULT false;

-- ── Atomic increment for material buyers ──
CREATE OR REPLACE FUNCTION increment_buyers_count(material_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE materials SET buyers_count = COALESCE(buyers_count, 0) + 1 WHERE id = material_id;
$$;

-- ── teacher_assignments ──
DROP POLICY IF EXISTS ta_permissive ON teacher_assignments;
CREATE POLICY ta_read ON teacher_assignments FOR SELECT USING (
  teacher_id = auth.uid()
  OR institute_id IN (SELECT public.get_user_institute_ids())
  OR public.get_user_role() = 'admin'
);
CREATE POLICY ta_write ON teacher_assignments FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute')
);
