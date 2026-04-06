import { describe, it, expect, beforeEach } from "vitest";
import i18n from "../i18n";

import nl from "../i18n/locales/nl.json";
import en from "../i18n/locales/en.json";
import de from "../i18n/locales/de.json";
import fr from "../i18n/locales/fr.json";

/** Recursively collect all leaf-key paths from a nested object */
function collectKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      keys.push(...collectKeys(v as Record<string, unknown>, path));
    } else {
      keys.push(path);
    }
  }
  return keys.sort();
}

describe("i18n", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("nl");
  });

  describe("translation files have the same keys", () => {
    const nlKeys = collectKeys(nl);
    const enKeys = collectKeys(en);
    const deKeys = collectKeys(de);
    const frKeys = collectKeys(fr);

    it("EN has the same keys as NL", () => {
      expect(enKeys).toEqual(nlKeys);
    });

    it("DE has the same keys as NL", () => {
      expect(deKeys).toEqual(nlKeys);
    });

    it("FR has the same keys as NL", () => {
      expect(frKeys).toEqual(nlKeys);
    });
  });

  describe("language switching", () => {
    it("defaults to Dutch", () => {
      expect(i18n.language).toBe("nl");
      expect(i18n.t("nav.dashboard")).toBe("Dashboard");
      expect(i18n.t("nav.clients")).toBe("Klanten");
    });

    it("switches to English", async () => {
      await i18n.changeLanguage("en");
      expect(i18n.language).toBe("en");
      expect(i18n.t("nav.clients")).toBe("Clients");
      expect(i18n.t("common.save")).toBe("Save");
    });

    it("switches to German", async () => {
      await i18n.changeLanguage("de");
      expect(i18n.language).toBe("de");
      expect(i18n.t("nav.clients")).toBe("Kunden");
      expect(i18n.t("common.save")).toBe("Speichern");
    });

    it("switches to French", async () => {
      await i18n.changeLanguage("fr");
      expect(i18n.language).toBe("fr");
      expect(i18n.t("nav.clients")).toBe("Clients");
      expect(i18n.t("common.save")).toBe("Enregistrer");
    });
  });

  describe("fallback to Dutch", () => {
    it("falls back to NL for an unsupported language", async () => {
      await i18n.changeLanguage("ja");
      // Should fall back to NL
      expect(i18n.t("nav.dashboard")).toBe("Dashboard");
      expect(i18n.t("nav.clients")).toBe("Klanten");
    });
  });
});
