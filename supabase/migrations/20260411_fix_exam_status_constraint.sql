-- Fix exam status constraint to include 'scheduled' and 'graded'
ALTER TABLE exams DROP CONSTRAINT IF EXISTS exams_status_check;
ALTER TABLE exams ADD CONSTRAINT exams_status_check 
  CHECK (status IN ('draft', 'scheduled', 'active', 'completed', 'graded'));
