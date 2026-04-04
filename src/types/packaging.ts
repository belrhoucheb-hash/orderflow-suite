// ─── Retourzendingen & Emballage Types ─────────────────────

export type OrderType = "ZENDING" | "RETOUR" | "EMBALLAGE_RUIL";
export type ReturnReason = "BESCHADIGD" | "VERKEERD" | "WEIGERING" | "OVERSCHOT" | "OVERIG";
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
  created_at: string;
  // Joined
  loading_unit?: { name: string; code: string };
  client?: { name: string };
}

export interface PackagingBalance {
  tenant_id: string;
  client_id: string;
  loading_unit_id: string;
  loading_unit_name: string;
  loading_unit_code: string;
  client_name: string;
  balance: number;
  total_movements: number;
  last_movement_at: string | null;
}

export const ORDER_TYPE_LABELS: Record<OrderType, { label: string; color: string }> = {
  ZENDING: { label: "Zending", color: "bg-blue-100 text-blue-700" },
  RETOUR: { label: "Retour", color: "bg-amber-100 text-amber-700" },
  EMBALLAGE_RUIL: { label: "Emballage ruil", color: "bg-purple-100 text-purple-700" },
};

export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  BESCHADIGD: "Beschadigd",
  VERKEERD: "Verkeerd geleverd",
  WEIGERING: "Geweigerd door ontvanger",
  OVERSCHOT: "Overschot",
  OVERIG: "Overig",
};

export const DIRECTION_LABELS: Record<PackagingDirection, { label: string; color: string }> = {
  UIT: { label: "Uitgegeven", color: "bg-red-100 text-red-700" },
  IN: { label: "Ingenomen", color: "bg-green-100 text-green-700" },
};
