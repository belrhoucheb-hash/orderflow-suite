export type PortalRole = "viewer" | "editor" | "admin";

export type OrderSource = "INTERN" | "EMAIL" | "PORTAL" | "EDI";

export interface ClientPortalUser {
  id: string;
  tenant_id: string;
  client_id: string;
  user_id: string;
  portal_role: PortalRole;
  invited_by: string | null;
  invited_at: string;
  last_login_at: string | null;
  is_active: boolean;
  created_at: string;
  // Joined fields (from profiles)
  email?: string;
  display_name?: string;
}

export interface PortalOrderInput {
  pickup_address: string;
  delivery_address: string;
  weight_kg?: number | null;
  quantity?: number | null;
  notes?: string | null;
  pickup_date?: string | null;
  delivery_date?: string | null;
  reference?: string | null;
}

export const ORDER_SOURCE_LABELS: Record<OrderSource, string> = {
  INTERN: "Intern",
  EMAIL: "E-mail",
  PORTAL: "Portaal",
  EDI: "EDI",
};

export const ORDER_SOURCE_COLORS: Record<OrderSource, string> = {
  INTERN: "bg-gray-100 text-gray-600",
  EMAIL: "bg-blue-100 text-blue-700",
  PORTAL: "bg-purple-100 text-purple-700",
  EDI: "bg-amber-100 text-amber-700",
};

export const PORTAL_ROLE_LABELS: Record<PortalRole, string> = {
  viewer: "Alleen bekijken",
  editor: "Bewerken",
  admin: "Beheerder",
};

export type PortalModule =
  | "orders"
  | "tracking"
  | "documents"
  | "invoicing"
  | "reporting"
  | "settings";

export const PORTAL_MODULE_LABELS: Record<PortalModule, string> = {
  orders: "Orders",
  tracking: "Tracking",
  documents: "Documenten",
  invoicing: "Facturatie",
  reporting: "Rapportage",
  settings: "Instellingen",
};
