-- Fix medical_records UNIQUE constraint for multi-tenant correctness.
-- Previous constraint was UNIQUE(student_id) which would overwrite across institutes
-- if the same student_id ever appeared under two institutes (legacy data, transfer, etc).
-- Correct constraint: UNIQUE(student_id, institute_id) to match the
-- .eq('student_id').eq('institute_id') read/write pattern.

BEGIN;

-- Drop the old single-column constraint if it exists. The name may vary across
-- environments; handle both the auto-generated name and any explicit name.
DO $$
DECLARE
  c_name text;
BEGIN
  SELECT conname INTO c_name
  FROM pg_constraint
  WHERE conrelid = 'public.medical_records'::regclass
    AND contype = 'u'
    AND array_length(conkey, 1) = 1
    AND conkey[1] = (
      SELECT attnum FROM pg_attribute
      WHERE attrelid = 'public.medical_records'::regclass
        AND attname = 'student_id'
    )
  LIMIT 1;

  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.medical_records DROP CONSTRAINT %I', c_name);
  END IF;
END $$;

-- Add the composite unique constraint if not already present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.medical_records'::regclass
      AND conname = 'medical_records_student_institute_unique'
  ) THEN
    ALTER TABLE public.medical_records
      ADD CONSTRAINT medical_records_student_institute_unique
      UNIQUE (student_id, institute_id);
  END IF;
END $$;

COMMIT;
