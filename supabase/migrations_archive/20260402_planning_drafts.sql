-- Planning drafts: persist vehicle-order assignments per day in the database
-- instead of relying solely on localStorage.

CREATE TABLE IF NOT EXISTS public.planning_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  planned_date date NOT NULL,
  vehicle_id uuid NOT NULL,
  order_ids uuid[] NOT NULL DEFAULT '{}',
  driver_id uuid,
  start_time text DEFAULT '07:00',
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, planned_date, vehicle_id)
);

ALTER TABLE planning_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON planning_drafts FOR ALL
  USING (tenant_id = COALESCE(
    (auth.jwt()->'app_metadata'->>'tenant_id')::uuid,
    (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() LIMIT 1)
  ));
