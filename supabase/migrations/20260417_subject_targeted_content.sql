-- Add subject_id to all content tables so students can filter by subject.
-- Nullable — legacy content without a subject still shows under "أخرى".

ALTER TABLE videos ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES subjects(id) ON DELETE SET NULL;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES subjects(id) ON DELETE SET NULL;
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES subjects(id) ON DELETE SET NULL;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES subjects(id) ON DELETE SET NULL;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES subjects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_videos_subject ON videos(subject_id);
CREATE INDEX IF NOT EXISTS idx_materials_subject ON materials(subject_id);
CREATE INDEX IF NOT EXISTS idx_galleries_subject ON galleries(subject_id);
CREATE INDEX IF NOT EXISTS idx_exams_subject ON exams(subject_id);
CREATE INDEX IF NOT EXISTS idx_assignments_subject ON assignments(subject_id);

-- Composite indexes for student queries that filter by (class_id, subject_id)
CREATE INDEX IF NOT EXISTS idx_videos_class_subject ON videos(class_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_exams_class_subject ON exams(class_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_assignments_class_subject ON assignments(class_id, subject_id);
