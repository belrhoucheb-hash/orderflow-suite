#!/usr/bin/env node
// Faalt als twee of meer migration-files in supabase/migrations/ dezelfde
// 14-char timestamp-prefix delen.
//
// Achtergrond: Supabase past migraties toe op alfabetische volgorde van
// bestandsnaam. PR #23 (en eerder PR #21 + #30) lieten zien dat parallelle
// branches dezelfde timestamp kunnen kiezen, waardoor een `db push` één
// migratie negeert en de andere uitvoert. Symptomen: kolommen die nooit
// aankomen, "table already exists" bij re-deploy, vage RLS-fouten.
//
// Dit script draait lokaal via `npm run lint:migrations` en ook via de
// repo-test in src/__tests__/repo/no-migration-collisions.test.ts zodat
// CI het mee oppakt zonder extra job-config.

import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "supabase", "migrations");

const PREFIX_LEN = 14; // YYYYMMDDHHMMSS

const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const byPrefix = new Map();
for (const name of files) {
  const prefix = name.slice(0, PREFIX_LEN);
  if (!/^\d{14}$/.test(prefix)) continue; // sla niet-conforme namen over
  if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
  byPrefix.get(prefix).push(name);
}

const collisions = [...byPrefix.entries()].filter(([, names]) => names.length > 1);

if (collisions.length === 0) {
  console.log(`OK: ${files.length} migraties, geen prefix-collisies.`);
  process.exit(0);
}

console.error("Migratie-prefix-collisie(s) gevonden:");
for (const [prefix, names] of collisions) {
  console.error(`  ${prefix}:`);
  for (const n of names) console.error(`    , ${n}`);
}
console.error(
  "\nLos op door één van de bestanden te hernoemen met een unieke timestamp.",
);
process.exit(1);
