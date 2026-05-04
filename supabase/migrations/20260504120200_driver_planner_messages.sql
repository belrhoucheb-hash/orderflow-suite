-- In-app chat tussen chauffeur en planner. Eén thread per chauffeur (driver:<id>).
-- Tenant-bound: alleen leden van dezelfde tenant zien elkaars berichten,
-- en alleen wanneer zij zender of ontvanger zijn (chauffeur of planner).

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  thread_key text NOT NULL,
  from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CONSTRAINT messages_body_not_empty CHECK (length(trim(body)) > 0),
  CONSTRAINT messages_thread_key_format CHECK (length(thread_key) BETWEEN 1 AND 200)
);

CREATE INDEX IF NOT EXISTS idx_messages_tenant_thread_created
  ON public.messages (tenant_id, thread_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_to_user_unread
  ON public.messages (to_user_id, read_at)
  WHERE read_at IS NULL;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Lezen: tenant-match én betrokken bij thread (afzender of ontvanger),
-- of planner-rol binnen dezelfde tenant (zien alle driver-threads).
CREATE POLICY "messages tenant select"
  ON public.messages
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (
      from_user_id = auth.uid()
      OR to_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.tenant_members tm
        WHERE tm.user_id = auth.uid()
          AND tm.tenant_id = public.messages.tenant_id
          AND tm.role IN ('owner','admin','planner')
      )
    )
  );

-- Inserten: zelf afzender zijn binnen eigen tenant.
CREATE POLICY "messages tenant insert"
  ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND from_user_id = auth.uid()
  );

-- Updaten (read_at zetten): alleen ontvanger of planner mag markeren.
CREATE POLICY "messages tenant update"
  ON public.messages
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (
      to_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.tenant_members tm
        WHERE tm.user_id = auth.uid()
          AND tm.tenant_id = public.messages.tenant_id
          AND tm.role IN ('owner','admin','planner')
      )
    )
  );

CREATE POLICY "messages service role"
  ON public.messages
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Realtime publicatie zodat zowel driver als planner live nieuwe messages krijgen.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.messages';
  END IF;
END $$;
