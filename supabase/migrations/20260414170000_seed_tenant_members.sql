-- Seed tenant_members voor Royalty Cargo zodat ingelogde users via de
-- user_has_tenant_access() RLS-policy bij traject_rules, departments,
-- shipments etc. kunnen. Was de oorzaak van "Geen passende traject-regel
-- gevonden" — zonder membership levert de SELECT 0 rijen op.

INSERT INTO public.tenant_members (tenant_id, user_id, role)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'eb221cd1-9877-454b-b210-0f8f08f8f34c', 'admin'),
  ('00000000-0000-0000-0000-000000000001', '399873a8-3f43-4f63-b494-9c5ffbf6767e', 'admin'),
  ('00000000-0000-0000-0000-000000000001', '0c1d3951-1dd2-446e-be0e-51509b663ac3', 'admin')
ON CONFLICT DO NOTHING;
