-- Tier 3 F4: AI grading suggestions for essay/short-answer exam questions.
-- ─────────────────────────────────────────────────────────────────────────
-- Context
-- The auto_grade_exam RPC only handles MCQ + T/F. Essay/short/open answers
-- are flagged `partially_graded` and require manual review. This migration
-- adds two columns so the new `grade-exam-essay` Edge Function can stage
-- an AI suggestion that the teacher then accepts / edits / rejects.
--
-- Design notes
-- ──────────────
-- 1. `score` + `feedback` remain the source of truth (teacher's final
--    decision). The AI never writes them — only the teacher's confirmed
--    action via gradeExamAnswer() does.
-- 2. `ai_suggested_score` + `ai_feedback` are advisory & idempotent: the
--    teacher can re-request a suggestion without losing their previous
--    final grade.
-- 3. Migration is strictly additive (ADD COLUMN IF NOT EXISTS). No drops,
--    no defaults that would touch existing rows, no NOT NULL.
-- 4. No new index — these columns are always read alongside the row they
--    belong to, never used as filter/sort keys.

ALTER TABLE exam_answers
  ADD COLUMN IF NOT EXISTS ai_suggested_score numeric,
  ADD COLUMN IF NOT EXISTS ai_feedback text;

COMMENT ON COLUMN exam_answers.ai_suggested_score IS
  'AI-suggested score for essay/short-answer questions. Set by grade-exam-essay edge function; advisory only — teacher must accept/edit before final score is recorded.';
COMMENT ON COLUMN exam_answers.ai_feedback IS
  'AI-generated Arabic feedback explaining the suggested score. Advisory only — teacher reviews before publishing.';
