export type OfficeAccessLevel = "full" | "limited" | "none";
export type OfficeAccessAction = "view" | "create" | "edit" | "delete";
export type OfficeAccessActions = Record<OfficeAccessAction, boolean>;
export type OfficeAccessMap = Record<string, { level: OfficeAccessLevel; actions: OfficeAccessActions }>;

export const fullAccessActions: OfficeAccessActions = {
  view: true,
  create: true,
  edit: true,
  delete: true,
};

export const noAccessActions: OfficeAccessActions = {
  view: false,
  create: false,
  edit: false,
  delete: false,
};

export const limitedActionsByModule: Record<string, OfficeAccessActions> = {
  Orders: { view: true, create: true, edit: false, delete: false },
  Dispatch: { view: true, create: false, edit: false, delete: false },
  Inbox: { view: true, create: true, edit: false, delete: false },
  Klanten: { view: true, create: true, edit: false, delete: false },
  Tarieven: { view: true, create: false, edit: false, delete: false },
  Facturatie: { view: true, create: true, edit: false, delete: false },
  Rapportages: { view: true, create: false, edit: false, delete: false },
  Instellingen: { view: true, create: false, edit: false, delete: false },
  Gebruikers: { view: true, create: false, edit: false, delete: false },
  "Audit logs": { view: true, create: false, edit: false, delete: false },
};

export const routeModuleMap: Array<{ module: string; paths: string[] }> = [
  { module: "Orders", paths: ["/orders"] },
  { module: "Dispatch", paths: ["/dispatch", "/planning", "/planning-v2", "/ritten"] },
  { module: "Inbox", paths: ["/inbox", "/mail"] },
  { module: "Klanten", paths: ["/klanten"] },
  { module: "Tarieven", paths: ["/settings/tarieven"] },
  { module: "Facturatie", paths: ["/facturatie"] },
  { module: "Rapportages", paths: ["/rapportage", "/autonomie"] },
  { module: "Instellingen", paths: ["/settings"] },
  { module: "Gebruikers", paths: ["/users"] },
  { module: "Audit logs", paths: ["/settings/audit", "/audit"] },
];

export const defaultAccessByRole: Record<"admin" | "medewerker", Record<string, OfficeAccessLevel>> = {
  admin: {
    Orders: "full",
    Dispatch: "full",
    Inbox: "full",
    Klanten: "full",
    Tarieven: "full",
    Facturatie: "full",
    Rapportages: "full",
    Instellingen: "full",
    Gebruikers: "full",
    "Audit logs": "full",
  },
  medewerker: {
    Orders: "full",
    Dispatch: "full",
    Inbox: "full",
    Klanten: "full",
    Tarieven: "limited",
    Facturatie: "limited",
    Rapportages: "full",
    Instellingen: "none",
    Gebruikers: "none",
    "Audit logs": "none",
  },
};

export function getAccessActions(
  module: string,
  level: OfficeAccessLevel,
  customLimitedActions?: OfficeAccessActions,
): OfficeAccessActions {
  if (level === "full") return fullAccessActions;
  if (level === "none") return noAccessActions;
  return customLimitedActions ?? limitedActionsByModule[module] ?? { view: true, create: false, edit: false, delete: false };
}

export function normalizeOfficeAccessLevel(value: unknown): OfficeAccessLevel | null {
  if (value === "full" || value === "limited" || value === "none") return value;
  return null;
}

export function moduleForPath(pathname: string) {
  const match = routeModuleMap
    .filter((item) => item.paths.some((path) => pathname === path || pathname.startsWith(`${path}/`)))
    .sort((a, b) => Math.max(...b.paths.map((path) => path.length)) - Math.max(...a.paths.map((path) => path.length)))[0];
  return match?.module ?? null;
}
