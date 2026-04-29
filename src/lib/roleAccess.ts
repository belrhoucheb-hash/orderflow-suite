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
    routeAccess: "Instellingen, gebruikers en tarieven",
    can: [
      "Gebruikers beheren",
      "Orders uitvoeren",
      "Rapportages bekijken",
      "Instellingen en tarieven wijzigen",
    ],
    cannot: [
      "Eigen account verwijderen",
      "Security overschrijven",
    ],
  },
  medewerker: {
    role: "medewerker",
    label: "Medewerker",
    summary: "Toegang tot dagelijkse planning en uitvoering zonder beheerrechten.",
    routeAccess: "Orders, planning en inbox",
    can: [
      "Orders uitvoeren",
      "Planning beheren",
      "Inbox verwerken",
      "Rapportages bekijken",
    ],
    cannot: [
      "Gebruikers beheren",
      "Instellingen wijzigen",
      "Tarieven aanpassen",
    ],
  },
};

export const OFFICE_ROLES: OfficeRole[] = ["medewerker", "admin"];
