-- =====================================================================
-- Phase 5.1 — Full-Text Search indexes
-- =====================================================================
-- Adds tsvector generated columns + GIN indexes to searchable tables.
-- Used by the `global_search` RPC (see 20260422_global_search_rpc.sql).
--
-- Defensive: each section checks table/column existence before running so
-- the migration is safe on partial deployments and re-runs idempotently.
-- Uses 'simple' configuration (no stemming) for Arabic+English compat.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) users: full_name, phone, user_code (code column may not exist)
-- ---------------------------------------------------------------------
DO $fts_users$
DECLARE
  has_users BOOLEAN;
  has_full_name BOOLEAN;
  has_phone BOOLEAN;
  has_user_code BOOLEAN;
  has_search_vector BOOLEAN;
  expr TEXT;
BEGIN
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
                WHERE table_name='users' AND table_schema='public') INTO has_users;
  IF NOT has_users THEN RETURN; END IF;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_name='users' AND column_name='full_name') INTO has_full_name;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_name='users' AND column_name='phone') INTO has_phone;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_name='users' AND column_name='user_code') INTO has_user_code;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_name='users' AND column_name='search_vector') INTO has_search_vector;

  IF NOT has_full_name THEN RETURN; END IF;  -- cannot search without a name

  -- Build expression depending on available columns
  expr := 'coalesce(full_name,'''')';
  IF has_phone THEN
    expr := expr || ' || '' '' || coalesce(phone,'''')';
  END IF;
  IF has_user_code THEN
    expr := expr || ' || '' '' || coalesce(user_code,'''')';
  END IF;

  IF NOT has_search_vector THEN
    EXECUTE format(
      'ALTER TABLE public.users ADD COLUMN search_vector tsvector '
      'GENERATED ALWAYS AS (to_tsvector(''simple'', %s)) STORED',
      expr
    );
  END IF;

  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_users_search_vector
           ON public.users USING GIN(search_vector)';
END
$fts_users$;

-- ---------------------------------------------------------------------
-- 2) subjects: name
-- ---------------------------------------------------------------------
DO $fts_subjects$
DECLARE
  has_table BOOLEAN;
  has_name BOOLEAN;
  has_sv BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
                WHERE table_name='subjects' AND table_schema='public') INTO has_table;
  IF NOT has_table THEN RETURN; END IF;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_name='subjects' AND column_name='name') INTO has_name;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_name='subjects' AND column_name='search_vector') INTO has_sv;
  IF NOT has_name THEN RETURN; END IF;

  IF NOT has_sv THEN
    EXECUTE 'ALTER TABLE public.subjects ADD COLUMN search_vector tsvector '
            'GENERATED ALWAYS AS (to_tsvector(''simple'', coalesce(name,''''))) STORED';
  END IF;
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_subjects_search_vector
           ON public.subjects USING GIN(search_vector)';
END
$fts_subjects$;

-- ---------------------------------------------------------------------
-- 3) assignments: title, description
-- ---------------------------------------------------------------------
DO $fts_assignments$
DECLARE
  has_table BOOLEAN;
  has_title BOOLEAN;
  has_desc BOOLEAN;
  has_sv BOOLEAN;
  expr TEXT;
BEGIN
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
                WHERE table_name='assignments' AND table_schema='public') INTO has_table;
  IF NOT has_table THEN RETURN; END IF;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_name='assignments' AND column_name='title') INTO has_title;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_name='assignments' AND column_name='description') INTO has_desc;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_name='assignments' AND column_name='search_vector') INTO has_sv;
  IF NOT has_title THEN RETURN; END IF;

  expr := 'coalesce(title,'''')';
  IF has_desc THEN
    expr := expr || ' || '' '' || coalesce(description,'''')';
  END IF;

  IF NOT has_sv THEN
    EXECUTE format(
      'ALTER TABLE public.assignments ADD COLUMN search_vector tsvector '
      'GENERATED ALWAYS AS (to_tsvector(''simple'', %s)) STORED',
      expr
    );
  END IF;
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_assignments_search_vector
           ON public.assignments USING GIN(search_vector)';
END
$fts_assignments$;

-- ---------------------------------------------------------------------
-- 4) exams: title
-- ---------------------------------------------------------------------
DO $fts_exams$
DECLARE
  has_table BOOLEAN;
  has_title BOOLEAN;
  has_sv BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
                WHERE table_name='exams' AND table_schema='public') INTO has_table;
  IF NOT has_table THEN RETURN; END IF;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_name='exams' AND column_name='title') INTO has_title;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_name='exams' AND column_name='search_vector') INTO has_sv;
  IF NOT has_title THEN RETURN; END IF;

  IF NOT has_sv THEN
    EXECUTE 'ALTER TABLE public.exams ADD COLUMN search_vector tsvector '
            'GENERATED ALWAYS AS (to_tsvector(''simple'', coalesce(title,''''))) STORED';
  END IF;
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_exams_search_vector
           ON public.exams USING GIN(search_vector)';
END
$fts_exams$;

-- ---------------------------------------------------------------------
-- 5) announcements: title, content (if exists)
-- ---------------------------------------------------------------------
DO $fts_announcements$
DECLARE
  has_table BOOLEAN;
  has_title BOOLEAN;
  has_content BOOLEAN;
  has_sv BOOLEAN;
  expr TEXT;
BEGIN
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
                WHERE table_name='announcements' AND table_schema='public') INTO has_table;
  IF NOT has_table THEN RETURN; END IF;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_name='announcements' AND column_name='title') INTO has_title;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_name='announcements' AND column_name='content') INTO has_content;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_name='announcements' AND column_name='search_vector') INTO has_sv;

  IF NOT has_title THEN RETURN; END IF;

  expr := 'coalesce(title,'''')';
  IF has_content THEN
    expr := expr || ' || '' '' || coalesce(content,'''')';
  END IF;

  IF NOT has_sv THEN
    EXECUTE format(
      'ALTER TABLE public.announcements ADD COLUMN search_vector tsvector '
      'GENERATED ALWAYS AS (to_tsvector(''simple'', %s)) STORED',
      expr
    );
  END IF;
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_announcements_search_vector
           ON public.announcements USING GIN(search_vector)';
END
$fts_announcements$;

COMMENT ON INDEX idx_users_search_vector IS
  'Phase 5 — FTS for global_search. Built from full_name + phone (+ user_code if present).';
