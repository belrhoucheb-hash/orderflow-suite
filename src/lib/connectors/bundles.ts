/**
 * Bundles, hand-gecureerde combinaties van connectors die samen een use-case dekken.
 * Geen DB-binding, hardcoded zodat productowner ze kan curaten zonder migratie.
 */

export interface ConnectorBundle {
  id: string;
  title: string;
  blurb: string;
  /** Connector-slugs in setup-volgorde. */
  slugs: string[];
  /** Tailwind gradient-class voor card-achtergrond. */
  accent: string;
  /** Korte tagline voor de detail-hero. */
  tagline: string;
  /** Iconnaam uit lucide-react. */
  icon: "sparkles" | "radio" | "map-pin" | "package";
}

export const CONNECTOR_BUNDLES: ConnectorBundle[] = [
  {
    id: "boekhouding-nl",
    title: "Boekhouding NL",
    blurb: "Snelstart en Exact, klaar voor verkoopboekingen vanaf dag 1.",
    tagline: "Vanaf de eerste rit factureren naar je administratie",
    slugs: ["snelstart", "exact_online"],
    accent: "from-rose-50 to-amber-50",
    icon: "sparkles",
  },
  {
    id: "klant-communicatie",
    title: "Klantcommunicatie",
    blurb: "WhatsApp, Slack en Twilio voor live klant- en team-updates.",
    tagline: "Eén klik om klanten en team realtime te informeren",
    slugs: ["whatsapp_business", "slack", "twilio"],
    accent: "from-emerald-50 to-sky-50",
    icon: "radio",
  },
  {
    id: "fleet-pro",
    title: "Fleet pro",
    blurb: "Live tracking en chauffeurinzicht via Webfleet en Samsara.",
    tagline: "Voertuigposities en chauffeur-uren bij elkaar",
    slugs: ["webfleet", "samsara"],
    accent: "from-slate-50 to-indigo-50",
    icon: "map-pin",
  },
];

export function findBundle(id: string): ConnectorBundle | undefined {
  return CONNECTOR_BUNDLES.find((b) => b.id === id);
}
