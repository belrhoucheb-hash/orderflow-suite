CREATE TABLE IF NOT EXISTS public.driver_external_personnel_cards (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL,
  provider             TEXT NOT NULL,
  driver_id            UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  external_employee_id TEXT,
  details_json         JSONB NOT NULL DEFAULT '{}'::jsonb,
  contract_json        JSONB NOT NULL DEFAULT '{}'::jsonb,
  hours_json           JSONB NOT NULL DEFAULT '{}'::jsonb,
  leave_json           JSONB NOT NULL DEFAULT '[]'::jsonb,
  sickness_json        JSONB NOT NULL DEFAULT '[]'::jsonb,
  files_json           JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_payload          JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT driver_external_personnel_cards_provider_chk
    CHECK (provider IN ('nostradamus'))
);

CREATE UNIQUE INDEX IF NOT EXISTS driver_external_personnel_cards_uniq
  ON public.driver_external_personnel_cards (tenant_id, provider, driver_id);

CREATE OR REPLACE FUNCTION public.touch_driver_external_personnel_cards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS driver_external_personnel_cards_touch_updated_at ON public.driver_external_personnel_cards;
CREATE TRIGGER driver_external_personnel_cards_touch_updated_at
  BEFORE UPDATE ON public.driver_external_personnel_cards
  FOR EACH ROW EXECUTE FUNCTION public.touch_driver_external_personnel_cards_updated_at();

ALTER TABLE public.driver_external_personnel_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "driver_external_personnel_cards: tenant read" ON public.driver_external_personnel_cards;
CREATE POLICY "driver_external_personnel_cards: tenant read"
  ON public.driver_external_personnel_cards
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS "driver_external_personnel_cards: service_role full" ON public.driver_external_personnel_cards;
CREATE POLICY "driver_external_personnel_cards: service_role full"
  ON public.driver_external_personnel_cards
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT SELECT ON public.driver_external_personnel_cards TO authenticated;
GRANT ALL ON public.driver_external_personnel_cards TO service_role;
