import { describe, it, expect } from "vitest";
import {
  CONNECTOR_CATALOG,
  findConnector,
  connectorsByCategory,
  CATEGORY_LABELS,
  type ConnectorDefinition,
} from "@/lib/connectors/catalog";
import {
  withRetry,
  mappingValue,
  credentialValue,
  type ConnectorConfig,
} from "../../supabase/functions/_shared/connectors/runtime";

// ─── Catalog ────────────────────────────────────────────────────────

describe("CONNECTOR_CATALOG", () => {
  it("heeft minstens snelstart en exact_online als live", () => {
    const slugs = CONNECTOR_CATALOG.map((c) => c.slug);
    expect(slugs).toContain("snelstart");
    expect(slugs).toContain("exact_online");
    const snelstart = CONNECTOR_CATALOG.find((c) => c.slug === "snelstart")!;
    const exact = CONNECTOR_CATALOG.find((c) => c.slug === "exact_online")!;
    expect(snelstart.status).toBe("live");
    expect(exact.status).toBe("live");
  });

  it("heeft geen duplicate slugs", () => {
    const seen = new Set<string>();
    for (const c of CONNECTOR_CATALOG) {
      expect(seen.has(c.slug)).toBe(false);
      seen.add(c.slug);
    }
  });

  it("heeft alle vereiste velden per connector", () => {
    for (const c of CONNECTOR_CATALOG) {
      expect(c.slug).toMatch(/^[a-z_]+$/);
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.description.length).toBeGreaterThan(0);
      expect(["boekhouding", "telematica", "klantportaal", "overig"]).toContain(c.category);
      expect(["live", "beta", "soon"]).toContain(c.status);
      expect(["oauth2", "api_key", "client_credentials"]).toContain(c.authType);
      expect(Array.isArray(c.supportedEvents)).toBe(true);
      expect(Array.isArray(c.mappingKeys)).toBe(true);
    }
  });

  it("invoice-events bestaan op live boekhouding-connectoren", () => {
    const liveBoek = CONNECTOR_CATALOG.filter(
      (c) => c.status === "live" && c.category === "boekhouding",
    );
    for (const c of liveBoek) {
      expect(c.supportedEvents).toContain("invoice.sent");
    }
  });
});

describe("findConnector", () => {
  it("vindt op slug", () => {
    expect(findConnector("snelstart")?.slug).toBe("snelstart");
  });
  it("returnt undefined voor onbekend", () => {
    expect(findConnector("nonexistent")).toBeUndefined();
  });
});

describe("connectorsByCategory", () => {
  it("groepeert alle connectoren onder de juiste categorie", () => {
    const grouped = connectorsByCategory();
    const total = Object.values(grouped).reduce((s, arr) => s + arr.length, 0);
    expect(total).toBe(CONNECTOR_CATALOG.length);
  });
  it("heeft labels voor alle categorieën", () => {
    expect(CATEGORY_LABELS.boekhouding).toBeTruthy();
    expect(CATEGORY_LABELS.telematica).toBeTruthy();
    expect(CATEGORY_LABELS.klantportaal).toBeTruthy();
    expect(CATEGORY_LABELS.overig).toBeTruthy();
  });
});

// ─── Runtime: withRetry ─────────────────────────────────────────────

describe("withRetry", () => {
  it("retried op 503-achtige errors", async () => {
    let attempts = 0;
    const result = await withRetry(async () => {
      attempts++;
      if (attempts < 2) throw new Error("503 service unavailable");
      return "ok";
    }, () => true);
    expect(result).toBe("ok");
    expect(attempts).toBe(2);
  });

  it("gooit door als isRetriable false geeft", async () => {
    let attempts = 0;
    await expect(
      withRetry(async () => {
        attempts++;
        throw new Error("400 bad request");
      }, () => false),
    ).rejects.toThrow("400");
    expect(attempts).toBe(1);
  });

  it("stopt na MAX_ATTEMPTS", async () => {
    let attempts = 0;
    await expect(
      withRetry(async () => {
        attempts++;
        throw new Error("network down");
      }, () => true),
    ).rejects.toThrow("network down");
    expect(attempts).toBe(3);
  }, 20_000);
});

// ─── Runtime: helpers ───────────────────────────────────────────────

describe("mappingValue and credentialValue", () => {
  const config: ConnectorConfig = {
    tenantId: "t-1",
    provider: "snelstart",
    credentials: { clientKey: "abc", subscriptionKey: "xyz" },
    mapping: { default_grootboek: "8200" },
  };

  it("mappingValue gebruikt override boven default", () => {
    expect(mappingValue(config, "default_grootboek", "8000")).toBe("8200");
  });

  it("mappingValue valt terug op default als key ontbreekt", () => {
    expect(mappingValue(config, "btw_grootboek", "1500")).toBe("1500");
  });

  it("credentialValue leest credentials", () => {
    expect(credentialValue(config, "clientKey")).toBe("abc");
    expect(credentialValue(config, "missing")).toBeUndefined();
  });
});

// ─── Connector interface contract ──────────────────────────────────

describe("triggerConnectors filter", () => {
  it("herkent invoice.sent en invoice.created als connector-events", async () => {
    const { isConnectorEvent } = await import(
      "../../supabase/functions/_shared/trigger-connectors"
    );
    expect(isConnectorEvent("invoice.sent")).toBe(true);
    expect(isConnectorEvent("invoice.created")).toBe(true);
  });

  it("negeert order- en trip-events", async () => {
    const { isConnectorEvent } = await import(
      "../../supabase/functions/_shared/trigger-connectors"
    );
    expect(isConnectorEvent("order.created")).toBe(false);
    expect(isConnectorEvent("trip.completed")).toBe(false);
    expect(isConnectorEvent("invoice.paid")).toBe(false);
  });
});

describe("Connector implementaties", () => {
  it("snelstart-impl exporteert push en testConnection", async () => {
    const mod = await import(
      "../../supabase/functions/_shared/connectors/snelstart-impl"
    );
    expect(typeof mod.SnelstartConnector.push).toBe("function");
    expect(typeof mod.SnelstartConnector.testConnection).toBe("function");
  });

  it("exact-impl exporteert push en testConnection", async () => {
    const mod = await import(
      "../../supabase/functions/_shared/connectors/exact-impl"
    );
    expect(typeof mod.ExactConnector.push).toBe("function");
    expect(typeof mod.ExactConnector.testConnection).toBe("function");
  });
});

// ─── Snelstart push: weigert verkeerde events ─────────────────────

describe("SnelstartConnector.push event-validatie", () => {
  it("weigert order.created", async () => {
    const { SnelstartConnector } = await import(
      "../../supabase/functions/_shared/connectors/snelstart-impl"
    );
    const result = await SnelstartConnector.push(
      "order.created",
      { entity_id: "abc" },
      {
        tenantId: "t-1",
        provider: "snelstart",
        credentials: { mockMode: true },
        mapping: {},
      },
      {} as any,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("niet ondersteund");
  });

  it("weigert push zonder entity_id", async () => {
    const { SnelstartConnector } = await import(
      "../../supabase/functions/_shared/connectors/snelstart-impl"
    );
    const result = await SnelstartConnector.push(
      "invoice.sent",
      {},
      {
        tenantId: "t-1",
        provider: "snelstart",
        credentials: { mockMode: true },
        mapping: {},
      },
      {} as any,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("entity_id");
  });
});
