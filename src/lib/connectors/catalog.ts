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
export type ConnectorCategory =
  | "boekhouding"
  | "telematica"
  | "communicatie"
  | "webshop_erp"
  | "klantportaal"
  | "overig";

export interface ConnectorDefinition {
  /** Slug die ook wordt gebruikt in integration_credentials.provider en URL-pad. */
  slug: string;
  /** Naam zoals getoond in UI. */
  name: string;
  /** Eén zin om de connector in de catalogus te beschrijven. */
  description: string;
  category: ConnectorCategory;
  status: ConnectorStatus;
  /** Optioneel pad of URL naar officieel logo. Leeg = brand-tile fallback. */
  logoUrl?: string;
  /** Hex-kleur voor de brand-tile fallback (zonder #). */
  brandColor: string;
  /** Korte tekst (1-3 chars) op de brand-tile. */
  brandInitial: string;
  authType: ConnectorAuthType;
  /** Webhook-events waar deze connector op kan reageren bij push. */
  supportedEvents: string[];
  /** Mapping-keys die de tenant kan overrulen. Komt 1-op-1 in de Mapping-tab. */
  mappingKeys: Array<{ key: string; label: string; placeholder: string }>;
  /** Tekst die in de Verbinding-tab als help wordt getoond. */
  setupHint: string;
  /** Optionele marketplace-tags zoals "OAuth", "Realtime", "Bidirectioneel". */
  capabilities?: string[];
  /** Optioneel marketplace-badge. */
  badge?: "officieel" | "populair" | "nieuw" | "aanbevolen";
  /** Curatie-flag, marketplace zet 'featured' connectors bovenaan in de Aanbevolen-rij. */
  featured?: boolean;
}

const SOON_STUB: Pick<ConnectorDefinition, "mappingKeys" | "supportedEvents" | "setupHint"> = {
  mappingKeys: [],
  supportedEvents: [],
  setupHint: "Deze koppeling is in voorbereiding.",
};

export const CONNECTOR_CATALOG: ConnectorDefinition[] = [
  // BOEKHOUDING
  {
    slug: "snelstart",
    name: "Snelstart",
    description: "Boek facturen automatisch in als verkoopboeking in je Snelstart-administratie.",
    category: "boekhouding",
    status: "live",
    logoUrl: "/integrations/snelstart.svg",
    brandColor: "E63312",
    brandInitial: "S",
    authType: "client_credentials",
    supportedEvents: ["invoice.sent"],
    capabilities: ["API key", "Push-sync", "NL"],
    badge: "populair",
    featured: true,
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
    logoUrl: "/integrations/exact-online.svg",
    brandColor: "ED1C24",
    brandInitial: "E",
    authType: "oauth2",
    supportedEvents: ["invoice.sent"],
    capabilities: ["OAuth 2.0", "Bidirectioneel", "NL/BE"],
    badge: "officieel",
    featured: true,
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
    description: "Verkoopboekingen exporteren naar Twinfield (Wolters Kluwer).",
    category: "boekhouding",
    status: "soon",
    logoUrl: "/integrations/twinfield.svg",
    brandColor: "0066B3",
    brandInitial: "Tw",
    authType: "oauth2",
    capabilities: ["OAuth 2.0", "NL/BE"],
    ...SOON_STUB,
  },
  {
    slug: "afas",
    name: "AFAS Profit",
    description: "AFAS Profit-koppeling voor financiële sync en debiteurenbeheer.",
    category: "boekhouding",
    status: "soon",
    logoUrl: "/integrations/afas.svg",
    brandColor: "00529F",
    brandInitial: "AF",
    authType: "api_key",
    capabilities: ["API key", "Bidirectioneel"],
    ...SOON_STUB,
  },
  {
    slug: "yuki",
    name: "Yuki",
    description: "Verkoopfacturen direct in Yuki boeken voor automatische administratie.",
    category: "boekhouding",
    status: "soon",
    logoUrl: "/integrations/yuki.svg",
    brandColor: "F39C12",
    brandInitial: "Y",
    authType: "api_key",
    capabilities: ["API key", "NL"],
    ...SOON_STUB,
  },
  {
    slug: "moneybird",
    name: "Moneybird",
    description: "Push facturen naar Moneybird en lees betaalstatus terug.",
    category: "boekhouding",
    status: "soon",
    logoUrl: "/integrations/moneybird.svg",
    brandColor: "23B26C",
    brandInitial: "M",
    authType: "oauth2",
    capabilities: ["OAuth 2.0", "Bidirectioneel"],
    ...SOON_STUB,
  },
  {
    slug: "e_boekhouden",
    name: "e-Boekhouden.nl",
    description: "Boekhoudkoppeling voor MKB met automatische verkoopboekingen.",
    category: "boekhouding",
    status: "soon",
    logoUrl: "/integrations/e-boekhouden.svg",
    brandColor: "16A085",
    brandInitial: "eB",
    authType: "api_key",
    capabilities: ["API key", "NL"],
    ...SOON_STUB,
  },
  {
    slug: "visma",
    name: "Visma.net",
    description: "ERP-koppeling met Visma.net voor financiële administratie.",
    category: "boekhouding",
    status: "soon",
    logoUrl: "/integrations/visma.svg",
    brandColor: "1F36C7",
    brandInitial: "V",
    authType: "oauth2",
    capabilities: ["OAuth 2.0", "EU"],
    ...SOON_STUB,
  },

  // TELEMATICA
  {
    slug: "nostradamus",
    name: "Nostradamus",
    description: "Gewerkte uren per chauffeur importeren uit Nostradamus tijdregistratie.",
    category: "telematica",
    status: "beta",
    logoUrl: "/integrations/nostradamus.svg",
    brandColor: "164A7A",
    brandInitial: "No",
    authType: "api_key",
    supportedEvents: [],
    capabilities: ["API key", "Tijdregistratie"],
    badge: "nieuw",
    featured: true,
    mappingKeys: [
      { key: "response_array_path", label: "Array-pad in response", placeholder: "data.records" },
      { key: "personnel_number_field", label: "Veld personeelsnummer", placeholder: "employeeNumber" },
      { key: "work_date_field", label: "Veld werkdatum", placeholder: "date" },
      { key: "hours_field", label: "Veld uren", placeholder: "workedHours" },
      { key: "details_path", label: "Pad details-tab", placeholder: "details" },
      { key: "contract_path", label: "Pad contract-tab", placeholder: "contract" },
      { key: "hours_path", label: "Pad uren-tab", placeholder: "hours" },
      { key: "leave_path", label: "Pad verlof-tab", placeholder: "leave" },
      { key: "sickness_path", label: "Pad ziekte-tab", placeholder: "sickness" },
      { key: "files_path", label: "Pad bestanden-tab", placeholder: "files" },
    ],
    setupHint:
      "Vul de API-basis-URL, endpoint-pad en token in. Mapping gebruikt het personeelsnummer op de chauffeurkaart om Nostradamus-records te koppelen.",
  },
  {
    slug: "webfleet",
    name: "Webfleet",
    description: "Voertuigposities en ritregistratie ophalen uit Webfleet (Bridgestone).",
    category: "telematica",
    status: "soon",
    logoUrl: "/integrations/webfleet.svg",
    brandColor: "E2231A",
    brandInitial: "Wf",
    authType: "api_key",
    capabilities: ["API key", "Realtime"],
    ...SOON_STUB,
  },
  {
    slug: "samsara",
    name: "Samsara",
    description: "Voertuigposities, kilometerstanden en chauffeur-uren uit Samsara.",
    category: "telematica",
    status: "soon",
    logoUrl: "/integrations/samsara.svg",
    brandColor: "1F2D55",
    brandInitial: "Sa",
    authType: "api_key",
    capabilities: ["API key", "Realtime", "Bidirectioneel"],
    ...SOON_STUB,
  },
  {
    slug: "geotab",
    name: "Geotab",
    description: "MyGeotab-koppeling voor live posities, telemetrie en rij-events.",
    category: "telematica",
    status: "soon",
    logoUrl: "/integrations/geotab.svg",
    brandColor: "34495E",
    brandInitial: "G",
    authType: "api_key",
    capabilities: ["API key", "Realtime"],
    ...SOON_STUB,
  },
  {
    slug: "tomtom_telematics",
    name: "TomTom Telematics",
    description: "TomTom WEBFLEET.connect API voor live tracking en ritboek.",
    category: "telematica",
    status: "soon",
    logoUrl: "/integrations/tomtom.svg",
    brandColor: "DF1B12",
    brandInitial: "TT",
    authType: "api_key",
    capabilities: ["API key", "Realtime"],
    ...SOON_STUB,
  },
  {
    slug: "mix_telematics",
    name: "MiX Telematics",
    description: "MiX Telematics Vision API voor positie en chauffeurgedrag.",
    category: "telematica",
    status: "soon",
    logoUrl: "/integrations/mix-telematics.svg",
    brandColor: "005FA8",
    brandInitial: "MiX",
    authType: "api_key",
    capabilities: ["API key", "Wereldwijd"],
    ...SOON_STUB,
  },

  // COMMUNICATIE
  {
    slug: "slack",
    name: "Slack",
    description: "Stuur orders, exceptions en planner-meldingen direct naar Slack-kanalen.",
    category: "communicatie",
    status: "soon",
    logoUrl: "/integrations/slack.svg",
    brandColor: "4A154B",
    brandInitial: "Sl",
    authType: "oauth2",
    capabilities: ["OAuth 2.0", "Webhooks"],
    badge: "aanbevolen",
    featured: true,
    ...SOON_STUB,
  },
  {
    slug: "microsoft_teams",
    name: "Microsoft Teams",
    description: "Push notificaties en order-events naar je Teams-kanalen.",
    category: "communicatie",
    status: "soon",
    logoUrl: "/integrations/teams.svg",
    brandColor: "5059C9",
    brandInitial: "T",
    authType: "oauth2",
    capabilities: ["OAuth 2.0", "Webhooks"],
    ...SOON_STUB,
  },
  {
    slug: "whatsapp_business",
    name: "WhatsApp Business",
    description: "Verstuur klant-updates en POD-bevestigingen via WhatsApp Business API.",
    category: "communicatie",
    status: "soon",
    logoUrl: "/integrations/whatsapp.svg",
    brandColor: "25D366",
    brandInitial: "Wa",
    authType: "api_key",
    capabilities: ["API key", "Cloud API"],
    badge: "populair",
    ...SOON_STUB,
  },
  {
    slug: "twilio",
    name: "Twilio",
    description: "SMS- en voice-notificaties via Twilio voor klant- en chauffeurberichten.",
    category: "communicatie",
    status: "soon",
    logoUrl: "/integrations/twilio.svg",
    brandColor: "F22F46",
    brandInitial: "Tw",
    authType: "api_key",
    capabilities: ["API key", "SMS", "Voice"],
    ...SOON_STUB,
  },

  // WEBSHOP / ERP
  {
    slug: "shopify",
    name: "Shopify",
    description: "Importeer Shopify-orders direct als ritten in OrderFlow.",
    category: "webshop_erp",
    status: "soon",
    logoUrl: "/integrations/shopify.svg",
    brandColor: "95BF47",
    brandInitial: "Sh",
    authType: "oauth2",
    capabilities: ["OAuth 2.0", "Webhooks", "Realtime"],
    ...SOON_STUB,
  },
  {
    slug: "sap_business_one",
    name: "SAP Business One",
    description: "Bidirectionele koppeling met SAP B1 voor verkooporders en facturen.",
    category: "webshop_erp",
    status: "soon",
    logoUrl: "/integrations/sap.svg",
    brandColor: "0FAAFF",
    brandInitial: "SAP",
    authType: "api_key",
    capabilities: ["Service Layer", "Bidirectioneel"],
    ...SOON_STUB,
  },
];

export function findConnector(slug: string): ConnectorDefinition | undefined {
  return CONNECTOR_CATALOG.find((c) => c.slug === slug);
}

export function connectorsByCategory(): Record<ConnectorCategory, ConnectorDefinition[]> {
  const grouped: Record<ConnectorCategory, ConnectorDefinition[]> = {
    boekhouding: [],
    telematica: [],
    communicatie: [],
    webshop_erp: [],
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
  communicatie: "Communicatie",
  webshop_erp: "Webshop & ERP",
  klantportaal: "Klantportalen",
  overig: "Overig",
};
