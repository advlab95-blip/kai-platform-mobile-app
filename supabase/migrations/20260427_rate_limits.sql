-- Rate limiting infrastructure shared across all Edge Functions.
--
-- Schema: a single table keyed by (bucket, identifier) tracking counts inside a
-- rolling window. Edge Functions call public.check_rate_limit(...) before each
-- sensitive action; if the count would exceed the cap the function returns
-- false and the caller short-circuits with HTTP 429.
--
-- Why a SQL function (not pg_cron / Redis):
--   - Atomic UPSERT keeps the increment-and-check single-statement
--   - No new infra, runs inside Supabase free tier
--   - Cheap: window is rolling on the row's last_reset_at, no separate cron
--   - Service role calls it; we never expose it to clients

CREATE TABLE IF NOT EXISTS public.rate_limits (
  bucket          text        NOT NULL,
  identifier      text        NOT NULL,
  count           int         NOT NULL DEFAULT 0,
  last_reset_at   timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket, identifier)
);

CREATE INDEX IF NOT EXISTS rate_limits_updated_idx ON public.rate_limits (updated_at);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- Deny all client access. Only service_role bypasses RLS, which is what we want.
DROP POLICY IF EXISTS rate_limits_no_client_access ON public.rate_limits;
CREATE POLICY rate_limits_no_client_access ON public.rate_limits
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- check_rate_limit: returns true if the action is allowed, false if rate-limited.
-- Atomically increments the counter inside a rolling window of `window_seconds`.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_bucket          text,
  p_identifier      text,
  p_max             int,
  p_window_seconds  int
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_last  timestamptz;
BEGIN
  -- Insert-or-update in one statement. If the row exists and the window has
  -- expired, reset to 1; otherwise increment.
  INSERT INTO public.rate_limits (bucket, identifier, count, last_reset_at, updated_at)
  VALUES (p_bucket, p_identifier, 1, now(), now())
  ON CONFLICT (bucket, identifier) DO UPDATE
    SET count = CASE
                  WHEN public.rate_limits.last_reset_at < now() - make_interval(secs => p_window_seconds)
                    THEN 1
                  ELSE public.rate_limits.count + 1
                END,
        last_reset_at = CASE
                          WHEN public.rate_limits.last_reset_at < now() - make_interval(secs => p_window_seconds)
                            THEN now()
                          ELSE public.rate_limits.last_reset_at
                        END,
        updated_at = now()
    RETURNING count INTO v_count;

  RETURN v_count <= p_max;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text, int, int) TO service_role;

-- Garbage collector — call from any trigger or run via cron (not required).
-- Removes rows whose window expired more than 1 day ago, keeping the table
-- bounded as new buckets/identifiers come and go.
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted int;
BEGIN
  DELETE FROM public.rate_limits
  WHERE updated_at < now() - interval '1 day'
  RETURNING 1 INTO v_deleted;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_rate_limits() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limits() TO service_role;
