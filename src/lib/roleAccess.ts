export type OfficeRole = "admin" | "medewerker";

export interface RoleAccessDefinition {
  role: OfficeRole;
  label: string;
  summary: string;
  routeAccess: string;
  can: string[];
  cannot: string[];
}

export const ROLE_ACCESS: Record<OfficeRole, RoleAccessDefinition> = {
  admin: {
    role: "admin",
    label: "Admin",
    summary: "Volledige toegang tot beheer, instellingen en operationele workflows.",
    routeAccess: "Alle kantoorpagina's, inclusief Instellingen en Gebruikers.",
    can: [
      "Gebruikers uitnodigen en rollen wijzigen",
      "Bedrijfsinstellingen, koppelingen, tarieven en notificaties beheren",
      "Operationele workflows uitvoeren: inbox, orders, planning, klanten, vloot, rapportage en facturatie",
      "Beheeracties uitvoeren die impact hebben op tenant-inrichting",
    ],
    cannot: [
      "Eigen adminrol verwijderen",
      "Beveiligde serverchecks omzeilen",
    ],
  },
  medewerker: {
    role: "medewerker",
    label: "Medewerker",
    summary: "Toegang tot dagelijkse planning en uitvoering zonder beheerrechten.",
    routeAccess: "Alle operationele kantoorpagina's, behalve Instellingen en Gebruikers.",
    can: [
      "Inbox verwerken en orders beheren",
      "Planning, ritten, klanten, vloot, tracking, exceptions, rapportage en facturatie gebruiken",
      "Operationele correcties en follow-ups uitvoeren binnen bestaande workflows",
    ],
    cannot: [
      "Gebruikers uitnodigen of rollen wijzigen",
      "Bedrijfsinstellingen en integraties aanpassen",
      "Admin-only beheerpagina's openen",
    ],
  },
};

export const OFFICE_ROLES: OfficeRole[] = ["medewerker", "admin"];
