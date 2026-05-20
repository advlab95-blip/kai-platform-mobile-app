-- ============================================================
-- ai_tool_outputs — teacher AI tool history (used by app/(teacher)/ai-tools.tsx)
-- This table was referenced in code but had no migration → RLS was
-- never applied. This migration adds schema + indexes + tenant-safe RLS.
-- Idempotent: safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_tool_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  institute_id UUID REFERENCES public.institutes(id) ON DELETE CASCADE,
  tool_key TEXT NOT NULL,
  title TEXT,
  input_text TEXT,
  output_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lookup by owning teacher + tool + newest first (matches getAIToolOutputs)
CREATE INDEX IF NOT EXISTS idx_ai_tool_outputs_teacher_tool
  ON public.ai_tool_outputs (teacher_id, tool_key, created_at DESC);

-- Institute-scoped admin reporting
CREATE INDEX IF NOT EXISTS idx_ai_tool_outputs_institute
  ON public.ai_tool_outputs (institute_id, created_at DESC);

-- ── RLS ──
ALTER TABLE public.ai_tool_outputs ENABLE ROW LEVEL SECURITY;

-- Drop legacy policies if this migration re-runs after a prior partial apply
DROP POLICY IF EXISTS ato_owner_all ON public.ai_tool_outputs;
DROP POLICY IF EXISTS ato_institute_read ON public.ai_tool_outputs;
DROP POLICY IF EXISTS ato_super_admin ON public.ai_tool_outputs;

-- Teacher owns their own rows: full CRUD on own outputs only.
CREATE POLICY ato_owner_all ON public.ai_tool_outputs
  FOR ALL
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

-- Institute admins/staff can READ outputs from their own institute (no cross-tenant).
CREATE POLICY ato_institute_read ON public.ai_tool_outputs
  FOR SELECT
  USING (
    institute_id IS NOT NULL
    AND institute_id IN (SELECT public.get_user_institute_ids())
    AND public.get_user_role() IN ('institute', 'admin')
  );

-- Super admin: full access across tenants.
CREATE POLICY ato_super_admin ON public.ai_tool_outputs
  FOR ALL
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_tool_outputs TO authenticated;
GRANT ALL ON public.ai_tool_outputs TO service_role;
