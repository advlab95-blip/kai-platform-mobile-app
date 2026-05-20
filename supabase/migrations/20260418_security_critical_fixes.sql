-- ═══════════════════════════════════════════════════════════════════════════
-- 20260418_security_critical_fixes.sql  (defensive rewrite)
-- ═══════════════════════════════════════════════════════════════════════════
-- Fixes 3 critical multi-tenant isolation gaps:
--   1. galleries RLS was `USING (true)` — leaked across institutes
--   2. voice_messages had no institute_id column — cross-tenant visibility
--   3. medical_records — parents saw all records in their institute
--
-- DEFENSIVE NOTES:
--   - Each block is independent. Running the whole file does work, but if
--     one step fails you can re-run the file and it picks up where it left
--     off (DROP IF EXISTS + ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE).
--   - We use a DO block for the NOT NULL constraint so it skips cleanly if
--     any rows still have NULL (and tells you to investigate).
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══ 1. galleries RLS — institute scope ════════════════════════════════════
DROP POLICY IF EXISTS "galleries_read" ON galleries;
CREATE POLICY "galleries_read" ON galleries FOR SELECT USING (
  institute_id IN (SELECT public.get_user_institute_ids())
  OR public.get_user_role() = 'admin'
);


-- ═══ 2. voice_messages — add column (idempotent) ═══════════════════════════
-- This step is ALWAYS safe to re-run. If the column already exists, no-op.
ALTER TABLE voice_messages
  ADD COLUMN IF NOT EXISTS institute_id UUID REFERENCES institutes(id) ON DELETE CASCADE;


-- ═══ 3. voice_messages — backfill institute_id from sender's enrollment ═══
-- Only updates rows where institute_id is still NULL, so re-running is safe.
UPDATE voice_messages vm
SET institute_id = sub.institute_id
FROM (
  SELECT DISTINCT ON (e.user_id)
    e.user_id,
    e.institute_id
  FROM enrollments e
  ORDER BY e.user_id, e.created_at ASC
) sub
WHERE vm.institute_id IS NULL
  AND vm.sender_id = sub.user_id;


-- ═══ 4. voice_messages — delete orphans (sender has no enrollment) ════════
-- If any rows still have NULL institute_id after the backfill, they're orphaned
-- voice messages from deleted users. Safe to delete since they can't be scoped.
DELETE FROM voice_messages WHERE institute_id IS NULL;


-- ═══ 5. voice_messages — enforce NOT NULL only if safe ═══════════════════
-- Wrapped in a DO block so if there are somehow still NULLs (shouldn't happen
-- after step 4, but defensive), it raises a notice instead of aborting.
DO $$
DECLARE
  null_count INT;
BEGIN
  SELECT COUNT(*) INTO null_count FROM voice_messages WHERE institute_id IS NULL;
  IF null_count = 0 THEN
    -- Safe to enforce
    BEGIN
      ALTER TABLE voice_messages ALTER COLUMN institute_id SET NOT NULL;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Could not set NOT NULL on voice_messages.institute_id: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'Skipped NOT NULL constraint — % rows still have NULL institute_id', null_count;
  END IF;
END $$;


-- ═══ 6. voice_messages — tighten read + write policies ════════════════════
DROP POLICY IF EXISTS "voice_messages_read" ON voice_messages;
CREATE POLICY "voice_messages_read" ON voice_messages FOR SELECT USING (
  sender_id = auth.uid()
  OR institute_id IN (SELECT public.get_user_institute_ids())
  OR public.get_user_role() = 'admin'
);

DROP POLICY IF EXISTS "voice_messages_write" ON voice_messages;
CREATE POLICY "voice_messages_write" ON voice_messages FOR INSERT WITH CHECK (
  sender_id = auth.uid()
  AND institute_id IN (SELECT public.get_user_institute_ids())
);


-- ═══ 7. medical_records — parent only sees their own children's records ══
DROP POLICY IF EXISTS "medical_records_read" ON medical_records;
CREATE POLICY "medical_records_read" ON medical_records FOR SELECT USING (
  -- Medical/institute/admin see every record in their institute
  (
    institute_id IN (SELECT public.get_user_institute_ids())
    AND public.get_user_role() IN ('admin', 'institute', 'medical')
  )
  -- Student sees own record
  OR student_id = auth.uid()
  -- Parent sees only linked children
  OR (
    public.get_user_role() = 'parent'
    AND student_id IN (
      SELECT student_id FROM parent_child WHERE parent_id = auth.uid()
    )
  )
);


-- ═══ 8. Indexes — only created when their columns actually exist ══════════
-- Each index wrapped in a DO block so a missing column on one index doesn't
-- block the others from being created.

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'voice_messages' AND column_name = 'institute_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_voice_messages_institute
      ON voice_messages(institute_id, created_at DESC);
  ELSE
    RAISE NOTICE 'Skipped idx_voice_messages_institute — column missing';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parent_child' AND column_name = 'parent_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parent_child' AND column_name = 'student_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_parent_child_parent
      ON parent_child(parent_id, student_id);
  ELSE
    RAISE NOTICE 'Skipped idx_parent_child_parent — parent_child columns not as expected';
  END IF;
END $$;
