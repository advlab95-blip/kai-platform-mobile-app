-- Atomic, race-safe append to galleries.images.
-- Replaces the read-modify-write pattern in addGalleryImage where two concurrent uploads
-- could both read the same images array, push their own URL, and write back — silently
-- losing one image. Using array_append inside a single UPDATE serializes correctly
-- because Postgres holds a row lock for the duration of the update.
--
-- Behavior:
--   * No-op if the image already exists in the array (idempotent).
--   * Returns the new image_count so the client can update local state.
--   * Authorization: the caller must own the gallery (teacher_id = auth.uid()) OR be an
--     active institute admin in the gallery's institute. RLS on galleries already enforces
--     teacher self-ownership; this RPC duplicates the check defensively because it runs as
--     SECURITY DEFINER (needed so array_append bypasses RLS row-write recheck on each call).

CREATE OR REPLACE FUNCTION public.append_gallery_image(
  p_gallery_id uuid,
  p_image_url text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher_id uuid;
  v_institute_id uuid;
  v_new_count int;
BEGIN
  IF p_image_url IS NULL OR length(trim(p_image_url)) = 0 THEN
    RAISE EXCEPTION 'image_url required';
  END IF;

  SELECT teacher_id, institute_id INTO v_teacher_id, v_institute_id
  FROM public.galleries WHERE id = p_gallery_id;

  IF v_teacher_id IS NULL THEN
    RAISE EXCEPTION 'gallery not found';
  END IF;

  -- Authorization: owner OR institute admin
  IF v_teacher_id <> auth.uid()
     AND NOT EXISTS (
       SELECT 1 FROM public.enrollments
       WHERE user_id = auth.uid()
         AND institute_id = v_institute_id
         AND role IN ('admin','institute_admin')
         AND status = 'active'
     )
  THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE public.galleries
  SET images = CASE
        WHEN images @> ARRAY[p_image_url] THEN images
        ELSE COALESCE(images, ARRAY[]::text[]) || p_image_url
      END,
      image_count = CASE
        WHEN images @> ARRAY[p_image_url] THEN image_count
        ELSE COALESCE(image_count, 0) + 1
      END,
      updated_at = now()
  WHERE id = p_gallery_id
  RETURNING image_count INTO v_new_count;

  RETURN jsonb_build_object('image_count', COALESCE(v_new_count, 0));
END
$$;

REVOKE EXECUTE ON FUNCTION public.append_gallery_image(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.append_gallery_image(uuid, text) TO authenticated;

-- Sibling propagation for multi-target uploads (teacher uploads once, image lands in every
-- class-specific gallery row sharing the same title). Atomic per-row, all in one query.
CREATE OR REPLACE FUNCTION public.append_gallery_image_to_siblings(
  p_gallery_id uuid,
  p_image_url text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher_id uuid;
  v_title text;
  v_institute_id uuid;
  v_updated int;
BEGIN
  IF p_image_url IS NULL OR length(trim(p_image_url)) = 0 THEN
    RAISE EXCEPTION 'image_url required';
  END IF;

  SELECT teacher_id, title, institute_id INTO v_teacher_id, v_title, v_institute_id
  FROM public.galleries WHERE id = p_gallery_id;

  IF v_teacher_id IS NULL THEN
    RAISE EXCEPTION 'gallery not found';
  END IF;

  IF v_teacher_id <> auth.uid()
     AND NOT EXISTS (
       SELECT 1 FROM public.enrollments
       WHERE user_id = auth.uid()
         AND institute_id = v_institute_id
         AND role IN ('admin','institute_admin')
         AND status = 'active'
     )
  THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  WITH updated AS (
    UPDATE public.galleries
    SET images = CASE
          WHEN images @> ARRAY[p_image_url] THEN images
          ELSE COALESCE(images, ARRAY[]::text[]) || p_image_url
        END,
        image_count = CASE
          WHEN images @> ARRAY[p_image_url] THEN image_count
          ELSE COALESCE(image_count, 0) + 1
        END,
        updated_at = now()
    WHERE teacher_id = v_teacher_id
      AND title = v_title
      AND institute_id IS NOT DISTINCT FROM v_institute_id
    RETURNING id
  )
  SELECT count(*) INTO v_updated FROM updated;

  RETURN jsonb_build_object('updated', COALESCE(v_updated, 0));
END
$$;

REVOKE EXECUTE ON FUNCTION public.append_gallery_image_to_siblings(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.append_gallery_image_to_siblings(uuid, text) TO authenticated;
