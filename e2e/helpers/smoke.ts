// Helpers voor de exhaustive smoke-test.
//
// Verzamelt per route: console-errors, 4xx/5xx, navigatie- en
// netwerk-timings. Klikt veilige knoppen + sluit dialogs.

import type { Page, Request, Response } from "@playwright/test";

export interface PageReport {
  path: string;
  loadMs: number;
  consoleErrors: string[];
  networkErrors: { url: string; status: number; method: string }[];
  slowRequests: { url: string; durationMs: number }[];
  buttonsClicked: number;
  buttonsSkipped: number;
  dialogsOpened: number;
  finalUrl: string;
  notes: string[];
}

export interface SmokeReport {
  startedAt: string;
  totalMs: number;
  pages: PageReport[];
}

const SLOW_REQUEST_MS = 2000;

const BUTTON_BLOCKLIST = [
  /verwijder/i,
  /delete/i,
  /annule/i,
  /cancel/i,
  /void/i,
  /storneer/i,
  /verzend/i,
  /dispatch/i,
  /publiceer/i,
  /regenereer/i,
  /regenerate/i,
  /uitloggen/i,
  /logout/i,
  /sign\s*out/i,
  /verstuur/i,
  /send/i,
  /opslaan/i,
  /bewaar/i,
  /save/i,
  /aanmaken/i,
  /create/i,
  /betaald/i,
  /factuur/i,
  /uitvoeren/i,
  /bevestig/i,
  /confirm/i,
  /testdata/i,
  /test scenario/i,
  /scenario/i,
  /importeer/i,
  /\.eml/i,
];

const SAFE_TEXT_HINTS = [
  /sluit/i,
  /annuleer/i,
  /terug/i,
  /tab/i,
  /filter/i,
  /sort/i,
  /toon/i,
  /weergave/i,
  /uitvouwen/i,
  /inklappen/i,
  /detail/i,
];

export function isSafeButton(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (BUTTON_BLOCKLIST.some((re) => re.test(t))) return false;
  return true;
}

export function attachListeners(page: Page) {
  const consoleErrors: string[] = [];
  const networkErrors: { url: string; status: number; method: string }[] = [];
  const requestTimings = new Map<Request, number>();
  const slowRequests: { url: string; durationMs: number }[] = [];

  const onConsole = (msg: Parameters<Page["on"]>[1] extends (arg: infer T) => unknown ? T : never) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // Filter ruis: source-map warnings, react-router future flags
      if (/Future Flag|sourcemap|favicon/i.test(text)) return;
      if (/Failed to load resource: the server responded with a status of (400|401|403|404)/i.test(text)) return;
      consoleErrors.push(text.slice(0, 300));
    }
  };
  const onPageError = (err: Error) => {
    consoleErrors.push(`pageerror: ${err.message.slice(0, 300)}`);
  };
  const onRequest = (req: Request) => requestTimings.set(req, Date.now());
  const onRequestFailed = (req: Request) => {
    networkErrors.push({
      url: req.url().slice(0, 200),
      status: 0,
      method: req.method(),
    });
  };
  const onResponse = (res: Response) => {
    const req = res.request();
    const start = requestTimings.get(req);
    if (start) {
      const duration = Date.now() - start;
      if (duration > SLOW_REQUEST_MS && /\/(rest|functions|auth)\/v1\//.test(res.url())) {
        slowRequests.push({ url: res.url().slice(0, 200), durationMs: duration });
      }
    }
    if (res.status() >= 400 && /\/(rest|functions|auth)\/v1\//.test(res.url())) {
      networkErrors.push({
        url: res.url().slice(0, 200),
        status: res.status(),
        method: req.method(),
      });
    }
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("request", onRequest);
  page.on("requestfailed", onRequestFailed);
  page.on("response", onResponse);

  const detach = () => {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("request", onRequest);
    page.off("requestfailed", onRequestFailed);
    page.off("response", onResponse);
  };

  return { consoleErrors, networkErrors, slowRequests, detach };
}

export async function visitAndProbe(
  page: Page,
  path: string,
): Promise<PageReport> {
  const { consoleErrors, networkErrors, slowRequests, detach } = attachListeners(page);
  const start = Date.now();

  let buttonsClicked = 0;
  let buttonsSkipped = 0;
  let dialogsOpened = 0;
  const notes: string[] = [];

  try {
    await page.goto(path, { waitUntil: "networkidle", timeout: 20_000 });
  } catch (e) {
    notes.push(`goto faalde: ${(e as Error).message.slice(0, 150)}`);
  }
  const loadMs = Date.now() - start;

  try {
    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      const body = document.body;
      const scrollWidth = Math.max(root.scrollWidth, body?.scrollWidth ?? 0);
      return {
        scrollWidth,
        clientWidth: root.clientWidth,
        overflowing: scrollWidth > root.clientWidth + 2,
      };
    });
    if (overflow.overflowing) {
      notes.push(`horizontale overflow: ${overflow.scrollWidth}px op ${overflow.clientWidth}px viewport`);
    }
  } catch (e) {
    notes.push(`overflow-check: ${(e as Error).message.slice(0, 150)}`);
  }

  // Klik elke zichtbare safe-button maximaal één keer.
  try {
    const buttons = await page.locator("button:visible, [role='button']:visible").all();
    for (const btn of buttons.slice(0, 25)) {
      const text = (await btn.textContent({ timeout: 500 }).catch(() => ""))?.slice(0, 80) ?? "";
      if (!isSafeButton(text)) {
        buttonsSkipped++;
        continue;
      }
      try {
        await btn.click({ timeout: 1500, trial: false });
        buttonsClicked++;
        // Probeer een geopende dialog te sluiten via Escape, anders Annuleer/Sluit
        const dialogVisible = await page.locator("[role='dialog']:visible").first().isVisible().catch(() => false);
        if (dialogVisible) {
          dialogsOpened++;
          await page.keyboard.press("Escape").catch(() => {});
          await page.waitForTimeout(150);
        }
      } catch {
        buttonsSkipped++;
      }
    }
  } catch (e) {
    notes.push(`buttons-iter: ${(e as Error).message.slice(0, 150)}`);
  }

  const result = {
    path,
    loadMs,
    consoleErrors: dedupe(consoleErrors).slice(0, 10),
    networkErrors: dedupe(networkErrors.map((n) => `${n.method} ${n.status} ${n.url}`))
      .slice(0, 10)
      .map((s) => {
        const [method, status, ...rest] = s.split(" ");
        return { method, status: Number(status), url: rest.join(" ") };
      }),
    slowRequests: slowRequests.slice(0, 10),
    buttonsClicked,
    buttonsSkipped,
    dialogsOpened,
    finalUrl: page.url(),
    notes,
  };
  detach();
  return result;
}

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr.map((v) => JSON.stringify(v)))).map((s) => JSON.parse(s)) as T[];
}

export function summarize(report: SmokeReport): string {
  const total = report.pages.length;
  const withErrors = report.pages.filter((p) => p.consoleErrors.length > 0 || p.networkErrors.length > 0);
  const slowPages = report.pages.filter((p) => p.loadMs > 3000);
  const lines: string[] = [];
  lines.push(`# Smoke-rapport`);
  lines.push(`Gestart: ${report.startedAt}`);
  lines.push(`Totale duur: ${(report.totalMs / 1000).toFixed(1)}s`);
  lines.push(`Routes getest: ${total}`);
  lines.push(`Routes met errors: ${withErrors.length}`);
  lines.push(`Routes > 3s laadtijd: ${slowPages.length}`);
  lines.push("");
  lines.push("| Route | Laad | Console | Netwerk | Traag | Knoppen | Dialogs |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const p of report.pages) {
    lines.push(
      `| ${p.path} | ${p.loadMs}ms | ${p.consoleErrors.length} | ${p.networkErrors.length} | ${p.slowRequests.length} | ${p.buttonsClicked}/${p.buttonsClicked + p.buttonsSkipped} | ${p.dialogsOpened} |`,
    );
  }
  lines.push("");
  if (withErrors.length > 0) {
    lines.push("## Pagina's met errors");
    for (const p of withErrors) {
      lines.push(`### ${p.path}`);
      if (p.consoleErrors.length) {
        lines.push("**Console errors:**");
        for (const e of p.consoleErrors) lines.push(`- ${e}`);
      }
      if (p.networkErrors.length) {
        lines.push("**Network 4xx/5xx:**");
        for (const e of p.networkErrors) lines.push(`- ${e.method} ${e.status} ${e.url}`);
      }
      if (p.slowRequests.length) {
        lines.push("**Trage requests:**");
        for (const e of p.slowRequests) lines.push(`- ${e.durationMs}ms ${e.url}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}
