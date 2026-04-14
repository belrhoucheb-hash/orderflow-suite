// ─── Unified Order Status System ────────────────────────────
// Single source of truth: DB statuses as used in Supabase.
// UI labels are mapped via statusLabels below.
// ─────────────────────────────────────────────────────────────

export type OrderStatus = "DRAFT" | "PENDING" | "PLANNED" | "IN_TRANSIT" | "DELIVERED" | "CANCELLED";

export interface Order {
  id: string;
  orderNumber: string;
  customer: string;
  email: string;
  phone: string;
  pickupAddress: string;
  deliveryAddress: string;
  status: OrderStatus;
  priority: "laag" | "normaal" | "hoog" | "spoed";
  items: { name: string; quantity: number; weight: number }[];
  totalWeight: number;
  vehicle?: string;
  driver?: string;
  createdAt: string;
  estimatedDelivery: string;
  notes: string;
  /** F5: order type — ZENDING (default) / RETOUR / EMBALLAGE_RUIL */
  orderType?: string;
  parentOrderId?: string | null;
  /** Prio 1: departments + shipment legs */
  departmentId?: string | null;
  departmentCode?: string | null;
  shipmentId?: string | null;
  legNumber?: number | null;
  legRole?: string | null;
}

export interface Vehicle {
  id: string;
  name: string;
  plate: string;
  type: string;
  capacity: number;
  currentLoad: number;
  status: "beschikbaar" | "onderweg" | "onderhoud";
  driver: string;
}

// Removed mockOrders and mockVehicles — App now fetches real data from Supabase

// Status colors are now centralized in @/lib/statusColors.ts
// This re-export is kept for backward compatibility
import { getStatusStyle } from "@/lib/statusColors";
export const statusColors: Record<OrderStatus, string> = {
  DRAFT: getStatusStyle("DRAFT"),
  PENDING: getStatusStyle("PENDING"),
  PLANNED: getStatusStyle("PLANNED"),
  IN_TRANSIT: getStatusStyle("IN_TRANSIT"),
  DELIVERED: getStatusStyle("DELIVERED"),
  CANCELLED: getStatusStyle("CANCELLED"),
};

export const priorityColors: Record<Order["priority"], string> = {
  laag: "bg-muted text-muted-foreground",
  normaal: "bg-blue-500/10 text-blue-700",
  hoog: "bg-amber-500/10 text-amber-700",
  spoed: "bg-primary/10 text-primary font-semibold",
};

// Status labels are now centralized in @/lib/statusColors.ts
// This re-export is kept for backward compatibility
import { STATUS_COLORS } from "@/lib/statusColors";
export const statusLabels: Record<OrderStatus, string> = {
  DRAFT: STATUS_COLORS.DRAFT.label,
  PENDING: STATUS_COLORS.PENDING.label,
  PLANNED: STATUS_COLORS.PLANNED.label,
  IN_TRANSIT: STATUS_COLORS.IN_TRANSIT.label,
  DELIVERED: STATUS_COLORS.DELIVERED.label,
  CANCELLED: STATUS_COLORS.CANCELLED.label,
};

export const vehicleStatusColors: Record<Vehicle["status"], string> = {
  beschikbaar: "bg-emerald-500/10 text-emerald-700",
  onderweg: "bg-primary/10 text-primary",
  onderhoud: "bg-amber-500/10 text-amber-700",
};
