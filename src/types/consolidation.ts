export type ConsolidationStatus = "VOORSTEL" | "GOEDGEKEURD" | "INGEPLAND" | "VERWORPEN";
export const CONSOLIDATION_STATUSES: ConsolidationStatus[] = ["VOORSTEL", "GOEDGEKEURD", "INGEPLAND", "VERWORPEN"];

export const CONSOLIDATION_STATUS_LABELS: Record<ConsolidationStatus, { label: string; color: string }> = {
  VOORSTEL: { label: "Voorstel", color: "bg-blue-100 text-blue-700" },
  GOEDGEKEURD: { label: "Goedgekeurd", color: "bg-green-100 text-green-700" },
  INGEPLAND: { label: "Ingepland", color: "bg-teal-100 text-teal-700" },
  VERWORPEN: { label: "Verworpen", color: "bg-gray-100 text-gray-600" },
};

export interface ConsolidationGroup {
  id: string;
  tenant_id: string;
  name: string;
  planned_date: string;
  status: ConsolidationStatus;
  vehicle_id: string | null;
  total_weight_kg: number | null;
  total_pallets: number | null;
  total_distance_km: number | null;
  estimated_duration_min: number | null;
  utilization_pct: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  orders?: ConsolidationOrder[];
  vehicle?: { name: string; plate: string; capacityKg: number; capacityPallets: number };
}

export interface ConsolidationOrder {
  id: string;
  group_id: string;
  order_id: string;
  stop_sequence: number | null;
  pickup_sequence: number | null;
  created_at: string;
  // Joined
  order?: {
    id: string;
    order_number: number;
    client_name: string;
    delivery_address: string;
    weight_kg: number;
    quantity: number;
    requirements: string[];
    time_window_start: string | null;
    time_window_end: string | null;
  };
}

export interface ConsolidationProposal {
  regionName: string;
  orderIds: string[];
  totalWeightKg: number;
  totalPallets: number;
  estimatedDistanceKm: number;
  estimatedDurationMin: number;
  utilizationPct: number;
  suggestedVehicleId: string | null;
  warnings: string[];
}
