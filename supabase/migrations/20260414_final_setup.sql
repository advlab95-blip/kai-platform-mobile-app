-- ============================================================
-- Final Setup — Missing columns + cleanup
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- Add missing columns to institutes
ALTER TABLE institutes ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE institutes ADD COLUMN IF NOT EXISTS stamp_url TEXT;
ALTER TABLE institutes ADD COLUMN IF NOT EXISTS signature_url TEXT;

-- Add institute_id to messages table (for multi-tenant isolation)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS institute_id UUID REFERENCES institutes(id);

-- Add institute_id to push_tokens (for notification isolation)
ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS institute_id UUID REFERENCES institutes(id);

-- Add status column to assignments if missing
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';

-- Add institute_id to attendance if missing
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS institute_id UUID REFERENCES institutes(id);

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_messages_institute ON messages(institute_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_institute ON push_tokens(institute_id);
CREATE INDEX IF NOT EXISTS idx_attendance_institute ON attendance(institute_id);
