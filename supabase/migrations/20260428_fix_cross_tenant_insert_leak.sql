-- Fix: assignments + materials cross-tenant INSERT leak
-- Discovered via e2e isolation test 2026-04-28.
--
-- Bug: WITH CHECK had `teacher_id = auth.uid()` as a top-level OR branch with
-- no institute_id constraint, so a teacher in institute A could INSERT rows
-- into institute B as long as they set teacher_id to their own uid.
--
-- Fix: tighten the teacher branch to require institute_id ∈ user's enrolled
-- institutes. Admin/institute-admin branches retain global/own-institute access.

DROP POLICY IF EXISTS assignments_v3_write ON public.assignments;
CREATE POLICY assignments_v3_write ON public.assignments
FOR ALL TO authenticated
USING (
  (teacher_id = auth.uid() AND institute_id IN (SELECT public.get_user_institute_ids()))
  OR (
    get_user_role() = ANY (ARRAY['admin'::text, 'institute'::text])
    AND (
      institute_id IN (SELECT public.get_user_institute_ids())
      OR get_user_role() = 'admin'
    )
  )
)
WITH CHECK (
  (teacher_id = auth.uid() AND institute_id IN (SELECT public.get_user_institute_ids()))
  OR (
    get_user_role() = ANY (ARRAY['admin'::text, 'institute'::text])
    AND (
      institute_id IN (SELECT public.get_user_institute_ids())
      OR get_user_role() = 'admin'
    )
  )
);

DROP POLICY IF EXISTS materials_write ON public.materials;
CREATE POLICY materials_write ON public.materials
FOR ALL TO authenticated
USING (
  (teacher_id = auth.uid() AND institute_id IN (SELECT public.get_user_institute_ids()))
  OR get_user_role() = 'admin'
)
WITH CHECK (
  (teacher_id = auth.uid() AND institute_id IN (SELECT public.get_user_institute_ids()))
  OR get_user_role() = 'admin'
);
