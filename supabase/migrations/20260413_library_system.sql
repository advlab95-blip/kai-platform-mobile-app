-- ═══════════════════════════════════════════════════
-- Digital Library System
-- Feature Flag: digital_library
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS library_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT,
  description TEXT,
  category TEXT DEFAULT 'general',
  cover_url TEXT,
  file_url TEXT,
  file_type TEXT DEFAULT 'pdf',
  external_link TEXT,
  pages_count INT,
  subject_id UUID,
  target_grades TEXT[],
  is_published BOOLEAN DEFAULT true,
  views_count INT DEFAULT 0,
  uploaded_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS library_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES library_books(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  page_number INT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(book_id, user_id, page_number)
);

CREATE TABLE IF NOT EXISTS library_reading_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES library_books(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  pages_read INT DEFAULT 0,
  duration_seconds INT DEFAULT 0,
  is_completed BOOLEAN DEFAULT false,
  last_page INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lib_books_inst ON library_books (institute_id);
CREATE INDEX IF NOT EXISTS idx_lib_bm_user ON library_bookmarks (user_id);
CREATE INDEX IF NOT EXISTS idx_lib_read_user ON library_reading_log (user_id);

ALTER TABLE library_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_reading_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY lb_read ON library_books FOR SELECT USING (institute_id IN (SELECT public.get_user_institute_ids()) OR public.get_user_role() = 'admin');
CREATE POLICY lb_write ON library_books FOR ALL USING (public.get_user_role() IN ('admin', 'institute', 'teacher'));
CREATE POLICY lbm_own ON library_bookmarks FOR ALL USING (user_id = auth.uid());
CREATE POLICY lrl_own ON library_reading_log FOR ALL USING (user_id = auth.uid());
CREATE POLICY lrl_admin ON library_reading_log FOR SELECT USING (public.get_user_role() IN ('admin', 'institute', 'teacher'));

INSERT INTO feature_flags (institute_id, feature_key, is_enabled) SELECT id, 'digital_library', false FROM institutes ON CONFLICT (institute_id, feature_key) DO NOTHING;
INSERT INTO available_features (feature_key, feature_name_ar, description_ar, category, icon_name, color, target_interfaces, route_by_interface, is_core, display_order) VALUES ('digital_library', 'المكتبة الرقمية', 'كتب وملفات PDF مع ملاحظات وإحصائيات قراءة', 'academic', 'library', '#8B5CF6', ARRAY['admin','institute','teacher','student'], '{}'::jsonb, false, 24) ON CONFLICT (feature_key) DO NOTHING;
