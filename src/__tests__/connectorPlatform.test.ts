import { describe, it, expect } from "vitest";
import {
  CONNECTOR_CATALOG,
  findConnector,
  connectorsByCategory,
  CATEGORY_LABELS,
  type ConnectorDefinition,
} from "@/lib/connectors/catalog";
import { getSourceFields, findSourceField } from "@/lib/connectors/sourceFields";
import { getMappingTemplates } from "@/lib/connectors/mappingTemplates";
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

// ─── Source fields ──────────────────────────────────────────────────

describe("connector source fields", () => {
  it("levert order-velden voor boekhouding-connectors", () => {
    const fields = getSourceFields("snelstart");
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.find((f) => f.key === "orderNumber")).toBeDefined();
    expect(fields.find((f) => f.key === "vatAmount")).toBeDefined();
  });

  it("levert chauffeur-velden voor nostradamus", () => {
    const fields = getSourceFields("nostradamus");
    expect(fields.find((f) => f.key === "personnelNumber")).toBeDefined();
    expect(fields.find((f) => f.key === "hoursWorked")).toBeDefined();
  });

  it("returnt lege lijst voor onbekende provider", () => {
    expect(getSourceFields("does_not_exist")).toEqual([]);
  });

  it("findSourceField vindt veld op key", () => {
    expect(findSourceField("snelstart", "totalAmount")?.label).toBe("Totaalbedrag");
    expect(findSourceField("snelstart", "nope")).toBeUndefined();
  });
});

// ─── Mapping templates ──────────────────────────────────────────────

describe("connector mapping templates", () => {
  it("Snelstart heeft NL en EU template", () => {
    const tpls = getMappingTemplates("snelstart");
    const ids = tpls.map((t) => t.id);
    expect(ids).toContain("standaard_nl");
    expect(ids).toContain("eu_compliance");
  });

  it("template-keys matchen connector mappingKeys", () => {
    for (const slug of ["snelstart", "exact_online", "nostradamus"]) {
      const connector = findConnector(slug)!;
      const mappingKeys = new Set(connector.mappingKeys.map((m) => m.key));
      const templates = getMappingTemplates(slug);
      for (const tpl of templates) {
        for (const key of Object.keys(tpl.values)) {
          expect(mappingKeys.has(key), `${slug} template ${tpl.id} bevat onbekende key ${key}`).toBe(true);
        }
      }
    }
  });

  it("returnt lege lijst voor connector zonder templates", () => {
    expect(getMappingTemplates("twinfield")).toEqual([]);
  });
});
