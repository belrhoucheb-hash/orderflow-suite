/**
 * F5: Retourzendingen & Emballage — TypeScript types
 * These types reflect the packaging_movements table and packaging_balances view.
 * The orders table is extended with order_type and return_reason via supabaseHelpers.
 */

export type OrderType = "ZENDING" | "RETOUR" | "EMBALLAGE_RUIL";

export type ReturnReason =
  | "BESCHADIGD"
  | "VERKEERD"
  | "WEIGERING"
  | "OVERSCHOT"
  | "OVERIG";

export type PackagingDirection = "UIT" | "IN";

export interface PackagingMovement {
  id: string;
  tenant_id: string;
  client_id: string;
  order_id: string | null;
  trip_stop_id: string | null;
  loading_unit_id: string;
  direction: PackagingDirection;
  quantity: number;
  recorded_by: string | null;
  recorded_at: string;
  notes: string | null;
  // Joined fields (optional, when fetched with select)
  loading_unit?: { id: string; name: string; code: string };
  client?: { id: string; name: string };
}

export interface PackagingMovementInsert {
  tenant_id: string;
  client_id: string;
  order_id?: string | null;
  trip_stop_id?: string | null;
  loading_unit_id: string;
  direction: PackagingDirection;
  quantity: number;
  recorded_by?: string | null;
  notes?: string | null;
}

export interface PackagingBalance {
  tenant_id: string;
  client_id: string;
  loading_unit_id: string;
  balance: number;
  // Joined fields
  loading_unit?: { id: string; name: string; code: string };
  client?: { id: string; name: string };
}

export interface LoadingUnit {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  default_weight_kg: number | null;
  default_dimensions: string | null;
  is_active: boolean | null;
  sort_order: number | null;
  created_at: string;
}

/** Extended order fields for retour orders */
export interface RetourOrderCreate {
  parent_order_id: string;
  order_type: OrderType;
  return_reason: ReturnReason;
  client_name: string | null;
  tenant_id: string;
  pickup_address: string | null;
  delivery_address: string | null;
  weight_kg: number | null;
  quantity: number | null;
  unit: string | null;
  notes?: string | null;
  priority: string;
}
