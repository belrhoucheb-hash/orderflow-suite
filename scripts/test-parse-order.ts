#!/usr/bin/env bun
/**
 * Lokaal test-script voor parse-order extractie-prompt.
 * Leest alle few-shot cases in docs/order-intake-examples, stuurt mail + PDF-samenvatting
 * naar Gemini 2.5 Flash via dezelfde system-prompt als de edge function, en diff't het
 * resultaat tegen de "expected" JSON per case.
 *
 * Gebruik: GEMINI_API_KEY=... bun run scripts/test-parse-order.ts [--filter=<pattern>]
 */

import { readdir, readFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildExtractionSystemPrompt, extractionSchema } from "../supabase/functions/parse-order/_prompt.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXAMPLES_DIR = join(ROOT, "docs", "order-intake-examples");

const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_KEY) {
  console.error("ERROR: GEMINI_API_KEY env var ontbreekt");
  process.exit(1);
}

const filterArg = process.argv.find((a) => a.startsWith("--filter="))?.slice(9) ?? "";

interface Case {
  file: string;
  title: string;
  email: string;
  attachments: string;
  expected: Record<string, any>;
}

function extractBlock(md: string, heading: string): string {
  const re = new RegExp(`##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, "i");
  const m = md.match(re);
  return m ? m[1].trim() : "";
}

function stripFence(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

async function loadCases(): Promise<Case[]> {
  const files = (await readdir(EXAMPLES_DIR))
    .filter((f) => /^\d{2}-.*\.md$/.test(f))
    .filter((f) => !filterArg || f.includes(filterArg))
    .sort();

  const cases: Case[] = [];
  for (const file of files) {
    const raw = await readFile(join(EXAMPLES_DIR, file), "utf8");
    const titleMatch = raw.match(/^#\s+(.+)$/m);
    const email = stripFence(extractBlock(raw, "email"));
    const attachments = extractBlock(raw, "attachments");
    const expectedRaw = stripFence(extractBlock(raw, "expected"));
    let expected: Record<string, any> = {};
    try {
      expected = JSON.parse(expectedRaw);
    } catch (e) {
      console.warn(`⚠ ${file}: expected JSON ongeldig, case overgeslagen (${(e as Error).message})`);
      continue;
    }
    cases.push({
      file,
      title: titleMatch?.[1] ?? file,
      email,
      attachments,
      expected,
    });
  }
  return cases;
}

async function callGemini(systemPrompt: string, userText: string): Promise<any> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-flex:generateContent?key=${GEMINI_KEY}`;
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: extractionSchema,
    },
  };

  for (let attempt = 0; attempt < 4; attempt++) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (resp.status === 429 && attempt < 3) {
      const backoff = Math.pow(2, attempt) * 1500 + Math.random() * 500;
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }
    if (!resp.ok) {
      throw new Error(`Gemini ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    }
    const json = await resp.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Geen content in Gemini response");
    return JSON.parse(text);
  }
  throw new Error("Gemini retry exhausted");
}

function fuzzyMatch(a: string, b: string): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const na = a.toLowerCase().replace(/\s+/g, " ").trim();
  const nb = b.toLowerCase().replace(/\s+/g, " ").trim();
  if (na === nb) return true;
  // eenvoudige containment als fuzzy-heuristiek
  if (na.length > 10 && nb.length > 10 && (na.includes(nb) || nb.includes(na))) return true;
  // Levenshtein < 20% van langste
  const dist = levenshtein(na, nb);
  return dist / Math.max(na.length, nb.length) < 0.2;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function numericMatch(a: number, b: number, tol = 0.05): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)) < tol;
}

function setMatch(a: any[], b: any[]): boolean {
  const sa = new Set((a ?? []).map((x) => String(x).toLowerCase()));
  const sb = new Set((b ?? []).map((x) => String(x).toLowerCase()));
  if (sa.size !== sb.size) return false;
  for (const x of sa) if (!sb.has(x)) return false;
  return true;
}

interface FieldResult { field: string; ok: boolean; expected: any; actual: any; }

function compare(expected: Record<string, any>, actual: Record<string, any>): FieldResult[] {
  const results: FieldResult[] = [];
  const exactFields = ["unit", "transport_type"];
  const stringFields = ["client_name", "pickup_address", "delivery_address", "dimensions", "reference_number", "contact_name"];
  const numericFields = ["weight_kg", "quantity"];
  const dateFields = ["pickup_date", "delivery_date"];
  const arrayFields = ["requirements"];

  for (const f of exactFields) {
    if (expected[f] === undefined || expected[f] === "") continue;
    results.push({ field: f, ok: expected[f] === actual[f], expected: expected[f], actual: actual[f] });
  }
  for (const f of stringFields) {
    if (!expected[f]) continue;
    results.push({ field: f, ok: fuzzyMatch(String(expected[f]), String(actual[f] ?? "")), expected: expected[f], actual: actual[f] });
  }
  for (const f of numericFields) {
    if (!expected[f]) continue;
    results.push({ field: f, ok: numericMatch(expected[f], actual[f] ?? 0), expected: expected[f], actual: actual[f] });
  }
  for (const f of dateFields) {
    if (!expected[f]) continue;
    results.push({ field: f, ok: expected[f] === actual[f], expected: expected[f], actual: actual[f] });
  }
  for (const f of arrayFields) {
    if (!expected[f] || !Array.isArray(expected[f]) || expected[f].length === 0) continue;
    // expected-JSON uses richer enum (DG/Team/...) than current schema — we only check overlap
    const exp = (expected[f] as any[]).map((x) => String(x).toLowerCase());
    const act = (actual[f] ?? []).map((x: any) => String(x).toLowerCase());
    const overlap = exp.some((x) => act.some((y: string) => y.includes(x) || x.includes(y)));
    results.push({ field: f, ok: overlap, expected: expected[f], actual: actual[f] });
  }
  return results;
}

const RESET = "\x1b[0m", GREEN = "\x1b[32m", RED = "\x1b[31m", DIM = "\x1b[2m", YELLOW = "\x1b[33m";

async function runCase(c: Case): Promise<{ case: Case; results: FieldResult[]; confidence: number; error?: string }> {
  const today = new Date().toISOString().split("T")[0];
  const sourceInstructions = c.attachments.trim().length > 20
    ? `Je hebt TWEE bronnen: een e-mail body EN een of meer PDF-bijlagen (hieronder samengevat als tekst, in plaats van de echte PDF). Voor elk veld dat je extraheert, geef aan uit welke bron het komt: "email", "pdf", of "both".`
    : `Alle velden komen uit "email".`;
  const systemPrompt = buildExtractionSystemPrompt({ today, sourceInstructions, aiContextBlock: "" });

  const userText = [
    `E-MAIL BODY:\n${c.email}`,
    c.attachments.trim().length > 20 ? `\nPDF-BIJLAGEN (samenvatting):\n${c.attachments}` : "",
  ].filter(Boolean).join("\n\n");

  try {
    const actual = await callGemini(systemPrompt, userText);
    return { case: c, results: compare(c.expected, actual), confidence: actual.confidence_score ?? 0 };
  } catch (e) {
    return { case: c, results: [], confidence: 0, error: (e as Error).message };
  }
}

function summary(all: Awaited<ReturnType<typeof runCase>>[]) {
  let totalFields = 0, totalOk = 0;
  const failPerField: Record<string, number> = {};
  let passes = 0, errors = 0;

  for (const r of all) {
    if (r.error) { errors++; continue; }
    const ok = r.results.filter((x) => x.ok).length;
    const tot = r.results.length;
    totalOk += ok;
    totalFields += tot;
    const passRate = tot > 0 ? ok / tot : 0;
    if (passRate >= 0.8) passes++;
    for (const fr of r.results) if (!fr.ok) failPerField[fr.field] = (failPerField[fr.field] ?? 0) + 1;
  }

  console.log("\n" + "═".repeat(60));
  console.log(`SUMMARY: ${passes}/${all.length} cases ≥80% match, ${errors} errors`);
  console.log(`Veld-accuracy: ${totalOk}/${totalFields} = ${(100 * totalOk / Math.max(totalFields, 1)).toFixed(1)}%`);
  const avgConf = all.filter((r) => !r.error).reduce((a, r) => a + r.confidence, 0) / Math.max(all.length - errors, 1);
  console.log(`Gemiddelde confidence_score: ${avgConf.toFixed(1)}`);
  const topFails = Object.entries(failPerField).sort(([, a], [, b]) => b - a).slice(0, 5);
  if (topFails.length) {
    console.log(`\nTop mismatches per veld:`);
    for (const [f, n] of topFails) console.log(`  ${f}: ${n}x`);
  }
}

async function main() {
  const cases = await loadCases();
  console.log(`${cases.length} cases geladen. Draait parallel…\n`);
  const started = Date.now();

  const results = await Promise.all(cases.map(runCase));

  for (const r of results) {
    const label = `${r.case.file}`.padEnd(42);
    if (r.error) {
      console.log(`${RED}✗ ERROR${RESET} ${label} ${DIM}${r.error}${RESET}`);
      continue;
    }
    const ok = r.results.filter((x) => x.ok).length;
    const tot = r.results.length;
    const rate = tot > 0 ? ok / tot : 0;
    const color = rate >= 0.8 ? GREEN : rate >= 0.5 ? YELLOW : RED;
    const mark = rate >= 0.8 ? "✓" : "✗";
    console.log(`${color}${mark} ${(ok + "/" + tot).padEnd(5)}${RESET} ${label} conf=${r.confidence}  ${DIM}${r.case.title.slice(0, 40)}${RESET}`);
    for (const fr of r.results.filter((x) => !x.ok)) {
      const e = JSON.stringify(fr.expected)?.slice(0, 50);
      const a = JSON.stringify(fr.actual)?.slice(0, 50);
      console.log(`    ${RED}${fr.field}${RESET}: ${DIM}exp=${e}${RESET} ${DIM}got=${a}${RESET}`);
    }
  }

  summary(results);
  console.log(`\nDuur: ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch((e) => { console.error(e); process.exit(1); });
