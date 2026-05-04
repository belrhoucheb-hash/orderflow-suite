alter table public.tenant_warehouses
  add column if not exists transport_flow text not null default 'both',
  add column if not exists default_stop_role text not null default 'pickup',
  add column if not exists warehouse_reference_mode text not null default 'manual',
  add column if not exists warehouse_reference_prefix text,
  add column if not exists manual_reference text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tenant_warehouses_transport_flow_check'
      and conrelid = 'public.tenant_warehouses'::regclass
  ) then
    alter table public.tenant_warehouses
      add constraint tenant_warehouses_transport_flow_check
      check (transport_flow in ('import', 'export', 'both'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'tenant_warehouses_default_stop_role_check'
      and conrelid = 'public.tenant_warehouses'::regclass
  ) then
    alter table public.tenant_warehouses
      add constraint tenant_warehouses_default_stop_role_check
      check (default_stop_role in ('pickup', 'delivery'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'tenant_warehouses_reference_mode_check'
      and conrelid = 'public.tenant_warehouses'::regclass
  ) then
    alter table public.tenant_warehouses
      add constraint tenant_warehouses_reference_mode_check
      check (warehouse_reference_mode in ('manual', 'order_number'));
  end if;
end $$;

comment on column public.tenant_warehouses.transport_flow is
  'Welke orderflow dit warehouse automatisch mag vullen: import, export of both.';
comment on column public.tenant_warehouses.default_stop_role is
  'Standaard rol in New Order: pickup/laadadres of delivery/losadres.';
comment on column public.tenant_warehouses.warehouse_reference_mode is
  'Referentiebron per warehouse-stop: manual of order_number.';
comment on column public.tenant_warehouses.warehouse_reference_prefix is
  'Optionele prefix wanneer het ordernummer als laad-/losreferentie wordt gebruikt.';
comment on column public.tenant_warehouses.manual_reference is
  'Handmatige laad-/losreferentie voor dit warehouse.';

