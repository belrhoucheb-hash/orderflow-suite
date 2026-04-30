// Exhaustive smoke-test: bezoekt elke route, klikt veilige knoppen,
// vangt console-errors, 4xx/5xx en trage requests. Schrijft een
// markdown- en JSON-rapport naar `playwright-report/smoke-*`.
//
// Skipt als E2E_USER_EMAIL / E2E_USER_PASSWORD niet gezet zijn.
//
// Veilige knoppen = niet-destructieve acties (geen verwijder, verzend,
// publiceer, regenereer, factuur, save, etc — zie smoke.ts blocklist).

import { test, expect, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { login } from "./helpers/auth";
import { visitAndProbe, summarize, type SmokeReport } from "./helpers/smoke";

const HAS_CREDENTIALS = Boolean(process.env.E2E_USER_EMAIL && process.env.E2E_USER_PASSWORD) || !process.env.CI;

const PROTECTED_ROUTES = [
  "/",
  "/inbox",
  "/orders",
  "/orders/nieuw",
  "/klanten",
  "/planning",
  "/dispatch",
  "/tracking",
  "/exceptions",
  "/ritten",
  "/chauffeurs",
  "/vloot",
  "/voertuigcheck",
  "/rapportage",
  "/facturatie",
  "/autonomie",
  "/users",
  "/settings",
];

// Detail-routes: voor elke lijst pakken we de eerste rij en testen de
// detail-pagina ook. Selector = wat een Playwright-locator nodig heeft
// om naar het eerste detail te navigeren.
const DETAIL_PROBES: { listPath: string; rowLocator: string; expectedPathPrefix: string }[] = [
  { listPath: "/orders", rowLocator: "a[href^='/orders/']:not([href='/orders/nieuw'])", expectedPathPrefix: "/orders/" },
  { listPath: "/klanten", rowLocator: "a[href^='/klanten/']", expectedPathPrefix: "/klanten/" },
  { listPath: "/vloot", rowLocator: "a[href^='/vloot/']", expectedPathPrefix: "/vloot/" },
  { listPath: "/facturatie", rowLocator: "a[href^='/facturatie/']", expectedPathPrefix: "/facturatie/" },
];

const PUBLIC_ROUTES = ["/login", "/track", "/portal"];

async function probeFirstDetail(
  page: Page,
  probe: typeof DETAIL_PROBES[number],
): Promise<{ path: string; report: Awaited<ReturnType<typeof visitAndProbe>> } | null> {
  await page.goto(probe.listPath, { waitUntil: "networkidle", timeout: 20_000 }).catch(() => {});
  const link = page.locator(probe.rowLocator).first();
  const visible = await link.isVisible({ timeout: 3000 }).catch(() => false);
  if (!visible) return null;
  const href = await link.getAttribute("href").catch(() => null);
  if (!href || !href.startsWith(probe.expectedPathPrefix)) return null;
  const report = await visitAndProbe(page, href);
  return { path: href, report };
}

test.describe("Public routes (geen login)", () => {
  for (const path of PUBLIC_ROUTES) {
    test(`smoke ${path}`, async ({ page }) => {
      const report = await visitAndProbe(page, path);
      // Public routes mogen geen 401/403/500 op API-calls geven en geen
      // console-errors uit eigen code.
      expect.soft(report.consoleErrors, `console-errors op ${path}`).toEqual([]);
      const serverErrors = report.networkErrors.filter((n) => n.status >= 500);
      expect.soft(serverErrors, `5xx op ${path}`).toEqual([]);
    });
  }
});

test.describe("Protected routes (vereist E2E_USER_*)", () => {
  test.skip(!HAS_CREDENTIALS, "E2E_USER_EMAIL / E2E_USER_PASSWORD niet gezet");

  test("exhaustive sweep", async ({ page }) => {
    test.setTimeout(15 * 60 * 1000);
    await login(page);

    const start = Date.now();
    const startedAt = new Date().toISOString();
    const report: SmokeReport = { startedAt, totalMs: 0, pages: [] };

    for (const path of PROTECTED_ROUTES) {
      const r = await visitAndProbe(page, path);
      report.pages.push(r);
    }

    // Diepere coverage: eerste detail per lijst-pagina.
    for (const probe of DETAIL_PROBES) {
      const result = await probeFirstDetail(page, probe);
      if (result) {
        report.pages.push(result.report);
      } else {
        report.pages.push({
          path: `${probe.listPath} (detail)`,
          loadMs: 0,
          consoleErrors: [],
          networkErrors: [],
          slowRequests: [],
          buttonsClicked: 0,
          buttonsSkipped: 0,
          dialogsOpened: 0,
          finalUrl: "",
          notes: ["geen rij gevonden, lijst leeg of selector mismatch"],
        });
      }
    }

    report.totalMs = Date.now() - start;

    const outDir = resolve(process.cwd(), "playwright-report");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, "smoke-report.json"), JSON.stringify(report, null, 2));
    writeFileSync(resolve(outDir, "smoke-report.md"), summarize(report));

    // Soft-assertions: laat rapport altijd schrijven, maar vlag wel.
    for (const p of report.pages) {
      expect.soft(p.consoleErrors, `console-errors op ${p.path}`).toEqual([]);
      const serverErrors = p.networkErrors.filter((n) => n.status >= 500);
      expect.soft(serverErrors, `5xx op ${p.path}`).toEqual([]);
      expect.soft(p.loadMs, `${p.path} laadt te traag`).toBeLessThan(8000);
    }
  });
});
