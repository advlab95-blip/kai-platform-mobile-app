-- ═══════════════════════════════════════════════════
-- Fees & Installments System
-- Feature Flag: fees_management
-- ═══════════════════════════════════════════════════

-- 1. Fee Plans
CREATE TABLE IF NOT EXISTS fee_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  branch_id UUID,
  name TEXT NOT NULL,
  class_id UUID,
  academic_year TEXT NOT NULL,
  total_amount NUMERIC(12, 2) NOT NULL,
  currency TEXT DEFAULT 'IQD',
  installments_count INT DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Student Fees
CREATE TABLE IF NOT EXISTS student_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  fee_plan_id UUID NOT NULL REFERENCES fee_plans(id) ON DELETE CASCADE,
  institute_id UUID NOT NULL REFERENCES institutes(id),
  total_amount NUMERIC(12, 2) NOT NULL,
  discount NUMERIC(12, 2) DEFAULT 0,
  discount_reason TEXT,
  final_amount NUMERIC(12, 2) NOT NULL,
  paid_amount NUMERIC(12, 2) DEFAULT 0,
  remaining_amount NUMERIC(12, 2) NOT NULL,
  status TEXT DEFAULT 'pending',
  academic_year TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, fee_plan_id)
);

-- 3. Installments
CREATE TABLE IF NOT EXISTS installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_fee_id UUID NOT NULL REFERENCES student_fees(id) ON DELETE CASCADE,
  installment_number INT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  due_date DATE NOT NULL,
  paid_date DATE,
  paid_amount NUMERIC(12, 2) DEFAULT 0,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Fee Payments
CREATE TABLE IF NOT EXISTS fee_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_fee_id UUID NOT NULL REFERENCES student_fees(id),
  installment_id UUID REFERENCES installments(id),
  institute_id UUID NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_method TEXT DEFAULT 'cash',
  receipt_number TEXT UNIQUE NOT NULL,
  received_by UUID,
  notes TEXT,
  receipt_pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Fees Audit Log
CREATE TABLE IF NOT EXISTS fees_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  amount NUMERIC(12, 2),
  performed_by UUID,
  performed_at TIMESTAMPTZ DEFAULT now(),
  details JSONB
);

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_fee_plans_inst ON fee_plans (institute_id);
CREATE INDEX IF NOT EXISTS idx_student_fees_student ON student_fees (student_id);
CREATE INDEX IF NOT EXISTS idx_student_fees_inst ON student_fees (institute_id);
CREATE INDEX IF NOT EXISTS idx_installments_due ON installments (due_date, status);
CREATE INDEX IF NOT EXISTS idx_fee_payments_inst ON fee_payments (institute_id);

-- 7. RLS
ALTER TABLE fee_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY fp_read ON fee_plans FOR SELECT USING (
  institute_id IN (SELECT public.get_user_institute_ids()) OR public.get_user_role() = 'admin'
);
CREATE POLICY fp_write ON fee_plans FOR ALL USING (
  public.get_user_role() IN ('admin', 'institute')
);

ALTER TABLE student_fees ENABLE ROW LEVEL SECURITY;
CREATE POLICY sf_admin ON student_fees FOR ALL USING (public.get_user_role() IN ('admin', 'institute'));
CREATE POLICY sf_student ON student_fees FOR SELECT USING (student_id = auth.uid());
CREATE POLICY sf_parent ON student_fees FOR SELECT USING (
  student_id IN (SELECT child_id FROM parent_child WHERE parent_id = auth.uid())
);

ALTER TABLE installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY inst_all ON installments FOR ALL USING (true);

ALTER TABLE fee_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY fp_admin ON fee_payments FOR ALL USING (public.get_user_role() IN ('admin', 'institute'));
CREATE POLICY fp_read ON fee_payments FOR SELECT USING (
  student_fee_id IN (SELECT id FROM student_fees WHERE student_id = auth.uid())
);

ALTER TABLE fees_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY fal_admin ON fees_audit_log FOR ALL USING (public.get_user_role() IN ('admin', 'institute'));

-- 8. Feature Flag
INSERT INTO feature_flags (institute_id, feature_key, is_enabled)
SELECT id, 'fees_management', false FROM institutes
ON CONFLICT (institute_id, feature_key) DO NOTHING;

INSERT INTO available_features (feature_key, feature_name_ar, description_ar, category, icon_name, color, target_interfaces, route_by_interface, is_core, display_order)
VALUES ('fees_management', 'الرسوم والأقساط', 'إدارة الأقساط الدراسية والمدفوعات', 'financial', 'wallet', '#10B981', ARRAY['admin','institute','parent','student'], '{"admin":"/(admin)/fees","institute":"/(institute)/fees","parent":"/(parent)/fees","student":"/(student)/fees"}', false, 17)
ON CONFLICT (feature_key) DO NOTHING;
