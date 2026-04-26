-- Keyset-paginatie voor orders bij niet-standaard sorteringen. Dit voorkomt
-- offset-skips op grote tenants wanneer gebruikers sorteren op klant, status
-- of gewicht.

CREATE OR REPLACE FUNCTION public.orders_page_v1(
  p_page_size integer DEFAULT 25,
  p_status_filter text DEFAULT NULL,
  p_order_type_filter text DEFAULT NULL,
  p_department_filter uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_search_order_number bigint DEFAULT NULL,
  p_created_before timestamptz DEFAULT NULL,
  p_sort_field text DEFAULT 'created_at',
  p_sort_direction text DEFAULT 'desc',
  p_cursor_text text DEFAULT NULL,
  p_cursor_numeric numeric DEFAULT NULL,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT
      o.id,
      o.created_at,
      o.order_number,
      o.client_id,
      o.client_name,
      o.source_email_from,
      o.pickup_address,
      o.delivery_address,
      o.status,
      o.priority,
      o.weight_kg,
      o.vehicle_id,
      o.notes,
      o.internal_note,
      o.order_type,
      o.parent_order_id,
      o.department_id,
      o.shipment_id,
      o.leg_number,
      o.leg_role,
      o.info_status,
      o.missing_fields,
      o.time_window_end
    FROM public.orders o
    WHERE (p_status_filter IS NULL OR (
      p_status_filter = 'PENDING' AND o.status IN ('PENDING', 'OPEN', 'WAITING', 'CONFIRMED')
    ) OR (
      p_status_filter <> 'PENDING' AND o.status = p_status_filter
    ))
      AND (p_order_type_filter IS NULL OR o.order_type = p_order_type_filter)
      AND (p_department_filter IS NULL OR o.department_id = p_department_filter)
      AND (p_created_before IS NULL OR o.created_at < p_created_before)
      AND (
        p_search IS NULL
        OR o.client_name ILIKE '%' || p_search || '%'
        OR o.pickup_address ILIKE '%' || p_search || '%'
        OR o.delivery_address ILIKE '%' || p_search || '%'
        OR (p_search_order_number IS NOT NULL AND o.order_number = p_search_order_number)
      )
      AND (
        p_cursor_id IS NULL
        OR (
          p_sort_field = 'created_at'
          AND (
            (p_sort_direction = 'desc' AND (
              o.created_at < p_cursor_created_at
              OR (o.created_at = p_cursor_created_at AND o.id < p_cursor_id)
            ))
            OR
            (p_sort_direction = 'asc' AND (
              o.created_at > p_cursor_created_at
              OR (o.created_at = p_cursor_created_at AND o.id < p_cursor_id)
            ))
          )
        )
        OR (
          p_sort_field = 'client_name'
          AND (
            (p_sort_direction = 'desc' AND (
              coalesce(o.client_name, '') < coalesce(p_cursor_text, '')
              OR (
                coalesce(o.client_name, '') = coalesce(p_cursor_text, '')
                AND (
                  o.created_at < p_cursor_created_at
                  OR (o.created_at = p_cursor_created_at AND o.id < p_cursor_id)
                )
              )
            ))
            OR
            (p_sort_direction = 'asc' AND (
              coalesce(o.client_name, '') > coalesce(p_cursor_text, '')
              OR (
                coalesce(o.client_name, '') = coalesce(p_cursor_text, '')
                AND (
                  o.created_at < p_cursor_created_at
                  OR (o.created_at = p_cursor_created_at AND o.id < p_cursor_id)
                )
              )
            ))
          )
        )
        OR (
          p_sort_field = 'status'
          AND (
            (p_sort_direction = 'desc' AND (
              coalesce(o.status, '') < coalesce(p_cursor_text, '')
              OR (
                coalesce(o.status, '') = coalesce(p_cursor_text, '')
                AND (
                  o.created_at < p_cursor_created_at
                  OR (o.created_at = p_cursor_created_at AND o.id < p_cursor_id)
                )
              )
            ))
            OR
            (p_sort_direction = 'asc' AND (
              coalesce(o.status, '') > coalesce(p_cursor_text, '')
              OR (
                coalesce(o.status, '') = coalesce(p_cursor_text, '')
                AND (
                  o.created_at < p_cursor_created_at
                  OR (o.created_at = p_cursor_created_at AND o.id < p_cursor_id)
                )
              )
            ))
          )
        )
        OR (
          p_sort_field = 'weight_kg'
          AND (
            (p_sort_direction = 'desc' AND (
              coalesce(o.weight_kg, 0) < coalesce(p_cursor_numeric, 0)
              OR (
                coalesce(o.weight_kg, 0) = coalesce(p_cursor_numeric, 0)
                AND (
                  o.created_at < p_cursor_created_at
                  OR (o.created_at = p_cursor_created_at AND o.id < p_cursor_id)
                )
              )
            ))
            OR
            (p_sort_direction = 'asc' AND (
              coalesce(o.weight_kg, 0) > coalesce(p_cursor_numeric, 0)
              OR (
                coalesce(o.weight_kg, 0) = coalesce(p_cursor_numeric, 0)
                AND (
                  o.created_at < p_cursor_created_at
                  OR (o.created_at = p_cursor_created_at AND o.id < p_cursor_id)
                )
              )
            ))
          )
        )
      )
  ),
  page_rows AS (
    SELECT *
    FROM filtered
    ORDER BY
      CASE WHEN p_sort_field = 'client_name' AND p_sort_direction = 'asc' THEN coalesce(client_name, '') END ASC,
      CASE WHEN p_sort_field = 'client_name' AND p_sort_direction = 'desc' THEN coalesce(client_name, '') END DESC,
      CASE WHEN p_sort_field = 'status' AND p_sort_direction = 'asc' THEN coalesce(status, '') END ASC,
      CASE WHEN p_sort_field = 'status' AND p_sort_direction = 'desc' THEN coalesce(status, '') END DESC,
      CASE WHEN p_sort_field = 'weight_kg' AND p_sort_direction = 'asc' THEN coalesce(weight_kg, 0) END ASC,
      CASE WHEN p_sort_field = 'weight_kg' AND p_sort_direction = 'desc' THEN coalesce(weight_kg, 0) END DESC,
      CASE WHEN p_sort_field = 'created_at' AND p_sort_direction = 'asc' THEN created_at END ASC,
      CASE WHEN p_sort_field = 'created_at' AND p_sort_direction = 'desc' THEN created_at END DESC,
      CASE WHEN p_sort_field <> 'created_at' THEN created_at END DESC,
      id DESC
    LIMIT greatest(p_page_size, 1) + 1
  ),
  limited_rows AS (
    SELECT *
    FROM page_rows
    LIMIT greatest(p_page_size, 1)
  ),
  next_row AS (
    SELECT *
    FROM limited_rows
    ORDER BY
      CASE WHEN p_sort_field = 'client_name' AND p_sort_direction = 'asc' THEN coalesce(client_name, '') END DESC,
      CASE WHEN p_sort_field = 'client_name' AND p_sort_direction = 'desc' THEN coalesce(client_name, '') END ASC,
      CASE WHEN p_sort_field = 'status' AND p_sort_direction = 'asc' THEN coalesce(status, '') END DESC,
      CASE WHEN p_sort_field = 'status' AND p_sort_direction = 'desc' THEN coalesce(status, '') END ASC,
      CASE WHEN p_sort_field = 'weight_kg' AND p_sort_direction = 'asc' THEN coalesce(weight_kg, 0) END DESC,
      CASE WHEN p_sort_field = 'weight_kg' AND p_sort_direction = 'desc' THEN coalesce(weight_kg, 0) END ASC,
      CASE WHEN p_sort_field = 'created_at' AND p_sort_direction = 'asc' THEN created_at END DESC,
      CASE WHEN p_sort_field = 'created_at' AND p_sort_direction = 'desc' THEN created_at END ASC,
      CASE WHEN p_sort_field <> 'created_at' THEN created_at END ASC,
      id ASC
    LIMIT 1
  ),
  has_more AS (
    SELECT count(*) > greatest(p_page_size, 1) AS value
    FROM page_rows
  )
  SELECT jsonb_build_object(
    'rows', (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', id,
            'created_at', created_at,
            'order_number', order_number,
            'client_id', client_id,
            'client_name', client_name,
            'source_email_from', source_email_from,
            'pickup_address', pickup_address,
            'delivery_address', delivery_address,
            'status', status,
            'priority', priority,
            'weight_kg', weight_kg,
            'vehicle_id', vehicle_id,
            'notes', notes,
            'internal_note', internal_note,
            'order_type', order_type,
            'parent_order_id', parent_order_id,
            'department_id', department_id,
            'shipment_id', shipment_id,
            'leg_number', leg_number,
            'leg_role', leg_role,
            'info_status', info_status,
            'missing_fields', missing_fields,
            'time_window_end', time_window_end
          )
        ),
        '[]'::jsonb
      )
      FROM limited_rows
    ),
    'next_cursor', (
      SELECT CASE
        WHEN (SELECT value FROM has_more)
          THEN jsonb_build_object(
            'sortField', p_sort_field,
            'sortDirection', p_sort_direction,
            'sortValue', CASE
              WHEN p_sort_field IN ('client_name', 'status') THEN to_jsonb(
                CASE
                  WHEN p_sort_field = 'client_name' THEN coalesce(client_name, '')
                  ELSE coalesce(status, '')
                END
              )
              WHEN p_sort_field = 'weight_kg' THEN to_jsonb(coalesce(weight_kg, 0))
              ELSE to_jsonb(created_at)
            END,
            'createdAt', to_jsonb(created_at),
            'id', to_jsonb(id)
          )
        ELSE NULL
      END
      FROM next_row
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.orders_page_v1(integer, text, text, uuid, text, bigint, timestamptz, text, text, text, numeric, timestamptz, uuid) TO authenticated;

COMMENT ON FUNCTION public.orders_page_v1(integer, text, text, uuid, text, bigint, timestamptz, text, text, text, numeric, timestamptz, uuid) IS
  'Returns one keyset-paginated orders page for created_at/client_name/status/weight_kg sorts, scoped via RLS.';
