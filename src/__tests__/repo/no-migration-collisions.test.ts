import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

// Repo-test, hoort niet bij een feature maar bewaakt structurele invarianten.
// Dezelfde check zit ook in scripts/check-migration-collisions.mjs zodat
// `npm run lint:migrations` lokaal hetzelfde resultaat geeft.
//
// Achtergrond: parallelle PR's die elk een nieuwe migratie toevoegen kunnen
// per ongeluk dezelfde 14-char timestamp-prefix kiezen. Supabase past
// migraties toe op alfabetische volgorde van bestandsnaam, dus bij
// gelijke prefix is de toepass-volgorde niet langer deterministisch en
// kan één van beide stilletjes worden overgeslagen.

const PREFIX_LEN = 14;
const migrationsDir = resolve(__dirname, "../../../supabase/migrations");

describe("supabase/migrations prefix-uniqueness", () => {
  it("heeft geen twee migraties met dezelfde 14-char timestamp-prefix", () => {
    const files = readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort();

    const byPrefix = new Map<string, string[]>();
    for (const name of files) {
      const prefix = name.slice(0, PREFIX_LEN);
      if (!/^\d{14}$/.test(prefix)) continue;
      const list = byPrefix.get(prefix) ?? [];
      list.push(name);
      byPrefix.set(prefix, list);
    }

    const collisions = [...byPrefix.entries()].filter(([, names]) => names.length > 1);
    if (collisions.length > 0) {
      const summary = collisions
        .map(([prefix, names]) => `${prefix}: ${names.join(", ")}`)
        .join("\n");
      throw new Error(`Migratie-prefix-collisie(s):\n${summary}`);
    }
    expect(collisions.length).toBe(0);
  });
});
