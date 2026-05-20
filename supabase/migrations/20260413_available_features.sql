-- ═══════════════════════════════════════════════════
-- Available Features Catalog + Feature Flags Upgrade
-- Adds master feature catalog for Services Hub
-- Run this in Supabase SQL Editor AFTER 20260412_feature_flags.sql
-- ═══════════════════════════════════════════════════

-- 1. Master feature catalog — defines ALL features with metadata for Services Hub
CREATE TABLE IF NOT EXISTS available_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key TEXT UNIQUE NOT NULL,
  feature_name_ar TEXT NOT NULL,
  feature_name_en TEXT,
  description_ar TEXT,
  category TEXT NOT NULL, -- 'core', 'academic', 'financial', 'ai', 'communication', 'admin', 'storage', 'health'
  icon_name TEXT NOT NULL, -- Ionicons icon name
  color TEXT NOT NULL, -- hex color for service card
  target_interfaces TEXT[] NOT NULL, -- ['admin', 'teacher', 'student', 'parent', 'institute', 'cafeteria', 'medical']
  route_by_interface JSONB NOT NULL DEFAULT '{}', -- {"admin": "/admin/users", "teacher": "/teacher/assignments"}
  is_core BOOLEAN DEFAULT false, -- core features can NOT be disabled
  institute_only BOOLEAN DEFAULT false,
  school_only BOOLEAN DEFAULT false,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. RLS for available_features
ALTER TABLE available_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can read available features"
  ON available_features FOR SELECT USING (true);

-- Only super admin can modify the catalog (via service role key)
-- No INSERT/UPDATE/DELETE policy for anon — managed by admin via service_role

-- 3. Add feature_id FK to feature_flags (link to catalog)
-- We add the column as nullable first, then populate, then reference
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS feature_id UUID;

-- 4. Seed the available_features catalog
-- Core features (always visible, cannot be disabled)
INSERT INTO available_features (feature_key, feature_name_ar, feature_name_en, description_ar, category, icon_name, color, target_interfaces, route_by_interface, is_core, display_order)
VALUES
  -- ── Core features (cannot be disabled) ──
  ('home', 'الرئيسية', 'Home', 'الصفحة الرئيسية', 'core', 'home', '#1E40AF',
   '{"admin","student","teacher","parent","institute","cafeteria","medical"}',
   '{"admin":"/admin","student":"/student","teacher":"/teacher","parent":"/parent","institute":"/institute","cafeteria":"/cafeteria","medical":"/medical"}',
   true, 1),

  ('notifications', 'الإشعارات', 'Notifications', 'مركز الإشعارات', 'core', 'notifications', '#7C3AED',
   '{"admin","student","teacher","parent","institute","cafeteria","medical"}',
   '{}', true, 2),

  ('profile', 'الملف الشخصي', 'Profile', 'الملف الشخصي والإعدادات', 'core', 'person-circle', '#0891B2',
   '{"admin","student","teacher","parent","institute","cafeteria","medical"}',
   '{}', true, 3),

  ('services', 'الخدمات', 'Services', 'صفحة الخدمات المتاحة', 'core', 'grid', '#6366F1',
   '{"admin","student","teacher","parent","institute","cafeteria","medical"}',
   '{}', true, 4),

  -- ── Admin interface features ──
  ('user_management', 'إدارة المستخدمين', 'User Management', 'إنشاء وتعديل وحذف المستخدمين والمؤسسات', 'admin', 'people', '#1E40AF',
   '{"admin"}', '{"admin":"/admin/users"}', true, 10),

  ('feature_management', 'إدارة الميزات', 'Feature Management', 'تفعيل وتعطيل الميزات لكل مؤسسة', 'admin', 'toggle', '#7C3AED',
   '{"admin"}', '{"admin":"/admin/features"}', true, 11),

  ('admin_settings', 'الإعدادات', 'Settings', 'إعدادات النظام وحسابي والتذاكر', 'admin', 'settings', '#475569',
   '{"admin"}', '{"admin":"/admin/settings"}', true, 12),

  ('admin_finance', 'المالية', 'Finance', 'تسعير الحسابات والمواد والفواتير', 'financial', 'wallet', '#059669',
   '{"admin"}', '{"admin":"/admin/finance"}', false, 13),

  ('admin_ai_features', 'إدارة AI', 'AI Management', 'تفعيل وإعدادات AI لكل أستاذ', 'ai', 'sparkles', '#8B5CF6',
   '{"admin"}', '{"admin":"/admin/ai-features"}', false, 14),

  ('admin_archive', 'الأرشيف', 'Archive', 'المحتوى المحذوف واستعادة وتصدير', 'storage', 'archive', '#B45309',
   '{"admin"}', '{"admin":"/admin/archive"}', false, 15),

  -- ── Student interface features ──
  ('student_content', 'المحتوى التعليمي', 'Content', 'فيديوهات ومواد وملفات تعليمية', 'academic', 'book', '#1E40AF',
   '{"student"}', '{"student":"/student/content"}', false, 20),

  ('student_reports', 'التقارير', 'Reports', 'تقرير أداء شامل (حضور + مهام + امتحانات)', 'academic', 'analytics', '#059669',
   '{"student"}', '{"student":"/student/reports"}', false, 21),

  ('student_stats', 'الإحصائيات', 'Statistics', 'حضور تفصيلي وطلبات تبرير وامتحانات', 'academic', 'bar-chart', '#0891B2',
   '{"student"}', '{"student":"/student/stats"}', false, 22),

  ('student_schedule', 'الجدول الأسبوعي', 'Schedule', 'جدول الحصص مع تصدير ومزامنة', 'academic', 'calendar', '#1D4ED8',
   '{"student"}', '{"student":"/student/schedule"}', false, 23),

  -- ── Teacher interface features ──
  ('teacher_content', 'المحتوى', 'Content', 'رفع فيديوهات وامتحانات ومواد ومعرض', 'academic', 'book', '#1E40AF',
   '{"teacher"}', '{"teacher":"/teacher/content"}', false, 30),

  -- ── Parent interface features ──
  ('parent_academic', 'الأكاديمي', 'Academic', 'درجات الطفل وأداء الواجبات', 'academic', 'school', '#1D4ED8',
   '{"parent"}', '{"parent":"/parent/academic"}', false, 40),

  ('parent_attendance', 'الحضور', 'Attendance', 'سجل حضور الطفل وملخص', 'academic', 'checkmark-circle', '#059669',
   '{"parent"}', '{"parent":"/parent/attendance"}', false, 41),

  ('parent_schedule', 'الجدول', 'Schedule', 'جدول حصص الطفل الأسبوعي', 'academic', 'calendar', '#1D4ED8',
   '{"parent"}', '{"parent":"/parent/schedule"}', false, 42),

  ('parent_finance', 'المالية', 'Finance', 'مدفوعات وأقساط وإيصالات', 'financial', 'wallet', '#B45309',
   '{"parent"}', '{"parent":"/parent/finance"}', false, 43)

ON CONFLICT (feature_key) DO NOTHING;

-- 5. Seed toggleable features (these match existing feature_flags keys)
-- These are features that can be enabled/disabled per institution
INSERT INTO available_features (feature_key, feature_name_ar, feature_name_en, description_ar, category, icon_name, color, target_interfaces, route_by_interface, is_core, institute_only, display_order)
VALUES
  ('attendance_qr', 'حضور QR Code', 'QR Attendance', 'تسجيل حضور الطلاب عبر مسح QR Code', 'academic', 'qr-code', '#059669',
   '{"student","institute"}', '{"student":"/student","institute":"/institute"}', false, true, 50),

  ('interactive_schedule', 'الجدول التفاعلي', 'Interactive Schedule', 'جدول دراسي تفاعلي مع إشعارات', 'academic', 'calendar', '#1D4ED8',
   '{"teacher"}', '{"teacher":"/teacher/schedule"}', false, false, 51),

  ('electronic_assignments', 'الواجبات الإلكترونية', 'Electronic Assignments', 'نظام واجبات مع حل وتسليم وتصحيح', 'academic', 'document-text', '#7C3AED',
   '{"student","teacher"}', '{"student":"/student/assignments","teacher":"/teacher/assignments"}', false, false, 52),

  ('exam_system', 'نظام الامتحانات', 'Exam System', 'امتحانات إلكترونية بأنواع أسئلة متعددة', 'academic', 'school', '#B45309',
   '{"student"}', '{"student":"/student/exams"}', false, false, 53),

  ('exam_content_protection', 'حماية الامتحانات', 'Exam Protection', 'منع التصوير والنسخ أثناء الامتحان', 'academic', 'shield-checkmark', '#DC2626',
   '{"student"}', '{}', false, false, 54),

  ('certificates', 'الشهادات الرقمية', 'Digital Certificates', 'إصدار شهادات PDF مع رمز تحقق', 'academic', 'ribbon', '#0891B2',
   '{"student","institute"}', '{"student":"/student/certificates","institute":"/institute/certificates"}', false, false, 55),

  ('parent_teacher_chat', 'دردشة ولي الأمر', 'Parent-Teacher Chat', 'دردشة مباشرة بين الأستاذ وولي الأمر', 'communication', 'chatbubbles', '#16A34A',
   '{"teacher","parent"}', '{"teacher":"/teacher/chat","parent":"/parent/chat"}', false, false, 56),

  ('ai_student_chatbot', 'AI مساعد الطالب', 'AI Student Chatbot', 'مساعد ذكي يجاوب أسئلة الطالب', 'ai', 'sparkles', '#8B5CF6',
   '{"student"}', '{"student":"/student/ai-chat"}', false, false, 60),

  ('ai_auto_grading', 'AI تصحيح تلقائي', 'AI Auto Grading', 'تصحيح الامتحانات تلقائياً بالذكاء الاصطناعي', 'ai', 'checkmark-done-circle', '#6366F1',
   '{"teacher"}', '{}', false, false, 61),

  ('ai_predictive_analysis', 'AI تحليل تنبؤي', 'AI Predictive Analysis', 'تحليل أداء الطالب وتوقع مستواه', 'ai', 'analytics', '#0D9488',
   '{"student"}', '{"student":"/student/ai-tools"}', false, false, 62),

  ('ai_study_plan', 'AI خطة دراسية', 'AI Study Plan', 'خطط دراسية شخصية بالذكاء الاصطناعي', 'ai', 'map', '#EA580C',
   '{"student"}', '{"student":"/student/ai-tools"}', false, false, 63),

  ('ai_teacher_assistant', 'AI مساعد الأستاذ', 'AI Teacher Assistant', 'أدوات ذكية: توليد أسئلة، خطط، تقارير', 'ai', 'bulb', '#CA8A04',
   '{"teacher","admin"}', '{"teacher":"/teacher/ai-tools","admin":"/admin/ai-features"}', false, false, 64),

  ('ai_lessons', 'دروس AI', 'AI Lessons', 'دروس مولّدة بالذكاء الاصطناعي مع كويزات', 'ai', 'sparkles', '#8B5CF6',
   '{"student","teacher"}', '{"student":"/student/ai","teacher":"/teacher/ai-lessons"}', false, false, 65),

  ('live_streaming', 'البث المباشر', 'Live Streaming', 'بث مباشر للحصص عبر Cloudflare', 'communication', 'radio', '#DC2626',
   '{"teacher"}', '{"teacher":"/teacher/live"}', false, false, 70),

  ('voice_messages', 'الرسائل الصوتية', 'Voice Messages', 'تسجيل وبث رسائل صوتية للطلاب', 'communication', 'mic', '#7C3AED',
   '{"teacher"}', '{"teacher":"/teacher/voice"}', false, false, 71)

ON CONFLICT (feature_key) DO NOTHING;

-- 6. Link existing feature_flags rows to available_features
UPDATE feature_flags ff
SET feature_id = af.id
FROM available_features af
WHERE ff.feature_key = af.feature_key
  AND ff.feature_id IS NULL;

-- 7. Add FK constraint (after population)
-- Note: Run this only after the UPDATE above completes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_feature_flags_available_feature'
  ) THEN
    ALTER TABLE feature_flags
      ADD CONSTRAINT fk_feature_flags_available_feature
      FOREIGN KEY (feature_id) REFERENCES available_features(id);
  END IF;
END $$;

-- 8. Auto-seed new features for all existing institutes
INSERT INTO feature_flags (institute_id, feature_key, is_enabled, feature_id)
SELECT i.id, af.feature_key, false, af.id
FROM institutes i
CROSS JOIN available_features af
WHERE af.is_core = false
  AND af.feature_key NOT IN ('home','notifications','profile','services',
    'user_management','feature_management','admin_settings','admin_finance',
    'admin_ai_features','admin_archive','student_content','student_reports',
    'student_stats','student_schedule','teacher_content',
    'parent_academic','parent_attendance','parent_schedule','parent_finance')
ON CONFLICT (institute_id, feature_key) DO NOTHING;

-- 9. Update the auto-seed trigger to include feature_id
CREATE OR REPLACE FUNCTION seed_feature_flags_for_institute()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO feature_flags (institute_id, feature_key, is_enabled, feature_id)
  SELECT NEW.id, af.feature_key, false, af.id
  FROM available_features af
  WHERE af.is_core = false
    AND af.feature_key NOT IN ('home','notifications','profile','services',
      'user_management','feature_management','admin_settings','admin_finance',
      'admin_ai_features','admin_archive','student_content','student_reports',
      'student_stats','student_schedule','teacher_content',
      'parent_academic','parent_attendance','parent_schedule','parent_finance')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- 10. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_available_features_key ON available_features(feature_key);
CREATE INDEX IF NOT EXISTS idx_available_features_category ON available_features(category);
CREATE INDEX IF NOT EXISTS idx_available_features_interfaces ON available_features USING GIN(target_interfaces);
CREATE INDEX IF NOT EXISTS idx_feature_flags_feature_id ON feature_flags(feature_id);

-- ═══════════════════════════════════════════════════
-- DONE! Now the app has:
-- 1. available_features: master catalog of all features with routes/icons/colors
-- 2. feature_flags: per-institution enable/disable (linked to catalog)
-- 3. feature_flags_log: audit trail
-- ═══════════════════════════════════════════════════
