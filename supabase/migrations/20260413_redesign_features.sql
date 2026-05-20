-- ═══════════════════════════════════════════════════
-- Redesign: available_features catalog + Services Hub
-- ═══════════════════════════════════════════════════

-- 1. Available features catalog
CREATE TABLE IF NOT EXISTS available_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key TEXT UNIQUE NOT NULL,
  feature_name_ar TEXT NOT NULL,
  feature_name_en TEXT,
  description_ar TEXT,
  category TEXT NOT NULL,
  icon_name TEXT NOT NULL,
  color TEXT NOT NULL,
  target_interfaces TEXT[] NOT NULL,
  route_by_interface JSONB DEFAULT '{}',
  is_core BOOLEAN DEFAULT false,
  institute_only BOOLEAN DEFAULT false,
  school_only BOOLEAN DEFAULT false,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE available_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY af_read ON available_features FOR SELECT USING (true);
CREATE POLICY af_write ON available_features FOR ALL USING (public.get_user_role() = 'admin');

-- 2. Link feature_flags to available_features
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS feature_id UUID;

-- 3. Seed all features
INSERT INTO available_features (feature_key, feature_name_ar, description_ar, category, icon_name, color, target_interfaces, route_by_interface, is_core, display_order) VALUES
-- Core (always visible)
('home', 'الرئيسية', 'الصفحة الرئيسية', 'core', 'home', '#4F46E5', ARRAY['admin','teacher','student','parent','institute','cafeteria','medical'], '{"admin":"/(admin)","teacher":"/(teacher)","student":"/(student)","parent":"/(parent)","institute":"/(institute)","cafeteria":"/(cafeteria)","medical":"/(medical)"}', true, 1),
('notifications', 'الإشعارات', 'كل الإشعارات والتنبيهات', 'core', 'notifications', '#EC4899', ARRAY['admin','teacher','student','parent','institute','cafeteria','medical'], '{}', true, 2),
('profile', 'الملف الشخصي', 'معلومات الحساب والإعدادات', 'core', 'person-circle', '#8B5CF6', ARRAY['admin','teacher','student','parent','institute','cafeteria','medical'], '{}', true, 3),
('services', 'الخدمات', 'كل الخدمات والميزات', 'core', 'grid', '#3B82F6', ARRAY['admin','teacher','student','parent','institute','cafeteria','medical'], '{}', true, 4),

-- Admin services
('admin_users', 'المستخدمين', 'إدارة الحسابات والمعاهد والمدارس', 'academic', 'people', '#4F46E5', ARRAY['admin'], '{"admin":"/(admin)/users"}', true, 10),
('admin_features', 'إدارة الميزات', 'تفعيل وتعطيل الميزات لكل مؤسسة', 'admin', 'toggle', '#10B981', ARRAY['admin'], '{"admin":"/(admin)/features"}', true, 11),
('admin_settings', 'الإعدادات', 'إعدادات المنصة والصيانة', 'admin', 'settings', '#64748B', ARRAY['admin'], '{"admin":"/(admin)/settings"}', true, 12),
('admin_ai', 'الذكاء الاصطناعي', 'إعدادات AI للمنصة', 'ai', 'sparkles', '#8B5CF6', ARRAY['admin'], '{"admin":"/(admin)/ai-features"}', false, 13),
('admin_finance', 'المالية', 'الأسعار والاشتراكات', 'financial', 'wallet', '#10B981', ARRAY['admin'], '{"admin":"/(admin)/finance"}', false, 14),
('admin_archive', 'الأرشيف', 'المحتوى المحذوف والاستعادة', 'storage', 'archive', '#F59E0B', ARRAY['admin'], '{"admin":"/(admin)/archive"}', false, 15),

-- Teacher services
('teacher_content', 'المحتوى', 'فيديوهات ومواد تعليمية وصور', 'academic', 'book', '#10B981', ARRAY['teacher'], '{"teacher":"/(teacher)/content"}', false, 20),
('teacher_schedule', 'الجدول', 'جدولي الدراسي', 'academic', 'calendar', '#3B82F6', ARRAY['teacher'], '{"teacher":"/(teacher)/schedule"}', false, 21),
('teacher_assignments', 'الواجبات', 'إنشاء وتصحيح الواجبات', 'academic', 'document-text', '#4F46E5', ARRAY['teacher'], '{"teacher":"/(teacher)/assignments"}', false, 22),
('teacher_live', 'البث المباشر', 'بث فيديو مباشر للطلاب', 'academic', 'videocam', '#EF4444', ARRAY['teacher'], '{"teacher":"/(teacher)/live"}', false, 23),
('teacher_voice', 'الصوتي', 'رسائل صوتية', 'communication', 'mic', '#F59E0B', ARRAY['teacher'], '{"teacher":"/(teacher)/voice"}', false, 24),
('teacher_chat', 'الدردشة', 'دردشة مع أولياء الأمور', 'communication', 'chatbubbles', '#EC4899', ARRAY['teacher'], '{"teacher":"/(teacher)/chat"}', false, 25),
('teacher_ai_lessons', 'دروس AI', 'دروس مولّدة بالذكاء الاصطناعي', 'ai', 'bulb', '#8B5CF6', ARRAY['teacher'], '{"teacher":"/(teacher)/ai-lessons"}', false, 26),
('teacher_ai_tools', 'أدوات AI', 'توليد أسئلة وخطط دروس وتقارير', 'ai', 'sparkles', '#CA8A04', ARRAY['teacher'], '{"teacher":"/(teacher)/ai-tools"}', false, 27),

-- Student services
('student_content', 'المحتوى', 'فيديوهات ومواد ومعارض', 'academic', 'book', '#10B981', ARRAY['student'], '{"student":"/(student)/content"}', false, 30),
('student_schedule', 'الجدول', 'الجدول الأسبوعي', 'academic', 'calendar', '#3B82F6', ARRAY['student'], '{"student":"/(student)/schedule"}', false, 31),
('student_assignments', 'الواجبات', 'حل وتسليم الواجبات', 'academic', 'document-text', '#4F46E5', ARRAY['student'], '{"student":"/(student)/assignments"}', false, 32),
('student_exams', 'الامتحانات', 'دخول الامتحانات الإلكترونية', 'academic', 'school', '#EF4444', ARRAY['student'], '{"student":"/(student)/exams"}', false, 33),
('student_stats', 'الإحصائيات', 'حضور ودرجات وتفاصيل', 'academic', 'bar-chart', '#14B8A6', ARRAY['student'], '{"student":"/(student)/stats"}', false, 34),
('student_reports', 'التقارير', 'تقرير أداء مفصّل مع نصائح', 'academic', 'analytics', '#0D9488', ARRAY['student'], '{"student":"/(student)/reports"}', false, 35),
('student_certificates', 'الشهادات', 'عرض وتحميل الشهادات', 'academic', 'ribbon', '#0891B2', ARRAY['student'], '{"student":"/(student)/certificates"}', false, 36),
('student_ai', 'دروس AI', 'دروس ذكية مولّدة', 'ai', 'bulb', '#8B5CF6', ARRAY['student'], '{"student":"/(student)/ai"}', false, 37),
('student_ai_chat', 'المساعد الذكي', 'دردشة مع AI للمساعدة الدراسية', 'ai', 'chatbubble-ellipses', '#8B5CF6', ARRAY['student'], '{"student":"/(student)/ai-chat"}', false, 38),
('student_ai_tools', 'أدوات AI', 'تحليل أداء وخطط دراسية', 'ai', 'analytics', '#0D9488', ARRAY['student'], '{"student":"/(student)/ai-tools"}', false, 39),

-- Parent services
('parent_academic', 'الأكاديمي', 'درجات ونتائج ابني', 'academic', 'school', '#4F46E5', ARRAY['parent'], '{"parent":"/(parent)/academic"}', false, 40),
('parent_attendance', 'الحضور', 'حضور وغياب ابني', 'academic', 'checkmark-circle', '#10B981', ARRAY['parent'], '{"parent":"/(parent)/attendance"}', false, 41),
('parent_schedule', 'الجدول', 'جدول ابني الدراسي', 'academic', 'calendar', '#3B82F6', ARRAY['parent'], '{"parent":"/(parent)/schedule"}', false, 42),
('parent_finance', 'المالية', 'المدفوعات والرسوم', 'financial', 'wallet', '#F59E0B', ARRAY['parent'], '{"parent":"/(parent)/finance"}', false, 43),
('parent_chat', 'التواصل', 'دردشة مع الأساتذة', 'communication', 'chatbubbles', '#EC4899', ARRAY['parent'], '{"parent":"/(parent)/chat"}', false, 44),

-- Institute services
('institute_schedule', 'الجدول', 'إدارة الجدول الدراسي', 'academic', 'calendar', '#3B82F6', ARRAY['institute'], '{"institute":"/(institute)/schedule"}', false, 50),
('institute_certificates', 'الشهادات', 'إصدار شهادات للطلاب', 'academic', 'ribbon', '#0891B2', ARRAY['institute'], '{"institute":"/(institute)/certificates"}', false, 51),
('institute_settings', 'الإعدادات', 'إعدادات المؤسسة والحسابات', 'admin', 'settings', '#64748B', ARRAY['institute'], '{"institute":"/(institute)/settings"}', true, 52),

-- Cafeteria services
('cafeteria_menu', 'القائمة', 'إدارة قائمة الطعام', 'food', 'restaurant', '#F59E0B', ARRAY['cafeteria'], '{"cafeteria":"/(cafeteria)/menu"}', false, 60),
('cafeteria_orders', 'الطلبات', 'استقبال وإدارة الطلبات', 'food', 'receipt', '#10B981', ARRAY['cafeteria'], '{"cafeteria":"/(cafeteria)/orders"}', false, 61),
('cafeteria_settings', 'الإعدادات', 'إعدادات الكافتيريا', 'admin', 'settings', '#64748B', ARRAY['cafeteria'], '{"cafeteria":"/(cafeteria)/settings"}', true, 62),

-- Medical services
('medical_records', 'السجلات', 'السجلات الطبية للطلاب', 'medical', 'medkit', '#EF4444', ARRAY['medical'], '{"medical":"/(medical)/records"}', false, 70),
('medical_reports', 'التقارير', 'التقارير الصحية', 'medical', 'document-text', '#DC2626', ARRAY['medical'], '{"medical":"/(medical)/reports"}', false, 71)

ON CONFLICT (feature_key) DO NOTHING;
