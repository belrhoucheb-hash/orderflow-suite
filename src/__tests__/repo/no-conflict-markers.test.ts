import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Repo-guard: detecteert achtergebleven git-conflict-markers in source-files.
 *
 * PR #21 en #30 hadden in production builds gefaald omdat <<<<<<< / =======
 * tot ver in main belandden, onzichtbaar in PR-reviews. Deze test vangt het
 * af op CI voordat het naar Vercel pusht.
 */

const ROOT = join(fileURLToPath(import.meta.url), "../../../..");
const INCLUDE_DIRS = ["src", "supabase/functions", "supabase/migrations"];
const EXCLUDE_DIRS = new Set(["node_modules", "dist", "build", ".next", ".turbo", ".vite", "__bench__"]);
const SKIP_FILES = new Set([
  // Deze repo-guard-test bevat de patronen zelf als regex-source.
  relative(ROOT, fileURLToPath(import.meta.url)).replace(/\\/g, "/"),
]);
const TEXT_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".sql", ".css", ".scss",
  ".json", ".md", ".yaml", ".yml",
  ".html",
]);

const MARKER_PATTERNS = [
  /^<{7}\s/m,
  /^={7}$/m,
  /^>{7}\s/m,
];

interface Hit {
  file: string;
  line: number;
  match: string;
}

function walk(dir: string, hits: Hit[]) {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (EXCLUDE_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full, hits);
      continue;
    }
    const ext = name.slice(name.lastIndexOf("."));
    if (!TEXT_EXT.has(ext)) continue;
    const rel = relative(ROOT, full).replace(/\\/g, "/");
    if (SKIP_FILES.has(rel)) continue;

    let content: string;
    try {
      content = readFileSync(full, "utf8");
    } catch {
      continue;
    }
    if (!content) continue;
    const lines = content.split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const pattern of MARKER_PATTERNS) {
        if (pattern.test(line)) {
          hits.push({ file: rel, line: i + 1, match: line.slice(0, 80) });
          break;
        }
      }
    });
  }
}

describe("repo: no merge-conflict-markers in source files", () => {
  it("scans src + supabase folders and rejects <<<<<<< ======= >>>>>>>", () => {
    const hits: Hit[] = [];
    for (const sub of INCLUDE_DIRS) {
      walk(join(ROOT, sub), hits);
    }
    if (hits.length > 0) {
      const formatted = hits
        .map((h) => `  ${h.file}:${h.line}  ${h.match}`)
        .join("\n");
      throw new Error(
        `Conflict-markers gevonden in ${hits.length} regel(s). Resolve voor commit:\n${formatted}`,
      );
    }
    expect(hits.length).toBe(0);
  });
});
