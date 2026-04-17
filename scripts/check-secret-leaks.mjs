#!/usr/bin/env node
// Faalt als poll-inbox of test-inbox-connection edge functions
// console-logs een IMAP-wachtwoord, username of volledige host.
//
// Draait in CI én lokaal via `npm run check:secret-leaks`.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const TARGETS = [
  "supabase/functions/poll-inbox",
  "supabase/functions/test-inbox-connection",
];

// Flag wanneer een gevoelige IDENTIFIER (geen string literal) in console.X terechtkomt.
// Groep 1, directe arg: console.log(password), console.log(config.password)
// Groep 2, template interpolatie: console.log(`... ${config.password} ...`)
//
// Bewust NIET: statische strings als "no password set" — dat is een bericht, geen waarde.
const FORBIDDEN = [
  // console.X(identifier.password) of console.X(password)
  /console\.(log|error|warn|info|debug)\s*\([^)'"`]*\b(password|credential|imap_password|imap_pass)\b/i,
  // console.X(...`...${...password|secret|credential...}...`...)
  /console\.(log|error|warn|info|debug)[^\n]*\$\{[^}]*\b(password|credential|imap_password|secret)\b[^}]*\}/i,
  // Expliciete property access in log:  config.password / cfg.password / config.username
  /console\.(log|error|warn|info|debug)[^\n]*\b\w+\.(password|username)\b/,
];

let failures = 0;

function walk(dir) {
  const files = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...walk(full));
    else if (/\.(ts|js|mjs)$/.test(entry)) files.push(full);
  }
  return files;
}

for (const target of TARGETS) {
  const files = walk(target);
  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const lines = content.split("\n");
    lines.forEach((line, idx) => {
      for (const pat of FORBIDDEN) {
        if (pat.test(line)) {
          console.error(`LEAK: ${file}:${idx + 1}: ${line.trim()}`);
          failures++;
        }
      }
    });
  }
}

if (failures > 0) {
  console.error(`\n${failures} potentiele secret leak(s) gevonden. Verwijder credentials uit logs.`);
  process.exit(1);
}
console.log("Geen secret leaks gevonden in edge functions.");
