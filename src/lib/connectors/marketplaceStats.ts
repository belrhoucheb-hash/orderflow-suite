// Mock-stats voor de marketplace top-strip.
//
// V1: hardcoded waarden per connector + globale strip-cijfers. We
// kiezen realistische, niet-misleidende getallen. Wanneer er een echte
// RPC `connector_usage_stats()` beschikbaar is, vervangen we deze
// helper door een hook met identieke shape.

export interface ConnectorUsageStat {
  slug: string;
  tenantsThisMonth: number;
}

export interface MarketplaceStripStats {
  /** Top-connector deze maand met aantal tenants. */
  topConnector: { name: string; tenants: number };
  /** Aantal nieuwe koppelingen sinds vorige maand (telt 'nieuw'-badge). */
  newSinceLastMonth: number;
  /** Marketing-claim over snelheid van bundels. */
  bundlesSpeedup: number;
}

const TENANTS_BY_SLUG: Record<string, number> = {
  snelstart: 142,
  exact_online: 118,
  nostradamus: 36,
  slack: 24,
  whatsapp_business: 19,
  shopify: 12,
};

export function getConnectorTenants(slug: string): number {
  return TENANTS_BY_SLUG[slug] ?? 0;
}

interface ConnectorLite {
  slug: string;
  name: string;
  badge?: string;
}

export function buildStripStats(connectors: readonly ConnectorLite[]): MarketplaceStripStats {
  let topName = "Snelstart";
  let topTenants = TENANTS_BY_SLUG.snelstart ?? 0;
  for (const c of connectors) {
    const t = TENANTS_BY_SLUG[c.slug];
    if (t && t > topTenants) {
      topTenants = t;
      topName = c.name;
    }
  }

  const newSinceLastMonth = connectors.filter((c) => c.badge === "nieuw").length;

  return {
    topConnector: { name: topName, tenants: topTenants },
    newSinceLastMonth: Math.max(newSinceLastMonth, 1),
    bundlesSpeedup: 60,
  };
}
