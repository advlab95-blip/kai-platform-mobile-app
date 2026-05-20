-- Task submissions attachments
ALTER TABLE task_submissions ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE task_submissions ADD COLUMN IF NOT EXISTS attachment_name TEXT;

-- Exam answers as JSONB
ALTER TABLE exam_submissions ALTER COLUMN answers TYPE JSONB USING answers::jsonb;
