-- ═══════════════════════════════════════════════════
-- Certificates System
-- Feature Flag: certificates
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  type TEXT DEFAULT 'completion',
  -- types: completion, excellence, participation, custom
  title TEXT NOT NULL,
  description TEXT,
  template_id TEXT DEFAULT 'default',
  data JSONB DEFAULT '{}',
  pdf_url TEXT,
  verification_code TEXT UNIQUE,
  issued_at TIMESTAMPTZ DEFAULT now(),
  issued_by UUID NOT NULL,
  is_revoked BOOLEAN DEFAULT false,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_certs_student ON certificates (student_id);
CREATE INDEX IF NOT EXISTS idx_certs_verify ON certificates (verification_code);

ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY cert_read ON certificates FOR SELECT USING (
  student_id = auth.uid()
  OR institute_id IN (SELECT public.get_user_institute_ids())
  OR public.get_user_role() IN ('admin', 'parent')
);
CREATE POLICY cert_write ON certificates FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute')
);
