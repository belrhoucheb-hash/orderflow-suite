-- ============================================================
-- Rate limit counters, herbruikbaar voor edge functions
-- ============================================================
--
-- Gebruik: increment_rate_limit(key, limit, window_seconds) -> bool
--   true  = binnen limiet, doorgaan
--   false = limiet overschreden, weigeren
--
-- Key is vrij formaat, bv. 'test-inbox-connection:<tenant_id>'.
-- Oude rijen worden opgeruimd door de functie zelf, geen cron nodig.
-- ============================================================

CREATE TABLE public.rate_limit_counters (
  key            text NOT NULL,
  window_start   timestamptz NOT NULL,
  count          integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

CREATE INDEX idx_rate_limit_counters_cleanup
  ON public.rate_limit_counters(window_start);

ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;

-- Alleen service_role, geen directe toegang vanaf UI.
CREATE POLICY "Service role: rate_limit_counters"
  ON public.rate_limit_counters FOR ALL TO service_role
  USING (true) WITH CHECK (true);


CREATE OR REPLACE FUNCTION public.increment_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bucket timestamptz;
  v_count int;
BEGIN
  -- Bucket = begin van het huidige venster
  v_bucket := date_trunc('second', now())
            - (extract(epoch FROM now())::int % p_window_seconds) * interval '1 second';

  INSERT INTO public.rate_limit_counters (key, window_start, count)
    VALUES (p_key, v_bucket, 1)
    ON CONFLICT (key, window_start)
    DO UPDATE SET count = rate_limit_counters.count + 1
    RETURNING count INTO v_count;

  -- Opruimen: oude buckets voor deze key (ouder dan 1 uur)
  DELETE FROM public.rate_limit_counters
    WHERE key = p_key AND window_start < now() - interval '1 hour';

  RETURN v_count <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_rate_limit(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_rate_limit(text, integer, integer) TO service_role;
