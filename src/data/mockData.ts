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

export const statusColors: Record<OrderStatus, string> = {
  DRAFT: "bg-blue-500/10 text-blue-700 border-blue-200",
  PENDING: "bg-amber-500/10 text-amber-700 border-amber-200",
  PLANNED: "bg-violet-500/10 text-violet-700 border-violet-200",
  IN_TRANSIT: "bg-primary/10 text-primary border-primary/20",
  DELIVERED: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  CANCELLED: "bg-muted text-muted-foreground border-border",
};

export const priorityColors: Record<Order["priority"], string> = {
  laag: "bg-muted text-muted-foreground",
  normaal: "bg-blue-500/10 text-blue-700",
  hoog: "bg-amber-500/10 text-amber-700",
  spoed: "bg-primary/10 text-primary font-semibold",
};

export const statusLabels: Record<OrderStatus, string> = {
  DRAFT: "Nieuw",
  PENDING: "In behandeling",
  PLANNED: "Ingepland",
  IN_TRANSIT: "Onderweg",
  DELIVERED: "Afgeleverd",
  CANCELLED: "Geannuleerd",
};

export const vehicleStatusColors: Record<Vehicle["status"], string> = {
  beschikbaar: "bg-emerald-500/10 text-emerald-700",
  onderweg: "bg-primary/10 text-primary",
  onderhoud: "bg-amber-500/10 text-amber-700",
};
