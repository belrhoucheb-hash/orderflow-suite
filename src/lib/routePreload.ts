type RouteLoader = () => Promise<unknown>;

const loadedRoutes = new Map<string, Promise<unknown>>();

const routeLoaders: Array<{ match: (path: string) => boolean; key: string; load: RouteLoader }> = [
  { key: "dashboard", match: (path) => path === "/", load: () => import("@/pages/Dashboard") },
  { key: "inbox", match: (path) => path === "/inbox" || path === "/mail", load: () => import("@/pages/Inbox") },
  { key: "orders-new", match: (path) => path === "/orders/nieuw", load: () => import("@/pages/NewOrder") },
  { key: "orders-detail", match: (path) => path.startsWith("/orders/") && path !== "/orders/nieuw", load: () => import("@/pages/OrderDetail") },
  { key: "orders", match: (path) => path === "/orders", load: () => import("@/pages/Orders") },
  { key: "clients-detail", match: (path) => path.startsWith("/klanten/"), load: () => import("@/pages/ClientDetail") },
  { key: "clients", match: (path) => path === "/klanten", load: () => import("@/pages/Clients") },
  { key: "planning", match: (path) => path === "/planning" || path === "/planning-v2", load: () => import("@/pages/PlanningV2") },
  { key: "trips", match: (path) => path === "/ritten", load: () => import("@/pages/ChauffeursRit") },
  { key: "drivers", match: (path) => path === "/chauffeurs", load: () => import("@/pages/Chauffeurs") },
  { key: "fleet-detail", match: (path) => path.startsWith("/vloot/"), load: () => import("@/pages/VehicleDetail") },
  { key: "fleet", match: (path) => path === "/vloot", load: () => import("@/pages/Fleet") },
  { key: "users", match: (path) => path === "/users", load: () => import("@/pages/UsersPage") },
  { key: "reporting", match: (path) => path === "/rapportage", load: () => import("@/pages/Rapportage") },
  { key: "invoicing-detail", match: (path) => path.startsWith("/facturatie/"), load: () => import("@/pages/FacturatieDetail") },
  { key: "invoicing", match: (path) => path === "/facturatie", load: () => import("@/pages/Facturatie") },
  { key: "dispatch", match: (path) => path === "/dispatch", load: () => import("@/pages/Dispatch") },
  { key: "tracking", match: (path) => path === "/tracking", load: () => import("@/pages/LiveTracking") },
  { key: "exceptions", match: (path) => path === "/exceptions", load: () => import("@/pages/Exceptions") },
  { key: "autonomy", match: (path) => path === "/autonomie", load: () => import("@/pages/Autonomie") },
  { key: "settings", match: (path) => path === "/settings" || path.startsWith("/settings/"), load: () => import("@/pages/Settings") },
  { key: "vehicle-check", match: (path) => path === "/voertuigcheck", load: () => import("@/pages/VoertuigcheckHistorie") },
  { key: "vehicle-check-detail", match: (path) => path.startsWith("/voertuigcheck/voertuig/"), load: () => import("@/pages/VoertuigcheckPerVoertuig") },
];

function normalizePath(input: string): string | null {
  try {
    const url = new URL(input, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return url.pathname.replace(/\/+$/, "") || "/";
  } catch {
    return null;
  }
}

export function preloadAppRoute(input: string | null | undefined): void {
  if (!input || typeof window === "undefined") return;

  const path = normalizePath(input);
  if (!path) return;

  const route = routeLoaders.find((entry) => entry.match(path));
  if (!route || loadedRoutes.has(route.key)) return;

  loadedRoutes.set(
    route.key,
    route.load().catch((error) => {
      loadedRoutes.delete(route.key);
      throw error;
    }),
  );
}
