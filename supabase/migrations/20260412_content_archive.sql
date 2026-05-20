-- ═══════════════════════════════════════════════════
-- Content Archive & Visibility System
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════

-- Add visibility & archive columns to content tables
ALTER TABLE videos ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS archived_by UUID;

ALTER TABLE materials ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS archived_by UUID;

-- galleries table (add if not exists)
DO $$ BEGIN
  ALTER TABLE galleries ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false;
  ALTER TABLE galleries ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;
  ALTER TABLE galleries ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
  ALTER TABLE galleries ADD COLUMN IF NOT EXISTS archived_by UUID;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
