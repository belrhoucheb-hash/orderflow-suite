export interface Order {
  id: string;
  orderNumber: string;
  customer: string;
  email: string;
  phone: string;
  pickupAddress: string;
  deliveryAddress: string;
  status: "nieuw" | "in_behandeling" | "onderweg" | "afgeleverd" | "geannuleerd" | "wacht_op_antwoord";
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

export const statusColors: Record<Order["status"], string> = {
  nieuw: "bg-blue-500/10 text-blue-700 border-blue-200",
  in_behandeling: "bg-amber-500/10 text-amber-700 border-amber-200",
  onderweg: "bg-primary/10 text-primary border-primary/20",
  afgeleverd: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  geannuleerd: "bg-muted text-muted-foreground border-border",
  wacht_op_antwoord: "bg-violet-500/10 text-violet-700 border-violet-200",
};

export const priorityColors: Record<Order["priority"], string> = {
  laag: "bg-muted text-muted-foreground",
  normaal: "bg-blue-500/10 text-blue-700",
  hoog: "bg-amber-500/10 text-amber-700",
  spoed: "bg-primary/10 text-primary font-semibold",
};

export const statusLabels: Record<Order["status"], string> = {
  nieuw: "Nieuw",
  in_behandeling: "In behandeling",
  onderweg: "Onderweg",
  afgeleverd: "Afgeleverd",
  geannuleerd: "Geannuleerd",
  wacht_op_antwoord: "Wacht op antwoord",
};

export const vehicleStatusColors: Record<Vehicle["status"], string> = {
  beschikbaar: "bg-emerald-500/10 text-emerald-700",
  onderweg: "bg-primary/10 text-primary",
  onderhoud: "bg-amber-500/10 text-amber-700",
};
