// Connector-catalogus.
//
// Hardcoded lijst van beschikbare integraties. Status:
//   - 'live'  , werkende connector, edge function bestaat
//   - 'beta'  , werkende maar nog niet algemeen beschikbaar
//   - 'soon'  , aangekondigd, geen edge function, kaart als teaser
//
// Nieuwe connector toevoegen = regel hier + edge function + per-connector
// docs onder docs/connectors/. Geen DB-migratie nodig.

export type ConnectorStatus = "live" | "beta" | "soon";
export type ConnectorAuthType = "oauth2" | "api_key" | "client_credentials";
export type ConnectorCategory = "boekhouding" | "telematica" | "klantportaal" | "overig";

export interface ConnectorDefinition {
  /** Slug die ook wordt gebruikt in integration_credentials.provider en URL-pad. */
  slug: string;
  /** Naam zoals getoond in UI. */
  name: string;
  /** Eén zin om de connector in de catalogus te beschrijven. */
  description: string;
  category: ConnectorCategory;
  status: ConnectorStatus;
  /** Pad naar logo (publieke URL of /logos/...). */
  logoUrl: string;
  authType: ConnectorAuthType;
  /** Webhook-events waar deze connector op kan reageren bij push. */
  supportedEvents: string[];
  /** Mapping-keys die de tenant kan overrulen. Komt 1-op-1 in de Mapping-tab. */
  mappingKeys: Array<{ key: string; label: string; placeholder: string }>;
  /** Tekst die in de Verbinding-tab als help wordt getoond. */
  setupHint: string;
}

export const CONNECTOR_CATALOG: ConnectorDefinition[] = [
  {
    slug: "snelstart",
    name: "Snelstart",
    description: "Boek facturen automatisch in als verkoopboeking in je Snelstart-administratie.",
    category: "boekhouding",
    status: "live",
    logoUrl: "/logos/snelstart.svg",
    authType: "client_credentials",
    supportedEvents: ["invoice.sent"],
    mappingKeys: [
      { key: "default_grootboek", label: "Standaard grootboek (verkoop)", placeholder: "8000" },
      { key: "btw_grootboek", label: "BTW grootboek", placeholder: "1500" },
      { key: "debtor_number_start", label: "Debiteur startnummer", placeholder: "10000" },
    ],
    setupHint:
      "Vraag in Snelstart een Client Key en Subscription Key aan via je administratie. " +
      "Vul daarnaast de administratie-ID in. Je vindt die onder Bedrijfsinstellingen.",
  },
  {
    slug: "exact_online",
    name: "Exact Online",
    description: "OAuth2-koppeling met Exact Online voor verkoopboekingen en debiteurenstatus.",
    category: "boekhouding",
    status: "live",
    logoUrl: "/logos/exact.svg",
    authType: "oauth2",
    supportedEvents: ["invoice.sent"],
    mappingKeys: [
      { key: "default_grootboek", label: "Verkoop grootboek-rekening", placeholder: "8000" },
      { key: "btw_grootboek", label: "BTW grootboek-rekening", placeholder: "1500" },
      { key: "debtor_number_start", label: "Debiteur startnummer", placeholder: "10000" },
    ],
    setupHint:
      "Klik op Verbinden om in te loggen bij Exact Online en toegang te geven. " +
      "Je wordt na inlog terug gestuurd naar OrderFlow.",
  },
  {
    slug: "twinfield",
    name: "Twinfield",
    description: "Verkoopboekingen exporteren naar Twinfield (binnenkort beschikbaar).",
    category: "boekhouding",
    status: "soon",
    logoUrl: "/logos/twinfield.svg",
    authType: "oauth2",
    supportedEvents: ["invoice.sent"],
    mappingKeys: [],
    setupHint: "Deze connector is in voorbereiding.",
  },
  {
    slug: "afas",
    name: "AFAS",
    description: "AFAS Profit-koppeling voor financiële sync (binnenkort).",
    category: "boekhouding",
    status: "soon",
    logoUrl: "/logos/afas.svg",
    authType: "api_key",
    supportedEvents: ["invoice.sent"],
    mappingKeys: [],
    setupHint: "Deze connector is in voorbereiding.",
  },
  {
    slug: "webfleet",
    name: "Webfleet (Bridgestone)",
    description: "Voertuigposities en ritregistratie ophalen uit Webfleet.",
    category: "telematica",
    status: "soon",
    logoUrl: "/logos/webfleet.svg",
    authType: "api_key",
    supportedEvents: [],
    mappingKeys: [],
    setupHint: "Deze connector is in voorbereiding.",
  },
  {
    slug: "samsara",
    name: "Samsara",
    description: "Voertuigposities, kilometerstanden en chauffeur-uren uit Samsara.",
    category: "telematica",
    status: "soon",
    logoUrl: "/logos/samsara.svg",
    authType: "api_key",
    supportedEvents: [],
    mappingKeys: [],
    setupHint: "Deze connector is in voorbereiding.",
  },
];

export function findConnector(slug: string): ConnectorDefinition | undefined {
  return CONNECTOR_CATALOG.find((c) => c.slug === slug);
}

export function connectorsByCategory(): Record<ConnectorCategory, ConnectorDefinition[]> {
  const grouped: Record<ConnectorCategory, ConnectorDefinition[]> = {
    boekhouding: [],
    telematica: [],
    klantportaal: [],
    overig: [],
  };
  for (const c of CONNECTOR_CATALOG) {
    grouped[c.category].push(c);
  }
  return grouped;
}

export const CATEGORY_LABELS: Record<ConnectorCategory, string> = {
  boekhouding: "Boekhouding",
  telematica: "Telematica",
  klantportaal: "Klantportalen",
  overig: "Overig",
};
