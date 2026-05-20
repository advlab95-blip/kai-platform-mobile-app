-- Phase 6 — Admin Ads (إعلانات الأدمن للطلاب)
-- Owner-scoped ads with multi-tenant RLS. Two creator paths:
--   (a) Platform admin (users.role='admin'): owner_institute_id=NULL, free target_institutes.
--   (b) Institute-role user (enrollments.role='institute'): owner_institute_id = their institute,
--       target_institutes forced to [owner_institute_id] (enforced by trigger).
-- Students/teachers/parents/etc. see active ads targeting their institute.

-- Helper: is the caller a platform admin?
CREATE OR REPLACE FUNCTION public._is_platform_admin(p_user UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = p_user AND role = 'admin');
$$;

-- Helper: does this user have the 'institute' role at this institute?
CREATE OR REPLACE FUNCTION public._is_institute_admin(p_user UUID, p_institute UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments
    WHERE user_id = p_user
      AND institute_id = p_institute
      AND role = 'institute'
      AND status = 'active'
  );
$$;

-- Main table
CREATE TABLE IF NOT EXISTS public.admin_ads (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_institute_id  UUID REFERENCES public.institutes(id) ON DELETE CASCADE,
  -- NULL only for platform-admin-created ads.
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title               TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 200),
  body                TEXT CHECK (body IS NULL OR char_length(body) <= 2000),
  image_url           TEXT,
  link_url            TEXT,
  target_institutes   UUID[] NOT NULL DEFAULT '{}',
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ,
  views_count         INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_ad_window CHECK (expires_at IS NULL OR expires_at > starts_at)
);

-- Indexes: the student-visibility query hits (is_active, starts_at, expires_at)
-- and target_institutes via GIN. Admin list by owner.
CREATE INDEX IF NOT EXISTS idx_ads_active
  ON public.admin_ads (is_active, starts_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_ads_targets
  ON public.admin_ads USING GIN (target_institutes);
CREATE INDEX IF NOT EXISTS idx_ads_owner
  ON public.admin_ads (owner_institute_id, created_at DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public._admin_ads_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_ads_updated_at ON public.admin_ads;
CREATE TRIGGER trg_admin_ads_updated_at
  BEFORE UPDATE ON public.admin_ads
  FOR EACH ROW EXECUTE FUNCTION public._admin_ads_touch_updated_at();

-- Enforcement trigger: institute-role writes must scope to their own institute.
CREATE OR REPLACE FUNCTION public._admin_ads_enforce_ownership()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Platform admin: allowed to create/update any ad (owner NULL or not).
  IF public._is_platform_admin(v_uid) THEN
    RETURN NEW;
  END IF;

  -- Institute role: owner_institute_id must be an institute they manage,
  -- AND target_institutes, if non-empty, must be a subset of [owner_institute_id].
  IF NEW.owner_institute_id IS NULL THEN
    RAISE EXCEPTION 'institute admins must set owner_institute_id';
  END IF;

  IF NOT public._is_institute_admin(v_uid, NEW.owner_institute_id) THEN
    RAISE EXCEPTION 'not authorized for this institute';
  END IF;

  -- Force targets to stay within the owner institute.
  IF cardinality(NEW.target_institutes) = 0 THEN
    NEW.target_institutes := ARRAY[NEW.owner_institute_id];
  ELSIF NOT (NEW.target_institutes <@ ARRAY[NEW.owner_institute_id]) THEN
    RAISE EXCEPTION 'target_institutes must be within owner institute';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_ads_enforce_ownership ON public.admin_ads;
CREATE TRIGGER trg_admin_ads_enforce_ownership
  BEFORE INSERT OR UPDATE ON public.admin_ads
  FOR EACH ROW EXECUTE FUNCTION public._admin_ads_enforce_ownership();

-- RLS
ALTER TABLE public.admin_ads ENABLE ROW LEVEL SECURITY;

-- Read policy: anyone whose active enrollment is in an institute that's targeted
-- (or, for platform-admin-created ads with empty target, everyone sees it).
-- Platform admin sees everything.
DROP POLICY IF EXISTS "ads_select_visible" ON public.admin_ads;
CREATE POLICY "ads_select_visible" ON public.admin_ads
FOR SELECT USING (
  public._is_platform_admin(auth.uid())
  OR (
    is_active = TRUE
    AND starts_at <= NOW()
    AND (expires_at IS NULL OR expires_at > NOW())
    AND (
      -- Platform-admin ad with no targets = visible to all authenticated users
      (owner_institute_id IS NULL AND cardinality(target_institutes) = 0)
      OR EXISTS (
        SELECT 1 FROM public.enrollments e
        WHERE e.user_id = auth.uid()
          AND e.status = 'active'
          AND e.institute_id = ANY(target_institutes)
      )
    )
  )
);

-- Additional read: institute admins see all ads owned by their institute
-- (even inactive/expired ones, so they can edit).
DROP POLICY IF EXISTS "ads_select_institute_owner" ON public.admin_ads;
CREATE POLICY "ads_select_institute_owner" ON public.admin_ads
FOR SELECT USING (
  owner_institute_id IS NOT NULL
  AND public._is_institute_admin(auth.uid(), owner_institute_id)
);

-- Write policies: the trigger does the heavy lifting, but we still need RLS
-- to allow the write attempt to even reach the trigger.
DROP POLICY IF EXISTS "ads_insert_authorized" ON public.admin_ads;
CREATE POLICY "ads_insert_authorized" ON public.admin_ads
FOR INSERT WITH CHECK (
  public._is_platform_admin(auth.uid())
  OR (
    owner_institute_id IS NOT NULL
    AND public._is_institute_admin(auth.uid(), owner_institute_id)
  )
);

DROP POLICY IF EXISTS "ads_update_authorized" ON public.admin_ads;
CREATE POLICY "ads_update_authorized" ON public.admin_ads
FOR UPDATE USING (
  public._is_platform_admin(auth.uid())
  OR (
    owner_institute_id IS NOT NULL
    AND public._is_institute_admin(auth.uid(), owner_institute_id)
  )
);

DROP POLICY IF EXISTS "ads_delete_authorized" ON public.admin_ads;
CREATE POLICY "ads_delete_authorized" ON public.admin_ads
FOR DELETE USING (
  public._is_platform_admin(auth.uid())
  OR (
    owner_institute_id IS NOT NULL
    AND public._is_institute_admin(auth.uid(), owner_institute_id)
  )
);

-- Atomic view counter. Runs as SECURITY DEFINER because students cannot
-- UPDATE the row through RLS. The RPC only increments; it never exposes data.
CREATE OR REPLACE FUNCTION public.increment_ad_views(p_ad_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_visible BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Only count a view if the user actually has visibility on the ad.
  SELECT EXISTS (
    SELECT 1 FROM public.admin_ads a
    WHERE a.id = p_ad_id
      AND a.is_active = TRUE
      AND a.starts_at <= NOW()
      AND (a.expires_at IS NULL OR a.expires_at > NOW())
      AND (
        (a.owner_institute_id IS NULL AND cardinality(a.target_institutes) = 0)
        OR EXISTS (
          SELECT 1 FROM public.enrollments e
          WHERE e.user_id = v_uid
            AND e.status = 'active'
            AND e.institute_id = ANY(a.target_institutes)
        )
      )
  ) INTO v_visible;

  IF NOT v_visible THEN
    RETURN; -- silent no-op so we don't leak existence
  END IF;

  UPDATE public.admin_ads
     SET views_count = views_count + 1
   WHERE id = p_ad_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_ad_views(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public._is_platform_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public._is_institute_admin(UUID, UUID) TO authenticated;

COMMENT ON TABLE public.admin_ads IS
  'Phase 6 — Institute/platform-admin ads shown to members. Multi-tenant: institute admins are constrained to their own institute via trigger + RLS.';
