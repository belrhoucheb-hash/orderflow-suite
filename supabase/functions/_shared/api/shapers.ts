// Shapers: interne DB-rows naar publieke API-DTO's.
//
// Doelen:
//   1. Geen tenant_id, geen interne IDs van aanpalende tabellen lekken.
//   2. Stabiele publieke veldnamen (we kunnen intern refactoren zonder
//      de API te breken).
//   3. Geen NULL in de output: vervang door default of laat weg.
//
// Elke resource heeft één shaper-functie. Uitbreidingen in v2 vereisen
// nieuwe shaper (v2-module) of versie-flag.

export interface PublicOrder {
  id: string;
  order_number: number | string;
  status: string;
  client_name: string | null;
  client_id: string | null;
  pickup_address: string | null;
  delivery_address: string | null;
  delivery_date: string | null;
  weight_kg: number | null;
  quantity: number | null;
  unit: string | null;
  transport_type: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
}

export function shapeOrder(row: Record<string, unknown>): PublicOrder {
  return {
    id: String(row.id),
    order_number: (row.order_number as number | string) ?? String(row.id),
    status: String(row.status ?? "DRAFT"),
    client_name: (row.client_name as string) ?? null,
    client_id: (row.client_id as string) ?? null,
    pickup_address: (row.pickup_address as string) ?? null,
    delivery_address: (row.delivery_address as string) ?? null,
    delivery_date: (row.delivery_date as string) ?? null,
    weight_kg: (row.weight_kg as number) ?? null,
    quantity: (row.quantity as number) ?? null,
    unit: (row.unit as string) ?? null,
    transport_type: (row.transport_type as string) ?? null,
    reference: (row.reference as string) ?? null,
    notes: (row.notes as string) ?? null,
    created_at: String(row.created_at),
    updated_at: (row.updated_at as string) ?? null,
  };
}

export interface PublicTrip {
  id: string;
  trip_number: number | string;
  status: string;
  dispatch_status: string | null;
  planned_date: string | null;
  driver_id: string | null;
  vehicle_id: string | null;
  created_at: string;
}

export function shapeTrip(row: Record<string, unknown>): PublicTrip {
  return {
    id: String(row.id),
    trip_number: (row.trip_number as number | string) ?? String(row.id),
    status: String(row.status ?? "PLANNED"),
    dispatch_status: (row.dispatch_status as string) ?? null,
    planned_date: (row.planned_date as string) ?? null,
    driver_id: (row.driver_id as string) ?? null,
    vehicle_id: (row.vehicle_id as string) ?? null,
    created_at: String(row.created_at),
  };
}

export interface PublicInvoice {
  id: string;
  invoice_number: string;
  status: string;
  client_id: string | null;
  client_name: string | null;
  invoice_date: string | null;
  due_date: string | null;
  subtotal: number;
  btw_amount: number;
  btw_percentage: number | null;
  total: number;
  created_at: string;
}

export function shapeInvoice(row: Record<string, unknown>): PublicInvoice {
  return {
    id: String(row.id),
    invoice_number: String(row.invoice_number),
    status: String(row.status ?? "concept"),
    client_id: (row.client_id as string) ?? null,
    client_name: (row.client_name as string) ?? null,
    invoice_date: (row.invoice_date as string) ?? null,
    due_date: (row.due_date as string) ?? null,
    subtotal: Number(row.subtotal ?? 0),
    btw_amount: Number(row.btw_amount ?? 0),
    btw_percentage: (row.btw_percentage as number) ?? null,
    total: Number(row.total ?? 0),
    created_at: String(row.created_at),
  };
}

export interface PublicClient {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  kvk_number: string | null;
  btw_number: string | null;
  is_active: boolean;
  created_at: string;
}

export function shapeClient(row: Record<string, unknown>): PublicClient {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    address: (row.address as string) ?? null,
    city: (row.city as string) ?? null,
    country: (row.country as string) ?? null,
    email: (row.email as string) ?? null,
    phone: (row.phone as string) ?? null,
    kvk_number: (row.kvk_number as string) ?? null,
    btw_number: (row.btw_number as string) ?? null,
    is_active: Boolean(row.is_active ?? true),
    created_at: String(row.created_at),
  };
}
