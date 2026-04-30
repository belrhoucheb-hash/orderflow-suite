-- Bundle the high-fanout overview data for the slowest operational tabs.

create or replace function public.clients_page_v1(
  p_tenant_id uuid,
  p_search text default null,
  p_page integer default 0,
  p_page_size integer default 50,
  p_is_active boolean default null,
  p_country text default null,
  p_sort_key text default 'name',
  p_sort_dir text default 'asc',
  p_dormant_only boolean default false,
  p_dormant_threshold_days integer default 90
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select
      greatest(coalesce(p_page, 0), 0) as page,
      least(greatest(coalesce(p_page_size, 50), 1), 200) as page_size,
      nullif(btrim(coalesce(p_search, '')), '') as search,
      lower(coalesce(p_sort_key, 'name')) as sort_key,
      lower(coalesce(p_sort_dir, 'asc')) as sort_dir,
      now() - make_interval(days => greatest(coalesce(p_dormant_threshold_days, 90), 1)) as dormant_since
  ),
  order_rollup as (
    select
      o.client_id,
      count(*) filter (where o.status not in ('DELIVERED', 'CANCELLED'))::integer as active_order_count,
      max(o.created_at) as last_order_at,
      bool_or(o.created_at >= (select dormant_since from params)) as has_recent_order
    from public.orders o
    where o.tenant_id = p_tenant_id
      and o.client_id is not null
    group by o.client_id
  ),
  clients_base as (
    select
      c.id,
      c.name,
      c.contact_person,
      c.email,
      c.phone,
      c.primary_contact_id,
      c.address,
      c.zipcode,
      c.city,
      c.country,
      c.kvk_number,
      c.btw_number,
      c.payment_terms,
      c.is_active,
      c.created_at,
      c.notes,
      c.street,
      c.house_number,
      c.house_number_suffix,
      c.lat,
      c.lng,
      c.coords_manual,
      c.billing_email,
      c.billing_same_as_main,
      c.billing_address,
      c.billing_zipcode,
      c.billing_city,
      c.billing_country,
      c.billing_street,
      c.billing_house_number,
      c.billing_house_number_suffix,
      c.billing_lat,
      c.billing_lng,
      c.billing_coords_manual,
      c.shipping_same_as_main,
      c.shipping_address,
      c.shipping_zipcode,
      c.shipping_city,
      c.shipping_country,
      c.shipping_street,
      c.shipping_house_number,
      c.shipping_house_number_suffix,
      c.shipping_lat,
      c.shipping_lng,
      c.shipping_coords_manual,
      coalesce(r.active_order_count, 0) as active_order_count,
      r.last_order_at,
      (r.last_order_at is null or r.last_order_at < (select dormant_since from params)) as is_dormant,
      coalesce(r.has_recent_order, false) as has_recent_order
    from public.clients c
    left join order_rollup r on r.client_id = c.id
    where c.tenant_id = p_tenant_id
  ),
  filtered as (
    select b.*
    from clients_base b, params p
    where (p_is_active is null or b.is_active = p_is_active)
      and (p_country is null or b.country = p_country)
      and (not coalesce(p_dormant_only, false) or b.is_dormant)
      and (
        p.search is null
        or b.name ilike '%' || p.search || '%'
        or coalesce(b.email, '') ilike '%' || p.search || '%'
        or coalesce(b.contact_person, '') ilike '%' || p.search || '%'
        or coalesce(b.kvk_number, '') ilike '%' || p.search || '%'
        or coalesce(b.phone, '') ilike '%' || p.search || '%'
        or coalesce(b.city, '') ilike '%' || p.search || '%'
      )
  ),
  ordered as (
    select
      f.*,
      row_number() over (
        order by
          case when (select sort_key from params) = 'name' and (select sort_dir from params) = 'asc' then f.name end asc nulls last,
          case when (select sort_key from params) = 'name' and (select sort_dir from params) = 'desc' then f.name end desc nulls last,
          case when (select sort_key from params) = 'contact_person' and (select sort_dir from params) = 'asc' then f.contact_person end asc nulls last,
          case when (select sort_key from params) = 'contact_person' and (select sort_dir from params) = 'desc' then f.contact_person end desc nulls last,
          case when (select sort_key from params) = 'email' and (select sort_dir from params) = 'asc' then f.email end asc nulls last,
          case when (select sort_key from params) = 'email' and (select sort_dir from params) = 'desc' then f.email end desc nulls last,
          f.name asc,
          f.id asc
      ) as sort_index
    from filtered f
  ),
  paged as (
    select o.*
    from ordered o, params p
    where o.sort_index > p.page * p.page_size
      and o.sort_index <= (p.page + 1) * p.page_size
    order by o.sort_index
  )
  select jsonb_build_object(
    'clients',
      coalesce(
        (select jsonb_agg(to_jsonb(paged) - 'sort_index' - 'has_recent_order' order by sort_index) from paged),
        '[]'::jsonb
      ),
    'total_count', (select count(*) from filtered),
    'stats',
      jsonb_build_object(
        'total', (select count(*) from clients_base),
        'active', (select count(*) from clients_base where is_active),
        'inactive', (select count(*) from clients_base where not is_active),
        'dormant', (select count(*) from clients_base where is_active and not has_recent_order)
      ),
    'countries',
      coalesce(
        (
          select jsonb_agg(country order by country)
          from (
            select distinct country
            from clients_base
            where country is not null and btrim(country) <> ''
          ) countries
        ),
        '[]'::jsonb
      )
  );
$$;

grant execute on function public.clients_page_v1(uuid, text, integer, integer, boolean, text, text, text, boolean, integer) to authenticated;

create or replace function public.planning_day_support_v1(
  p_tenant_id uuid,
  p_date date,
  p_week_start date
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'driver_availability',
      coalesce(
        (
          select jsonb_agg(to_jsonb(a) order by a.driver_id)
          from public.driver_availability a
          where a.tenant_id = p_tenant_id
            and a.date = p_date
        ),
        '[]'::jsonb
      ),
    'driver_schedules',
      coalesce(
        (
          select jsonb_agg(to_jsonb(s) order by s.driver_id)
          from public.driver_schedules s
          where s.tenant_id = p_tenant_id
            and s.date = p_date
        ),
        '[]'::jsonb
      ),
    'hours_rows',
      coalesce(
        (
          select jsonb_agg(to_jsonb(h) order by h.driver_id)
          from public.driver_hours_per_week h
          where h.tenant_id = p_tenant_id
            and h.week_start = p_week_start
        ),
        '[]'::jsonb
      )
  );
$$;

grant execute on function public.planning_day_support_v1(uuid, date, date) to authenticated;
